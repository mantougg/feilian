package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// 用户状态（Peer.Status 取值）。
const (
	StatusOnline  = "online"
	StatusBusy    = "busy"
	StatusAway    = "away"
	StatusOffline = "offline"
)

// 引擎事件类型（Event.Type 取值）。
const (
	EventPeerOnline   = "peer_online"   // 新用户上线
	EventPeerOffline  = "peer_offline"  // 用户下线/超时
	EventPeerUpdate   = "peer_update"   // 昵称/状态/部门变更
	EventMessage      = "message"       // 收到文本消息
	EventReceipt      = "receipt"       // 对方回执（已送达）
	EventTyping       = "typing"        // 对方正在输入
	EventFileRequest  = "file_request"  // 对方发来文件请求
	EventFileProgress = "file_progress" // 传输进度
	EventFileDone     = "file_done"     // 传输完成
	EventEngineError  = "error"         // 引擎错误（发往 UI 提示）
)

// Peer 描述局域网内的一个其他用户。
type Peer struct {
	Nick     string    `json:"nick"`     // 昵称
	Host     string    `json:"host"`     // 主机名
	IP       string    `json:"ip"`       // 来源地址（形如 192.168.1.23）
	Port     int       `json:"port"`     // 对方实际监听端口（标准部署恒 2425；同机联调双开端口不同）
	Dept     string    `json:"dept"`     // 部门/分组（飞联扩展字段）
	Status   string    `json:"status"`   // online | busy | away | offline
	LastSeen time.Time `json:"lastSeen"` // 最后一次收到报文的时间
}

// Event 是引擎推给 UI 的事件。字段按 Type 取用，其余为零值。
type Event struct {
	Type  string    `json:"type"`
	Peer  Peer      `json:"peer"`
	MsgID string    `json:"msgId"` // 我方报文 PacketNo 的字符串形式（回执匹配用）
	Text  string    `json:"text"`  // 文本内容 / 错误信息
	Time  time.Time `json:"time"`
}

// Config 引擎配置（M1 由 app.go 从本地配置读取，M4-T 持久化）。
type Config struct {
	Nick     string // 我的昵称
	Hostname string // 我的主机名
	Dept     string // 我的部门
	Status   string // online | busy | away
	Port     int    // 默认 2425
}

// ErrNotStarted 表示引擎尚未 Start，网络操作不可用。
var ErrNotStarted = errors.New("engine: not started")

// Engine 是网络引擎门面，M1 逐任务实现。
type Engine struct {
	cfg      Config
	out      chan Event
	quit     chan struct{}
	once     sync.Once
	conn     *net.UDPConn  // UDP 套接字（Start 建立，Stop 关闭）
	bcast    []net.IP      // 各网段定向广播地址，广播时逐个发送
	packetNo atomic.Uint64 // 出站报文序号（回执匹配的唯一凭据）
	peers    map[string]Peer
	peersMu  sync.RWMutex
}

// New 创建引擎。events 缓冲建议不小于 64。
func New(cfg Config, events chan Event) *Engine {
	if cfg.Port == 0 {
		cfg.Port = 2425
	}
	if cfg.Status == "" {
		cfg.Status = StatusOnline
	}
	return &Engine{cfg: cfg, out: events, quit: make(chan struct{}), peers: make(map[string]Peer)}
}

// Events 返回事件通道（UI 的订阅入口）。
func (e *Engine) Events() <-chan Event { return e.out }

// Self 返回本机当前资料快照。
func (e *Engine) Self() Config { return e.cfg }

// SetSelf 更新本机资料（昵称/部门/状态）并重新广播上线，让全网刷新；
// 留空字段保持不变，非法状态值忽略。
func (e *Engine) SetSelf(nick, dept, status string) {
	if nick != "" {
		e.cfg.Nick = nick
	}
	if dept != "" {
		e.cfg.Dept = dept
	}
	switch status {
	case StatusOnline, StatusBusy, StatusAway:
		e.cfg.Status = status
	}
	e.broadcastPresence(CmdBrEntry)
}

