package engine

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sync"
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
	EventPeerOnline      = "peer_online"       // 新用户上线
	EventPeerOffline     = "peer_offline"      // 用户下线/超时
	EventPeerUpdate      = "peer_update"       // 昵称/状态/部门变更
	EventMessage         = "message"           // 收到文本消息
	EventReceipt         = "receipt"           // 对方回执（已送达）
	EventTyping          = "typing"            // 对方正在输入
	EventFileRequest     = "file_request"      // 对方发来文件请求
	EventFileProgress    = "file_progress"     // 传输进度
	EventFileDone        = "file_done"         // 传输完成
	EventEngineError     = "error"             // 引擎错误（发往 UI 提示）
)

// Peer 描述局域网内的一个其他用户。
type Peer struct {
	Nick     string    // 昵称
	Host     string    // 主机名
	IP       string    // 来源地址（形如 192.168.1.23）
	Dept     string    // 部门/分组（飞联扩展字段）
	Status   string    // online | busy | away | offline
	LastSeen time.Time // 最后一次收到报文的时间
}

// Event 是引擎推给 UI 的事件。字段按 Type 取用，其余为零值。
type Event struct {
	Type   string
	Peer   Peer
	MsgID  string // 我方报文 PacketNo 的字符串形式（回执匹配用）
	Text   string // 文本内容 / 错误信息
	Time   time.Time
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
	cfg   Config
	out   chan Event
	quit  chan struct{}
	once  sync.Once
	conn  *net.UDPConn // UDP 套接字（Start 建立，Stop 关闭）
	bcast []net.IP     // 各网段定向广播地址，广播时逐个发送
}

// New 创建引擎。events 缓冲建议不小于 64。
func New(cfg Config, events chan Event) *Engine {
	if cfg.Port == 0 {
		cfg.Port = 2425
	}
	if cfg.Status == "" {
		cfg.Status = StatusOnline
	}
	return &Engine{cfg: cfg, out: events, quit: make(chan struct{})}
}

// Events 返回事件通道（UI 的订阅入口）。
func (e *Engine) Events() <-chan Event { return e.out }

// Start 启动引擎：建立 UDP 套接字后立即返回，内部循环跑在后台 goroutine。
func (e *Engine) Start() error {
	conn, bcast, err := listenUDP(e.cfg.Port)
	if err != nil {
		return fmt.Errorf("engine: 监听 UDP %d 失败: %w", e.cfg.Port, err)
	}
	e.conn, e.bcast = conn, bcast

	// TODO(T-M1-2) 读循环与发现：
	//   - 启动即广播 CmdBrEntry，收到他人 Entry 时单播回 CmdAnsEntry；
	//   - 定时心跳（CmdNoOperation），超时未见的 Peer 按 EventPeerOffline 下线；
	//   - 实测广播回环会把包投递给同端口的所有 socket（含发送者自己），
	//     读循环必须按 nick/host 过滤自己发出的报文。
	//
	// TODO(T-M1-3) 用户表：peers map + 读写锁，Peers() 返回快照。
	// TODO(T-M1-4) 文本消息：UDP 直发 CmdSendMsg|OptSendCheck，收到后回 CmdRecvMsg。
	return nil
}

// Stop 停止引擎：广播 CmdBrExit 下线包并结束内部循环。
// TODO(T-M1-2)：实现退出包广播。
func (e *Engine) Stop() {
	e.once.Do(func() { close(e.quit) })
	if e.conn != nil {
		e.conn.Close()
	}
}

// SendText 向指定 IP 发送文本消息。
// TODO(T-M1-4)
func (e *Engine) SendText(ip, text string) error { return nil }

// BroadcastText 向全网段发送广播消息（255.255.255.255 与本网段定向广播）。
// TODO(T-M1-4)
func (e *Engine) BroadcastText(text string) error { return nil }

// Peers 返回当前在线用户快照。
// TODO(T-M1-3)
func (e *Engine) Peers() []Peer { return nil }

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

// broadcast 向本机各网段定向广播地址发送一份报文，并以受限广播
// 255.255.255.255 兜底覆盖极端网络环境；只返回首个发送失败。
func (e *Engine) broadcast(b []byte) error {
	if e.conn == nil {
		return ErrNotStarted
	}
	var firstErr error
	for _, ip := range e.bcast {
		if _, err := e.conn.WriteToUDP(b, &net.UDPAddr{IP: ip, Port: e.cfg.Port}); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	// 受限广播兜底，覆盖枚举不到定向广播地址的极端环境
	if _, err := e.conn.WriteToUDP(b, &net.UDPAddr{IP: net.IPv4bcast, Port: e.cfg.Port}); err != nil && firstErr == nil {
		firstErr = err
	}
	return firstErr
}
