package engine

import (
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

// 云桌面实拍样例（诊断样例区 hex 解码还原，64B 截断）：
// 飞秋原生心跳，来自两台不同机器，昵称同为 Windows 登录名 Administrator。
const (
	feiqSample1 = "1_lbt6_03#128#FEFFCFAFAC#0#34001#9:17933#c3456:Administrator#:"
	feiqSample2 = "1_lbt6_40#128#FEFFCFAFAC#1E6A7#0#34001#9:17933304315338387:Administrator#:extra"
)

// 验收：飞秋原生格式解析出命令码与昵称；64B 截断、缺尾字段仍可解析。
func TestParseFeiqNative(t *testing.T) {
	for name, raw := range map[string]string{
		"实拍样例1":  feiqSample1,
		"实拍样例2":  feiqSample2,
		"末尾截断":   feiqSample1[:len(feiqSample1)-1], // 去掉最后的 ':'
		"截断到昵称后": feiqSample2[:strings.LastIndex(feiqSample2, "Administrator")+len("Administrator")+1],
	} {
		fq, ok := ParseFeiqNative(raw)
		if !ok {
			t.Fatalf("%s: 解析失败", name)
		}
		if fq.Command != 34001 || fq.Nick != "Administrator" {
			t.Fatalf("%s: %+v", name, fq)
		}
	}
	if _, ok := ParseFeiqNative("1:100:甲:PC-A:1:x"); ok {
		t.Fatalf("标准 IPMsg 报文不应命中飞秋解析")
	}
	if _, ok := ParseFeiqNative("1_lbt rubbish no fields"); ok {
		t.Fatalf("残缺飞秋报文不应命中")
	}
}

func TestParseFeiqColonPacket(t *testing.T) {
	raw := "1_lbt6_03#128#AABBCCDDEEFF#0#0#0#4001#9:1793326334373:Administrator#:YANFA0223:6291457:许彬\x00平台听\x00\x00"
	fq, ok := ParseFeiqNative(raw)
	if !ok {
		t.Fatal("新版冒号链飞秋报文解析失败")
	}
	if fq.PacketNo != 1793326334373 || fq.Command != 6291457 || fq.MAC != "AABBCCDDEEFF" || fq.Login != "Administrator" || fq.Nick != "许彬" || fq.Host != "YANFA0223" || fq.Dept != "平台听" {
		t.Fatalf("解析字段异常: %+v", fq)
	}

	composite := "1_lbt6_03#128#AABBCCDDEEFF#0#0#0#4001#9:42:login#真昵称:PC-X:288:hello\x00组\x00"
	fq, ok = ParseFeiqNative(composite)
	if !ok || fq.Nick != "真昵称" || fq.Dept != "组" || fq.Command != 288 {
		t.Fatalf("登录名复合字段解析异常: %+v ok=%v", fq, ok)
	}
}

// 验收（云桌面联系人恒空最终修复）：飞秋原生心跳按源 IP 建档推 peer_online，
// 两台登录名相同的机器靠 IP 区分成两个联系人；后续心跳只刷新不重推事件。
func TestFeiqNativeCreatesPeers(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	ip98 := &net.UDPAddr{IP: net.ParseIP("192.168.133.98"), Port: 2425}
	ip164 := &net.UDPAddr{IP: net.ParseIP("192.168.133.164"), Port: 2425}
	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, ip98)
	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Nick != "Administrator" || ev.Peer.Dept != "飞秋" || ev.Peer.IP != "192.168.133.98" {
		t.Fatalf("建档字段异常: %+v", ev.Peer)
	}

	e.handleFeiqNative(mustFeiq(t, feiqSample2), feiqSample2, ip164)
	recvEvent(t, ch, EventPeerOnline, time.Second)
	if len(e.Peers()) != 2 {
		t.Fatalf("同名不同 IP 应为两个联系人: %+v", e.Peers())
	}

	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, ip98)
	select {
	case ev := <-ch:
		t.Fatalf("已知心跳不应重复推事件: %+v", ev)
	case <-time.After(200 * time.Millisecond):
	}
}