// heartbeatInterval 是心跳周期；offlineTimeout 内收不到任何报文即判离线。
const (
	heartbeatInterval = 30 * time.Second
	offlineTimeout    = 3 * heartbeatInterval // 连续错过 3 次心跳视为异常掉线
	sweepInterval     = 15 * time.Second      // 超时清扫周期
)

// Start 启动引擎：建立 UDP 套接字、进入读循环并广播上线，立即返回。
func (e *Engine) Start() error {
	conn, bcast, err := listenUDP(e.cfg.Port)
	if err != nil {
		return fmt.Errorf("engine: 监听 UDP %d 失败: %w", e.cfg.Port, err)
	}
	e.conn, e.bcast = conn, bcast

	go e.readLoop()
	go e.sweepLoop()
	e.broadcastPresence(CmdBrEntry)
	go e.heartbeatLoop()

	return nil
}

// Stop 停止引擎：先广播 CmdBrExit 下线包，再结束内部循环并关闭套接字。
func (e *Engine) Stop() {
	e.once.Do(func() {
		e.broadcastPresence(CmdBrExit)
		close(e.quit)
		if e.conn != nil {
			e.conn.Close()
		}
	})
}

// presenceExtra 是飞联在 Entry/AnsEntry 报文 extra 里携带的 JSON 扩展信息；
// 飞秋/飞鸽会忽略无法识别的 extra 内容（T-M1-7 互通时复核）。
type presenceExtra struct {
	Dept   string `json:"dept,omitempty"`
	Status string `json:"status,omitempty"`
}

// broadcastPresence 广播一条携带本机扩展信息的 Presence 类报文（Entry/Exit/心跳）。
func (e *Engine) broadcastPresence(cmd uint32) {
	extra := ""
	if cmd == CmdBrEntry {
		b, err := json.Marshal(presenceExtra{Dept: e.cfg.Dept, Status: e.cfg.Status})
		if err == nil {
			extra = string(b)
		}
	}
	e.broadcastPacket(cmd, extra)
}

// heartbeatLoop 每 heartbeatInterval 广播一次 CmdNoOperation 维持在线可见。
func (e *Engine) heartbeatLoop() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-e.quit:
			return
		case <-ticker.C:
			e.broadcastPacket(CmdNoOperation, "")
		}
	}
}

// readLoop 阻塞读取 UDP 报文并分发，直到套接字关闭。
func (e *Engine) readLoop() {
	buf := make([]byte, 4096)
	for {
		n, from, err := e.conn.ReadFromUDP(buf)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			continue // 暂时性读错误（如缓冲溢出），不终止循环
		}
		pkt, ok := ParsePacket(string(buf[:n]))
		if !ok {
			continue
		}
		// 广播回环会把本机发出的包投递回自己，按 nick/host 过滤
		if pkt.Nick == e.cfg.Nick && pkt.Host == e.cfg.Hostname {
			continue
		}
		e.handlePacket(pkt, from)
	}
}

