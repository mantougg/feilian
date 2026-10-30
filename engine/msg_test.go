package engine

import (
	"fmt"
	"net"
	"testing"
	"time"
)

// loopbackPeer 建一个真实 UDP socket 模拟对端，返回套接字与其地址。
func loopbackPeer(t *testing.T) (*net.UDPConn, *net.UDPAddr) {
	t.Helper()
	c, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP("127.0.0.1")})
	if err != nil {
		t.Fatalf("对端 socket: %v", err)
	}
	t.Cleanup(func() { c.Close() })
	return c, c.LocalAddr().(*net.UDPAddr)
}

// attachConn 给引擎手工挂上真实套接字（不经 Start，避免广播与心跳干扰断言）。
func attachConn(t *testing.T, e *Engine, ch chan Event) {
	t.Helper()
	e.out = ch
	conn, bcast, err := listenUDP(0)
	if err != nil {
		t.Fatalf("引擎 socket: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	e.conn, e.bcast = conn, bcast
}

// 验收：收到 CmdSendMsg|OptSendCheck 即回 CmdRecvMsg（extra=原 PacketNo），
// 并推送 EventMessage；Extra 中文与 emoji 原样保留（UTF-8 透明）。
func TestRecvMsgRepliesReceipt(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	attachConn(t, e, ch)
	c, cAddr := loopbackPeer(t)

	const text = "下午三点提测 🎉 中文"
	e.handlePacket(
		Packet{Version: 1, PacketNo: 777, Nick: "周舟", Host: "PC-ZHOU", Command: CmdSendMsg | OptSendCheck, Extra: text},
		cAddr,
	)

	ev := recvEvent(t, ch, EventMessage, time.Second)
	if ev.Text != text || ev.MsgID != "777" {
		t.Fatalf("EventMessage 内容不符: %+v", ev)
	}
	if ev.Peer.Nick != "周舟" || ev.Peer.Host != "PC-ZHOU" || ev.Peer.IP != "127.0.0.1" {
		t.Fatalf("EventMessage 发送者不符: %+v", ev.Peer)
	}

	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	n, _, err := c.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("未收到回执: %v", err)
	}
	rp, ok := ParsePacket(string(buf[:n]))
	if !ok || rp.Command != CmdRecvMsg || rp.Extra != "777" {
		t.Fatalf("回执报文异常: %+v ok=%v", rp, ok)
	}
}

// 无回执要求（无 OptSendCheck）的消息不得回 CmdRecvMsg。
func TestRecvMsgNoReceiptWhenNotRequested(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	attachConn(t, e, ch)
	c, cAddr := loopbackPeer(t)

	e.handlePacket(Packet{Version: 1, PacketNo: 9, Nick: "甲", Host: "H", Command: CmdSendMsg, Extra: "hi"}, cAddr)
	recvEvent(t, ch, EventMessage, time.Second)

	c.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	buf := make([]byte, 512)
	if n, _, err := c.ReadFromUDP(buf); err == nil {
		t.Fatalf("不要求回执却收到报文: %q", buf[:n])
	}
}

// 验收：回执报文按 extra 中的 PacketNo 关联为 EventReceipt。
func TestReceiptEvent(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	e.handlePacket(
		Packet{Version: 1, PacketNo: 1, Nick: "周舟", Host: "PC-ZHOU", Command: CmdRecvMsg, Extra: "1690000123"},
		testAddr,
	)
	ev := recvEvent(t, ch, EventReceipt, time.Second)
	if ev.MsgID != "1690000123" {
		t.Fatalf("EventReceipt.MsgID = %q", ev.MsgID)
	}
}

// 验收：SendText 直发 CmdSendMsg|OptSendCheck，Extra 中文 UTF-8 原样到达。
func TestSendText(t *testing.T) {
	c, cAddr := loopbackPeer(t)
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: cAddr.Port}, make(chan Event, 8))
	attachConn(t, e, make(chan Event, 8))

	if _, err := e.SendText("127.0.0.1", "你好，飞联 🚀"); err != nil {
		t.Fatalf("SendText: %v", err)
	}
	if _, err := e.SendText("not-an-ip", "x"); err == nil {
		t.Fatalf("无效 IP 应报错")
	}

	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	n, _, err := c.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("对端未收到消息: %v", err)
	}
	pkt, ok := ParsePacket(string(buf[:n]))
	if !ok || pkt.Command != CmdSendMsg|OptSendCheck || pkt.Extra != "你好，飞联 🚀" || pkt.Nick != "我" {
		t.Fatalf("线上报文异常: %+v ok=%v", pkt, ok)
	}
}

