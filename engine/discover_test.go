package engine

import (
	"net"
	"testing"
	"time"
)

// freePort 找一个空闲 UDP 端口供双开测试共用（存在极小竞态，可接受）。
func freePort(t *testing.T) int {
	t.Helper()
	conn, _, err := listenUDP(0)
	if err != nil {
		t.Fatalf("取空闲端口: %v", err)
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).Port
}

// recvEvent 循环收取事件直到命中目标类型或超时。
func recvEvent(t *testing.T, ch <-chan Event, wantType string, timeout time.Duration) Event {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case ev := <-ch:
			if ev.Type == wantType {
				return ev
			}
		case <-deadline:
			t.Fatalf("等待 %s 事件超时", wantType)
		}
	}
}

// 验收：A 启动后 B 侧出现 A（peer_online 携带部门/状态扩展），A 退出后 5s 内 B 侧下线。
func TestDiscoveryAndExit(t *testing.T) {
	port := freePort(t)
	chB := make(chan Event, 64)
	b := New(Config{Nick: "乙", Hostname: "PC-B", Dept: "测试部", Status: StatusOnline, Port: port}, chB)
	if err := b.Start(); err != nil {
		t.Fatalf("B Start: %v", err)
	}
	defer b.Stop()

	chA := make(chan Event, 64)
	a := New(Config{Nick: "甲", Hostname: "PC-A", Dept: "研发部", Status: StatusOnline, Port: port}, chA)
	if err := a.Start(); err != nil {
		t.Fatalf("A Start: %v", err)
	}

	ev := recvEvent(t, chB, EventPeerOnline, 3*time.Second)
	if ev.Peer.Nick != "甲" || ev.Peer.Host != "PC-A" {
		t.Fatalf("B 收到错误上线事件: %+v", ev.Peer)
	}
	if ev.Peer.Dept != "研发部" {
		t.Fatalf("Entry 扩展 JSON 部门未解析: %+v", ev.Peer)
	}
	if ev.Peer.Status != StatusOnline {
		t.Fatalf("Entry 扩展 JSON 状态未解析: %+v", ev.Peer)
	}
	if ev.Peer.IP == "" {
		t.Fatalf("上线事件缺少来源 IP: %+v", ev.Peer)
	}

	// A 广播下线，B 应在验收口径 5s 内收到 offline（正常秒级）
	a.Stop()
	start := time.Now()
	ev = recvEvent(t, chB, EventPeerOffline, 5*time.Second)
	if ev.Peer.Nick != "甲" {
		t.Fatalf("B 收到错误下线事件: %+v", ev.Peer)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("下线通知耗时 %v（>5s）", elapsed)
	}
}

// Entry extra 非 JSON 时（如飞秋报文），状态应兜底 online、部门留空，不得报错丢弃。
func TestPeerOnlineToleratesPlainExtra(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: 0}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	e.handlePacket(
		Packet{Version: 1, PacketNo: 1, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdBrEntry, Extra: "GBK乱串"},
		&net.UDPAddr{IP: net.ParseIP("192.168.1.50"), Port: 2425},
	)
	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Nick != "飞秋用户" || ev.Peer.Status != StatusOnline || ev.Peer.Dept != "" {
		t.Fatalf("普通 extra 解析结果异常: %+v", ev.Peer)
	}
}