// handlePacket 按命令码分发已解析的报文。
func (e *Engine) handlePacket(pkt Packet, from *net.UDPAddr) {
	// 飞联扩展码（0x1001/0x1002）本体落在选项位区间（0x1000 = OptNoPopup），
	// 必须先按完整值精确匹配，再走标准命令的掩码剥离；
	// 顺序不可颠倒，否则 typing 会被剥成 CmdBrEntry。
	switch pkt.Command {
	case CmdFeiLinkTyping:
		e.emit(Event{Type: EventTyping, Peer: Peer{Nick: pkt.Nick, Host: pkt.Host, IP: from.IP.String()}, Time: time.Now()})
		return
	case CmdFeiLinkGroupMsg:
		// T-M5-2 群聊：M2 阶段按普通消息呈现
		e.handleSendMsg(pkt, from)
		return
	}
	switch pkt.Command &^ (OptSendCheck | OptSecret | OptBroadcast | OptMulticast | OptNoPopup) {
	case CmdBrEntry:
		_, _ = e.sendPacket(CmdAnsEntry, e.presenceJSON(), from)
		e.upsertPresence(pkt, from)
	case CmdAnsEntry:
		e.upsertPresence(pkt, from)
	case CmdBrExit:
		e.removePeer(pkt)
	case CmdBrAbsence:
		e.applyAbsence(pkt, from)
	case CmdNoOperation:
		e.refreshPeer(pkt, from)
	case CmdSendMsg:
		e.handleSendMsg(pkt, from)
	case CmdRecvMsg:
		// 回执发送者 = 消息接收者，报文源地址带其真实监听端口；
		// 建档后我方纯 IP 发送即可查表命中（同机双开端口不同的联调依赖此路径）
		e.upsertPresence(pkt, from)
		e.emit(Event{Type: EventReceipt, MsgID: pkt.Extra, Time: time.Now()})
	default:
		// 未知命令静默忽略，保持与异构客户端（飞秋/飞鸽）兼容
	}
}

// SendTyping 向指定地址发送「正在输入」提示（飞联扩展码，无回执、尽力而为）。
func (e *Engine) SendTyping(dst string) error {
	ip, port, err := e.resolveAddr(dst)
	if err != nil {
		return err
	}
	_, err = e.sendPacket(CmdFeiLinkTyping, "", &net.UDPAddr{IP: ip, Port: port})
	return err
}

// handleSendMsg 处理收到的文本消息：先建档/刷新（发消息者必在线，
// 未记录用户借此入表——广播不可达的同机双开端口语境依赖此路径），
// 要求回执时回 CmdRecvMsg，再推 EventMessage。
func (e *Engine) handleSendMsg(pkt Packet, from *net.UDPAddr) {
	e.upsertPresence(pkt, from)
	if pkt.HasOpt(OptSendCheck) {
		_, _ = e.sendPacket(CmdRecvMsg, strconv.FormatUint(pkt.PacketNo, 10), from)
	}
	peer := Peer{Nick: pkt.Nick, Host: pkt.Host, IP: from.IP.String(), Port: from.Port}
	if p, ok := e.peerInfo(peerKey(pkt.Nick, pkt.Host)); ok {
		peer.Dept, peer.Status = p.Dept, p.Status
	}
	e.emit(Event{
		Type:  EventMessage,
		Peer:  peer,
		MsgID: strconv.FormatUint(pkt.PacketNo, 10),
		Text:  DecodeExtra(pkt.Extra), // 飞秋报文可能是 GBK，按首包探测解码
		Time:  time.Now(),
	})
}

// peerInfo 查用户表补全消息发送者的部门/状态（未发现过时留空）。
func (e *Engine) peerInfo(key string) (Peer, bool) {
	e.peersMu.RLock()
	defer e.peersMu.RUnlock()
	p, ok := e.peers[key]
	return p, ok
}

// presenceJSON 序列化本机扩展信息， marshal 失败时退化为空 extra。
func (e *Engine) presenceJSON() string {
	b, err := json.Marshal(presenceExtra{Dept: e.cfg.Dept, Status: e.cfg.Status})
	if err != nil {
		return ""
	}
	return string(b)
}

// peerKey 用户表主键：同机双开（host 相同）靠昵称区分。
func peerKey(nick, host string) string { return nick + "@" + host }

// parsePresence 解析扩展 JSON；非 JSON 内容（如飞秋报文）静默得到零值。
func parsePresence(extra string) presenceExtra {
	var px presenceExtra
	_ = json.Unmarshal([]byte(extra), &px)
	return px
}