// 验收（真昵称升级）：飞秋对单播 BrEntry 的标准 AnsEntry 到达后，
// 同 IP 占位记录（登录名@IP）被替换为真实资料，事件先 offline 后 online；
// 后续飞秋心跳不再把记录打回占位（防反复横跳）。
func TestFeiqPlaceholderUpgrade(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	ip := &net.UDPAddr{IP: net.ParseIP("192.168.133.98"), Port: 2425}
	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, ip)
	recvEvent(t, ch, EventPeerOnline, time.Second)

	// 飞秋回的标准 AnsEntry：真昵称 + 真主机名，extra 非 JSON（GBK 客户端）
	e.handlePacket(Packet{Version: 1, PacketNo: 2, Nick: "王维坤", Host: "YANFA033", Command: CmdAnsEntry, Extra: "飞秋自定义"}, ip)
	recvEvent(t, ch, EventPeerOffline, time.Second)      // 占位下线
	ev := recvEvent(t, ch, EventPeerOnline, time.Second) // 真资料上线
	if ev.Peer.Nick != "王维坤" || ev.Peer.Host != "YANFA033" || ev.Peer.Dept != "飞秋" {
		t.Fatalf("升级后的资料异常: %+v", ev.Peer)
	}
	if len(e.Peers()) != 1 {
		t.Fatalf("升级后应只剩真记录: %+v", e.Peers())
	}

	// 占位升级完成后的飞秋心跳：只刷新真记录，不重建占位
	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, ip)
	if len(e.Peers()) != 1 || e.Peers()[0].Nick != "王维坤" {
		t.Fatalf("心跳不应回退占位: %+v", e.Peers())
	}
	select {
	case ev := <-ch:
		t.Fatalf("刷新不应产生事件: %+v", ev)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestNewFeiqHeartbeatReplacesLegacyPlaceholder(t *testing.T) {
	ch := make(chan Event, 8)
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, ch)
	from := &net.UDPAddr{IP: net.ParseIP("192.168.133.98"), Port: 2425}
	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, from)
	recvEvent(t, ch, EventPeerOnline, time.Second)

	e.handleFeiqNative(FeiqNative{PacketNo: 12, Command: 6291457, Nick: "王维坤", Host: "YANFA033", Dept: "研发"}, "sample", from)
	if ev := recvEvent(t, ch, EventPeerOffline, time.Second); ev.Peer.Nick != "Administrator" {
		t.Fatalf("占位联系人下线事件异常: %+v", ev)
	}
	if ev := recvEvent(t, ch, EventPeerOnline, time.Second); ev.Peer.Nick != "王维坤" {
		t.Fatalf("真实资料上线事件异常: %+v", ev)
	}
	peers := e.Peers()
	if len(peers) != 1 || peers[0].Nick != "王维坤" || peers[0].Host != "YANFA033" {
		t.Fatalf("占位升级后联系人重复: %+v", peers)
	}
}

// 验收：占位发现后自动单播标准 BrEntry 查真昵称，每 IP 只查一次。
func TestQueryRealNickOncePerIP(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	attachConn(t, e, ch)
	port := int(e.listenPort.Load())

	c, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port})
	if err != nil {
		t.Fatalf("对端 socket: %v", err)
	}
	defer c.Close()
	la := c.LocalAddr().(*net.UDPAddr)
	from := &net.UDPAddr{IP: la.IP, Port: la.Port} // 单播目的 = 对端真实地址

	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, from)
	buf := make([]byte, 512)
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	if _, _, err := c.ReadFromUDP(buf); err != nil {
		t.Fatalf("未收到真昵称查询 BrEntry: %v", err)
	}

	// 同 IP 心跳再来（已建档）：不再重复查询
	e.handleFeiqNative(mustFeiq(t, feiqSample1), feiqSample1, from)
	c.SetReadDeadline(time.Now().Add(700 * time.Millisecond))
	if n, _, err := c.ReadFromUDP(buf); err == nil {
		t.Fatalf("同 IP 不应重复查询，却收到 %d 字节", n)
	}
}