// resolveAddr 的三种口径：显式 ip:port 直用；纯 IP 查用户表端口；未命中退协议端口。
func TestResolveAddr(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: 2425}, make(chan Event, 8))
	e.peers["周舟@PC-ZHOU"] = Peer{Nick: "周舟", IP: "192.168.1.60", Port: 2426}

	ip, port, err := e.resolveAddr("192.168.1.60")
	if err != nil || port != 2426 || ip.String() != "192.168.1.60" {
		t.Fatalf("查表口径失败: %v %d %v", ip, port, err)
	}
	_, port, err = e.resolveAddr("10.0.0.9")
	if err != nil || port != 2425 {
		t.Fatalf("兜底口径失败: port=%d err=%v", port, err)
	}
	ip, port, err = e.resolveAddr("10.0.0.9:9911")
	if err != nil || port != 9911 || ip.String() != "10.0.0.9" {
		t.Fatalf("显式端口口径失败: %v %d %v", ip, port, err)
	}
	if _, _, err := e.resolveAddr("not-an-ip"); err == nil {
		t.Fatalf("非法地址应报错")
	}
	if _, _, err := e.resolveAddr("1.2.3.4:0"); err == nil {
		t.Fatalf("非法端口应报错")
	}
}

// 显式 ip:port 发送不依赖协议端口（同机双开端口号不同的联调模式）。
func TestSendTextExplicitPort(t *testing.T) {
	c, cAddr := loopbackPeer(t)
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: 2425}, make(chan Event, 8))
	attachConn(t, e, make(chan Event, 8)) // 引擎绑随机端口，cfg.Port 保持 2425

	dst := fmt.Sprintf("127.0.0.1:%d", cAddr.Port)
	if _, err := e.SendText(dst, "定向联调消息"); err != nil {
		t.Fatalf("SendText: %v", err)
	}
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	n, _, err := c.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("对端未收到消息: %v", err)
	}
	pkt, ok := ParsePacket(string(buf[:n]))
	if !ok || pkt.Extra != "定向联调消息" || pkt.Command != CmdSendMsg|OptSendCheck {
		t.Fatalf("线上报文异常: %+v ok=%v", pkt, ok)
	}
}

// 验收：BroadcastText 广播消息；广播不携带 OptSendCheck（不要求回执）。
func TestBroadcastText(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: 0}, make(chan Event, 8))
	ch := make(chan Event, 8)
	attachConn(t, e, ch)
	port := e.conn.LocalAddr().(*net.UDPAddr).Port

	// 对端与引擎同端口双绑（SO_REUSEADDR），广播可投递到两者
	c, _, err := listenUDP(port)
	if err != nil {
		t.Fatalf("对端同端口绑定: %v", err)
	}
	defer c.Close()

	if err := e.BroadcastText("全员注意"); err != nil {
		t.Fatalf("BroadcastText: %v", err)
	}

	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	var got Packet
	for {
		n, _, err := c.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("对端未收到广播: %v", err)
		}
		pkt, ok := ParsePacket(string(buf[:n]))
		if ok && pkt.Command&^OptBroadcast == CmdSendMsg {
			got = pkt
			break
		}
		// 跳过回环的 Entry/NoOp 等其他报文
	}
	if got.Extra != "全员注意" || got.HasOpt(OptSendCheck) || !got.HasOpt(OptBroadcast) {
		t.Fatalf("广播报文异常: %+v", got)
	}
}

// T-M2-5：收到 CmdFeiLinkTyping 推 EventTyping；SendTyping 发出扩展码报文。
func TestTypingIndicator(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	e.handlePacket(Packet{Version: 1, PacketNo: 2, Nick: "周舟", Host: "PC-ZHOU", Command: CmdFeiLinkTyping}, testAddr)
	ev := recvEvent(t, ch, EventTyping, time.Second)
	if ev.Peer.Nick != "周舟" {
		t.Fatalf("typing 事件对象错误: %+v", ev.Peer)
	}

	c, cAddr := loopbackPeer(t)
	attachConn(t, e, make(chan Event, 8))
	if err := e.SendTyping(fmt.Sprintf("127.0.0.1:%d", cAddr.Port)); err != nil {
		t.Fatalf("SendTyping: %v", err)
	}
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 512)
	n, _, err := c.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("对端未收到 typing: %v", err)
	}
	pkt, ok := ParsePacket(string(buf[:n]))
	if !ok || pkt.Command != CmdFeiLinkTyping {
		t.Fatalf("typing 报文异常: %+v ok=%v", pkt, ok)
	}
}