// upsertPresence 处理 Entry/AnsEntry：新增用户推 peer_online，
// 已知用户部门/状态变化推 peer_update，其余只刷新 LastSeen。
func (e *Engine) upsertPresence(pkt Packet, from *net.UDPAddr) {
	px := parsePresence(pkt.Extra)
	// Status 兜底 online：解析失败或对端未携带时按在线处理
	if px.Status == "" {
		px.Status = StatusOnline
	}
	key := peerKey(pkt.Nick, pkt.Host)
	now := time.Now()

	e.peersMu.Lock()
	old, existed := e.peers[key]
	e.peers[key] = Peer{
		Nick: pkt.Nick, Host: pkt.Host, IP: from.IP.String(), Port: from.Port,
		Dept: px.Dept, Status: px.Status, LastSeen: now,
	}
	e.peersMu.Unlock()

	if !existed {
		e.emit(Event{Type: EventPeerOnline, Peer: e.peersSnapshotOf(key), Time: now})
		return
	}
	if old.Dept != px.Dept || old.Status != px.Status {
		e.emit(Event{Type: EventPeerUpdate, Peer: e.peersSnapshotOf(key), Time: now})
	}
}

// refreshPeer 处理心跳：只刷新 LastSeen，不产生事件。
func (e *Engine) refreshPeer(pkt Packet, from *net.UDPAddr) {
	key := peerKey(pkt.Nick, pkt.Host)
	e.peersMu.Lock()
	if p, ok := e.peers[key]; ok {
		p.IP, p.Port, p.LastSeen = from.IP.String(), from.Port, time.Now()
		e.peers[key] = p
	}
	e.peersMu.Unlock()
	// 未记录的心跳来源不建档：等它的 Entry/AnsEntry 带上完整资料再入库
}

// applyAbsence 处理状态变更广播：未知用户忽略，已知用户映射状态后推 peer_update。
func (e *Engine) applyAbsence(pkt Packet, from *net.UDPAddr) {
	px := parsePresence(pkt.Extra)
	switch px.Status {
	case StatusOnline, StatusBusy, StatusAway:
	default:
		return // 非法/未携带状态（如飞秋自定义串），M1 不猜
	}
	key := peerKey(pkt.Nick, pkt.Host)
	e.peersMu.Lock()
	p, ok := e.peers[key]
	if ok && (p.Status != px.Status || p.IP != from.IP.String() || p.Port != from.Port) {
		p.Status, p.IP, p.Port, p.LastSeen = px.Status, from.IP.String(), from.Port, time.Now()
		e.peers[key] = p
	}
	e.peersMu.Unlock()
	if ok {
		e.emit(Event{Type: EventPeerUpdate, Peer: p, Time: time.Now()})
	}
}

// removePeer 处理下线广播：从表中移除并推 peer_offline。
func (e *Engine) removePeer(pkt Packet) {
	key := peerKey(pkt.Nick, pkt.Host)
	e.peersMu.Lock()
	p, ok := e.peers[key]
	delete(e.peers, key)
	e.peersMu.Unlock()
	if ok {
		p.LastSeen = time.Now()
		e.emit(Event{Type: EventPeerOffline, Peer: p, Time: time.Now()})
	}
}

// sweepLoop 周期清扫：超时未见报文的用户判离线（异常掉线无 CmdBrExit 的兜底）。
func (e *Engine) sweepLoop() {
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-e.quit:
			return
		case <-ticker.C:
			e.sweepPeers()
		}
	}
}

// sweepPeers 单次清扫，返回因超时移除的用户数（测试用）。
func (e *Engine) sweepPeers() int {
	cutoff := time.Now().Add(-offlineTimeout)
	e.peersMu.Lock()
	var gone []Peer
	for k, p := range e.peers {
		if p.LastSeen.Before(cutoff) {
			gone = append(gone, p)
			delete(e.peers, k)
		}
	}
	e.peersMu.Unlock()
	for _, p := range gone {
		e.emit(Event{Type: EventPeerOffline, Peer: p, Time: time.Now()})
	}
	return len(gone)
}

// peersSnapshotOf 取锁内某个用户的最新快照（emit 在锁外，取值须在锁内完成）。
func (e *Engine) peersSnapshotOf(key string) Peer {
	e.peersMu.RLock()
	defer e.peersMu.RUnlock()
	return e.peers[key]
}