// 验收：readLoop 全链路——飞秋原生 UDP 报文进来即成联系人（真 socket）。
func TestFeiqNativeEndToEnd(t *testing.T) {
	port := freePort(t)
	ch := make(chan Event, 8)
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: port}, ch)
	if err := e.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer e.Stop()

	c, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port})
	if err != nil {
		t.Fatalf("对端 socket: %v", err)
	}
	defer c.Close()
	if _, err := c.Write([]byte(feiqSample1)); err != nil {
		t.Fatalf("发送: %v", err)
	}

	ev := recvEvent(t, ch, EventPeerOnline, 3*time.Second)
	if ev.Peer.Nick != "Administrator" || ev.Peer.Dept != "飞秋" {
		t.Fatalf("全链路建档异常: %+v", ev.Peer)
	}
	st := e.Stats()
	if st.RxUnparsed != 0 {
		t.Fatalf("飞秋报文不应计入未解析: %+v", st)
	}
}

func TestFeiqPrivatePresenceGBKEndToEnd(t *testing.T) {
	port := freePort(t)
	ch := make(chan Event, 16)
	e := New(Config{Nick: "飞联用户", Hostname: "PC-FEILIAN", Dept: "开发部", Port: port}, ch)
	if err := e.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer e.Stop()
	remote, _ := loopbackPeer(t)
	nick, err := EncodeGBK("王老师")
	if err != nil {
		t.Fatal(err)
	}
	dept, err := EncodeGBK("平台组")
	if err != nil {
		t.Fatal(err)
	}
	raw := fmt.Sprintf("1_lbt6_03#128#AABBCCDDEEFF#0#0#0#4001#9:1793326334373:Administrator#:FEIQ-PC:6291457:%s\x00%s\x00\x00", nick, dept)
	if _, err := remote.WriteToUDP([]byte(raw), &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port}); err != nil {
		t.Fatal(err)
	}
	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Nick != "王老师" || ev.Peer.Host != "FEIQ-PC" || ev.Peer.Dept != "平台组" {
		t.Fatalf("飞秋资料解码异常: %+v", ev.Peer)
	}
	if !e.isFeiqIP("127.0.0.1") {
		t.Fatal("飞秋协议识别未记录目标地址")
	}
}

func TestFeiqNativeTextUsesGBKAndReplies(t *testing.T) {
	e := New(Config{Nick: "飞联用户", Hostname: "PC-FEILIAN"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	attachConn(t, e, ch)
	remote, remoteAddr := loopbackPeer(t)
	gbk, err := EncodeGBK("飞秋发来的消息")
	if err != nil {
		t.Fatal(err)
	}
	fq := FeiqNative{PacketNo: 777, Command: CmdSendMsg | OptSendCheck, Login: "Administrator", Nick: "王老师", Host: "FEIQ-PC", Dept: "研发", Extra: gbk}
	e.handleFeiqNative(fq, "sample", remoteAddr)
	msg := recvEvent(t, ch, EventMessage, time.Second)
	if msg.Text != "飞秋发来的消息" || msg.Peer.Nick != "王老师" || msg.Peer.Host != "FEIQ-PC" {
		t.Fatalf("飞秋消息内容异常: %+v", msg)
	}

	buf := make([]byte, 512)
	remote.SetReadDeadline(time.Now().Add(time.Second))
	n, _, err := remote.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("未收到飞秋消息回执: %v", err)
	}
	receipt, ok := ParsePacket(string(buf[:n]))
	if !ok || receipt.Command != CmdRecvMsg || receipt.Extra != "777" {
		t.Fatalf("回执报文异常: %+v ok=%v", receipt, ok)
	}

	if _, err := e.SendText(remoteAddr.String(), "回飞秋的消息"); err != nil {
		t.Fatalf("向飞秋发消息: %v", err)
	}
	remote.SetReadDeadline(time.Now().Add(time.Second))
	n, _, err = remote.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("未收到出站消息: %v", err)
	}
	out, ok := ParsePacket(string(buf[:n]))
	if !ok || out.PacketNo < 1_000_000_000_000 || DecodeExtra(out.Nick) != "飞联用户" || DecodeExtra(out.Host) != "PC-FEILIAN" || DecodeExtra(out.Extra) != "回飞秋的消息" || out.Command != CmdSendMsg|OptSendCheck {
		t.Fatalf("飞秋出站 GBK 报文异常: %+v ok=%v", out, ok)
	}
}

