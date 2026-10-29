package engine

import (
	"net"
	"testing"
	"time"
)

var testAddr = &net.UDPAddr{IP: net.ParseIP("192.168.1.60"), Port: 2425}

// injectEntry 直接向引擎注入一条 Entry 报文（绕过网络，聚焦用户表行为）。
func injectEntry(t *testing.T, e *Engine, nick, host, extra string) {
	t.Helper()
	e.handlePacket(Packet{Version: 1, PacketNo: 1, Nick: nick, Host: host, Command: CmdBrEntry, Extra: extra}, testAddr)
}

// 验收：Peers() 快照含昵称/IP/主机名/部门/状态。
func TestPeersSnapshot(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	injectEntry(t, e, "周舟", "PC-ZHOU", `{"dept":"研发部","status":"online"}`)

	peers := e.Peers()
	if len(peers) != 1 {
		t.Fatalf("Peers() = %d 条，want 1", len(peers))
	}
	p := peers[0]
	if p.Nick != "周舟" || p.Host != "PC-ZHOU" || p.IP != testAddr.IP.String() ||
		p.Dept != "研发部" || p.Status != StatusOnline {
		t.Fatalf("快照字段不全: %+v", p)
	}
	if p.LastSeen.IsZero() {
		t.Fatalf("LastSeen 未记录")
	}
}

// 验收：CmdBrAbsence 状态变更映射 Peer.Status 并推送 peer_update 事件。
func TestAbsenceStatusUpdate(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	injectEntry(t, e, "周舟", "PC-ZHOU", `{"dept":"研发部","status":"online"}`)

	e.handlePacket(Packet{Version: 1, PacketNo: 2, Nick: "周舟", Host: "PC-ZHOU", Command: CmdBrAbsence, Extra: `{"status":"busy"}`}, testAddr)

	ev := recvEvent(t, ch, EventPeerUpdate, time.Second)
	if ev.Peer.Status != StatusBusy {
		t.Fatalf("peer_update 状态 = %q, want busy", ev.Peer.Status)
	}
	if got := e.Peers()[0].Status; got != StatusBusy {
		t.Fatalf("Peers() 状态 = %q, want busy", got)
	}

	// 非法状态串（如飞秋自定义 extra）不改变状态、不推事件
	e.handlePacket(Packet{Version: 1, PacketNo: 3, Nick: "周舟", Host: "PC-ZHOU", Command: CmdBrAbsence, Extra: "GBK串"}, testAddr)
	if got := e.Peers()[0].Status; got != StatusBusy {
		t.Fatalf("非法状态不应生效，得到 %q", got)
	}
}

// 验收：LastSeen 超过阈值后清扫判离线并移出用户表。
func TestSweepTimeout(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	injectEntry(t, e, "周舟", "PC-ZHOU", `{"status":"online"}`)

	// 手工把 LastSeen 回拨到超时阈值之外
	e.peersMu.Lock()
	p := e.peers[peerKey("周舟", "PC-ZHOU")]
	p.LastSeen = time.Now().Add(-2 * offlineTimeout)
	e.peers[peerKey("周舟", "PC-ZHOU")] = p
	e.peersMu.Unlock()

	if n := e.sweepPeers(); n != 1 {
		t.Fatalf("sweepPeers() = %d, want 1", n)
	}
	ev := recvEvent(t, ch, EventPeerOffline, time.Second)
	if ev.Peer.Nick != "周舟" {
		t.Fatalf("offline 事件对象错误: %+v", ev.Peer)
	}
	if len(e.Peers()) != 0 {
		t.Fatalf("超时用户未移出用户表: %+v", e.Peers())
	}

	// 未知心跳来源不建档（等 Entry/AnsEntry 带全资料再入库）
	e.handlePacket(Packet{Version: 1, PacketNo: 9, Nick: "路人", Host: "PC-X", Command: CmdNoOperation}, testAddr)
	if len(e.Peers()) != 0 {
		t.Fatalf("心跳不应建档: %+v", e.Peers())
	}
}
