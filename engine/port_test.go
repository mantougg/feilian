package engine

import (
	"fmt"
	"net"
	"testing"
	"time"
)

// 验收（云桌面飞秋共存问题）：目标端口被其他程序占用（模拟同机飞秋抢 2425），
// Start 必须避让到相邻空闲端口并推 notice 告知，引擎保持可用。
// 旧实现 SO_REUSEADDR 绑定"成功"但入站报文全被先绑定者截走——联系人恒空。
func TestStartFallsBackWhenPortTaken(t *testing.T) {
	port := freePort(t)
	squatter, err := net.ListenPacket("udp4", fmt.Sprintf(":%d", port))
	if err != nil {
		t.Fatalf("占位 socket: %v", err)
	}
	defer squatter.Close()

	ch := make(chan Event, 8)
	e := New(Config{Nick: "飞联", Hostname: "PC-FL", Port: port}, ch)
	if err := e.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer e.Stop()

	st := e.Stats()
	if !st.Started {
		t.Fatalf("引擎未启动")
	}
	if st.ListenPort == port || st.ListenPort < port || st.ListenPort > port+9 {
		t.Fatalf("未避让到相邻端口: 实际 %d（原 %d）", st.ListenPort, port)
	}
	if st.TxPackets == 0 {
		t.Fatalf("启动广播未发出（tx=0）")
	}
	ev := recvEvent(t, ch, EventNotice, time.Second)
	if ev.Text == "" {
		t.Fatalf("避让 notice 缺文案")
	}
}

// 验收：避让实例与标准端口实例互见——B 先占标准位，A 避让到相邻端口后，
// A 的广播仍发往标准位（B 收到并回 AnsEntry 到 A 的真实端口），
// A 借应答建档 B；双向 peer_online 均须出现。
func TestFallbackInstanceStillDiscoverable(t *testing.T) {
	base := freePort(t)
	chB := make(chan Event, 64)
	b := New(Config{Nick: "乙", Hostname: "PC-B", Port: base}, chB)
	if err := b.Start(); err != nil {
		t.Fatalf("B Start: %v", err)
	}
	defer b.Stop()
	if lp := b.Stats().ListenPort; lp != base {
		t.Fatalf("B 应占标准位 %d，实际 %d", base, lp)
	}

	chA := make(chan Event, 64)
	a := New(Config{Nick: "甲", Hostname: "PC-A", Port: base}, chA)
	if err := a.Start(); err != nil {
		t.Fatalf("A Start: %v", err)
	}
	defer a.Stop()
	if lp := a.Stats().ListenPort; lp == base {
		t.Fatalf("A 未避让（仍绑 %d）", base)
	}

	// B 侧看到 A 上线
	evB := recvEvent(t, chB, EventPeerOnline, 3*time.Second)
	if evB.Peer.Nick != "甲" {
		t.Fatalf("B 收到错误上线事件: %+v", evB.Peer)
	}
	// A 侧借 B 的 AnsEntry 也看到 B 上线
	evA := recvEvent(t, chA, EventPeerOnline, 3*time.Second)
	if evA.Peer.Nick != "乙" {
		t.Fatalf("A 收到错误上线事件: %+v", evA.Peer)
	}
	if evA.Peer.Port != base {
		t.Fatalf("A 建档的 B 端口应为标准位 %d，实际 %d", base, evA.Peer.Port)
	}

	// 双方互发消息可达（A 用 B 建档端口，B 用 A 的真实源端口）
	if _, err := a.SendText(fmt.Sprintf("127.0.0.1:%d", base), "避让位发出的消息"); err != nil {
		t.Fatalf("A SendText: %v", err)
	}
	msg := recvEvent(t, chB, EventMessage, 3*time.Second)
	if msg.Text != "避让位发出的消息" {
		t.Fatalf("B 收到内容不符: %q", msg.Text)
	}

	// 收发计数自诊断可见
	if sa := a.Stats(); sa.RxPackets == 0 || sa.TxPackets == 0 {
		t.Fatalf("A 侧计数异常: %+v", sa)
	}
}