func mustFeiq(t *testing.T, raw string) FeiqNative {
	t.Helper()
	fq, ok := ParseFeiqNative(raw)
	if !ok {
		t.Fatalf("样例解析失败: %q", raw)
	}
	return fq
}

// 审核修复：飞秋私有头实拍 MAC 仅 10 位 hex（文档 §2「FEFFCFAFAC」），
// 与网卡 12 位归一化值按短串前缀匹配；过短或前缀不符不得命中。
func TestMACPrefixEqual(t *testing.T) {
	cases := []struct {
		iface, packet string
		want          bool
	}{
		{"AABBCCDDEEFF", "AABBCCDDEEFF", true},
		{"AABBCCDDEEFF", "AABBCCDDEE01", false},
		{"AABBCCDDEEFF", "AABBCCDDEE", true}, // 实拍 10 位形态
		{"AABBCCDDEEFF", "AABBCCDDFF", false}, // 前缀不符
		{"AABBCCDDEEFF", "AABBCC", false},     // 过短防巧合
		{"", "", false},
	}
	for _, c := range cases {
		if got := macPrefixEqual(c.iface, c.packet); got != c.want {
			t.Fatalf("macPrefixEqual(%q, %q) = %v, want %v", c.iface, c.packet, got, c.want)
		}
	}
}

// 审核修复：0x600000 是飞秋标志位而非命令的一部分（文档 §4），
// 带标志的退出/消息包应按剥位后的命令分发，而非落 default 只刷新。
func TestFeiqFlagStrippedInDispatch(t *testing.T) {
	ch := make(chan Event, 8)
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	e.out = ch

	e.handlePacket(Packet{PacketNo: 1, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdSendMsg, Extra: "建档"}, testAddr)
	recvEvent(t, ch, EventMessage, time.Second)

	e.handlePacket(Packet{PacketNo: 2, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdBrExit | OptFeiqFlag}, testAddr)
	if ev := recvEvent(t, ch, EventPeerOffline, time.Second); ev.Peer.Nick != "飞秋用户" {
		t.Fatalf("带标志退出包未触发下线: %+v", ev)
	}

	e.handlePacket(Packet{PacketNo: 3, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdSendMsg | OptSendCheck | OptFeiqFlag, Extra: "带标志消息"}, testAddr)
	if ev := recvEvent(t, ch, EventMessage, time.Second); ev.Text != "带标志消息" {
		t.Fatalf("带标志消息未被分发: %+v", ev)
	}
}

// 审核修复：标准形态的 BrEntry 允许携带官方选项位（非纯 0x01），
// 仍按 IPMsg 语义回 AnsEntry；带 0x600000 的刷新包不回。
func TestFeiqStandardBrEntryWithOptionsReplies(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	attachConn(t, e, make(chan Event, 8))
	remote, remoteAddr := loopbackPeer(t)

	e.handleFeiqNative(FeiqNative{PacketNo: 5, Login: "Admin", Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdBrEntry | OptSendCheck}, "s", remoteAddr)
	buf := make([]byte, 512)
	remote.SetReadDeadline(time.Now().Add(time.Second))
	n, _, err := remote.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("带选项位标准 BrEntry 未获 AnsEntry 应答: %v", err)
	}
	ans, ok := ParsePacket(string(buf[:n]))
	if !ok || ans.Command&0xff != CmdAnsEntry {
		t.Fatalf("AnsEntry 应答异常: %+v ok=%v", ans, ok)
	}
}