// emit 推送事件；通道满时丢弃（订阅方阻塞不应拖垮引擎）。
func (e *Engine) emit(ev Event) {
	select {
	case e.out <- ev:
	default:
	}
}

// sendPacket 单播一条报文到指定地址，返回报文 PacketNo 字符串。
func (e *Engine) sendPacket(cmd uint32, extra string, dst *net.UDPAddr) (string, error) {
	if e.conn == nil {
		return "", ErrNotStarted
	}
	pkt := Packet{Version: ProtocolVersion, PacketNo: e.nextPacketNo(), Nick: e.cfg.Nick, Host: e.cfg.Hostname, Command: cmd, Extra: extra}
	_, err := e.conn.WriteToUDP([]byte(pkt.Encode()), dst)
	return strconv.FormatUint(pkt.PacketNo, 10), err
}

// broadcastPacket 广播一条报文到所有网段。
func (e *Engine) broadcastPacket(cmd uint32, extra string) error {
	if e.conn == nil {
		return ErrNotStarted
	}
	pkt := Packet{Version: ProtocolVersion, PacketNo: e.nextPacketNo(), Nick: e.cfg.Nick, Host: e.cfg.Hostname, Command: cmd, Extra: extra}
	return e.broadcast([]byte(pkt.Encode()))
}

// nextPacketNo 生成进程内唯一的报文序号（以 unix 秒起步，接近 IPMsg 原语义）。
func (e *Engine) nextPacketNo() uint64 {
	if e.packetNo.Load() == 0 {
		e.packetNo.Store(uint64(time.Now().Unix()))
	}
	return e.packetNo.Add(1)
}

// SendText 向指定地址发送文本消息（单播，要求回执），返回报文 PacketNo
// 字符串——UI 以它作为消息 id，receipt 事件据此标记「已送达」。
// dst 支持 "ip"（端口自动查用户表，未命中用协议端口）与 "ip:port" 两种形式。
func (e *Engine) SendText(dst, text string) (string, error) {
	ip, port, err := e.resolveAddr(dst)
	if err != nil {
		return "", err
	}
	msgID, err := e.sendPacket(CmdSendMsg|OptSendCheck, text, &net.UDPAddr{IP: ip, Port: port})
	return msgID, err
}

// resolveAddr 解析目标地址：显式 "ip:port" 直用；纯 "ip" 时优先取用户表中
// 该 IP 记录的实际监听端口（同机联调双开端口不同），未命中退回协议端口。
func (e *Engine) resolveAddr(dst string) (net.IP, int, error) {
	if host, sp, err := net.SplitHostPort(dst); err == nil {
		ip := net.ParseIP(host).To4()
		port, perr := strconv.Atoi(sp)
		if ip == nil || perr != nil || port <= 0 || port > 65535 {
			return nil, 0, fmt.Errorf("engine: 无效地址 %q", dst)
		}
		return ip, port, nil
	}
	ip := net.ParseIP(dst).To4()
	if ip == nil {
		return nil, 0, fmt.Errorf("engine: 无效 IP %q", dst)
	}
	port := 0
	e.peersMu.RLock()
	for _, p := range e.peers {
		if p.IP == dst && p.Port > 0 {
			port = p.Port
			break
		}
	}
	e.peersMu.RUnlock()
	if port == 0 {
		port = e.cfg.Port
	}
	return ip, port, nil
}

// BroadcastText 向全网段广播文本消息。广播不要求回执（避免全网回执风暴）。
func (e *Engine) BroadcastText(text string) error {
	return e.broadcastPacket(CmdSendMsg|OptBroadcast, text)
}

// Peers 返回当前在线用户快照（拷贝，调用方可安全读写）。
func (e *Engine) Peers() []Peer {
	e.peersMu.RLock()
	defer e.peersMu.RUnlock()
	out := make([]Peer, 0, len(e.peers))
	for _, p := range e.peers {
		out = append(out, p)
	}
	return out
}

// listenUDP 绑定 UDP 端口，返回套接字与本机各网段的定向广播地址。
//
// Windows 上直接对广播地址 WriteTo 会被系统拒绝，必须经 Control 回调
// 设置 SO_BROADCAST；SO_REUSEADDR 让同机多实例（联调双开）共用同一端口，
// 与飞秋/飞鸽「每进程绑定 2425」的行为一致。
func listenUDP(port int) (*net.UDPConn, []net.IP, error) {
	lc := net.ListenConfig{
		Control: func(_, _ string, c syscall.RawConn) error {
			var serr error
			if cerr := c.Control(func(fd uintptr) {
				// 目标平台为 Windows，SetsockoptInt 接收 syscall.Handle
				serr = syscall.SetsockoptInt(syscall.Handle(fd), syscall.SOL_SOCKET, syscall.SO_BROADCAST, 1)
				if serr != nil {
					return
				}
				serr = syscall.SetsockoptInt(syscall.Handle(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			}); cerr != nil {
				return cerr
			}
			return serr
		},
	}
	conn, err := lc.ListenPacket(context.Background(), "udp4", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, nil, err
	}
	udp, ok := conn.(*net.UDPConn)
	if !ok {
		conn.Close()
		return nil, nil, fmt.Errorf("engine: 期望 *net.UDPConn，得到 %T", conn)
	}
	bcast, err := broadcastAddrs()
	if err != nil {
		udp.Close()
		return nil, nil, err
	}
	return udp, bcast, nil
}

// broadcastAddrs 枚举启用中、支持广播的网卡，返回每个 IPv4 网段的定向广播地址。
// 只发 255.255.255.255 在多网卡 / 跨路由环境下不可达，必须逐网段定向广播。
func broadcastAddrs() ([]net.IP, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	var out []net.IP
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagBroadcast == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			if b := directedBroadcast(ipnet); b != nil {
				out = append(out, b)
			}
		}
	}
	return out, nil
}

// directedBroadcast 由 IP 与掩码计算定向广播地址（网络地址 | 反掩码）；
// 非 IPv4（如 IPv6）返回 nil。接口地址解析出的掩码可能是 16 字节的
// IPv4-mapped 形式，统一裁回 4 字节再运算。
func directedBroadcast(n *net.IPNet) net.IP {
	ip := n.IP.To4()
	if ip == nil {
		return nil
	}
	mask := n.Mask
	if len(mask) == 16 {
		mask = mask[12:]
	}
	if len(mask) != 4 {
		return nil
	}
	b := make(net.IP, len(ip))
	for i := range ip {
		b[i] = ip[i] | ^mask[i]
	}
	return b
}

// broadcast 向本机各网段定向广播地址发送报文，并以受限广播
// 255.255.255.255 兜底覆盖极端网络环境；只返回首个发送失败。
// 目的端口取「本机协议端口 + 套接字实际绑定端口」去重集合：
// 标准部署两者同为 2425 发一份；同机联调双开端口号不同时两份都发，
// 让另一实例能收到广播。
func (e *Engine) broadcast(b []byte) error {
	if e.conn == nil {
		return ErrNotStarted
	}
	ports := []int{e.cfg.Port}
	if bind := e.conn.LocalAddr().(*net.UDPAddr).Port; bind != e.cfg.Port {
		ports = append(ports, bind)
	}
	var firstErr error
	for _, ip := range e.bcast {
		for _, port := range ports {
			if _, err := e.conn.WriteToUDP(b, &net.UDPAddr{IP: ip, Port: port}); err != nil && firstErr == nil {
				firstErr = err
			}
		}
	}
	// 受限广播兜底，覆盖枚举不到定向广播地址的极端环境
	for _, port := range ports {
		if _, err := e.conn.WriteToUDP(b, &net.UDPAddr{IP: net.IPv4bcast, Port: port}); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
