package engine

import (
	"encoding/json"
	"fmt"
	"net"
	"testing"
	"time"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// 晚到者发现（云桌面「已收 60 包 0 联系人」回归）：
// 飞秋用户的上线广播只在飞秋启动时发一次，飞联后启动收不到；
// 之后只剩私有命令心跳。任何命令的未知发送者都必须建档。

// 验收：飞秋私有命令（本例 0x07D0）心跳的未知发送者建档并推 peer_online；
// 后续同人心跳只刷新 LastSeen，不重复推事件。
func TestUnknownCommandCreatesPeer(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	feiqCmd := uint32(0x07D0) // 飞秋私有扩展命令（示意）
	e.handlePacket(Packet{Version: 1, PacketNo: 1, Nick: "王义", Host: "研发-0093", Command: feiqCmd, Extra: "飞秋自定义负载"}, testAddr)

	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Nick != "王义" || ev.Peer.Status != StatusOnline {
		t.Fatalf("私有命令心跳建档字段异常: %+v", ev.Peer)
	}
	if len(e.Peers()) != 1 {
		t.Fatalf("未入用户表: %+v", e.Peers())
	}

	e.handlePacket(Packet{Version: 1, PacketNo: 2, Nick: "王义", Host: "研发-0093", Command: feiqCmd}, testAddr)
	select {
	case ev := <-ch:
		t.Fatalf("已知心跳不应重复推事件: %+v", ev)
	case <-time.After(200 * time.Millisecond):
	}
}

// 验收：NoOperation 心跳同样触发未知发送者建档。
func TestUnknownHeartbeatCreatesPeer(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	e.handlePacket(Packet{Version: 1, PacketNo: 1, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdNoOperation}, testAddr)
	recvEvent(t, ch, EventPeerOnline, time.Second)
	if len(e.Peers()) != 1 {
		t.Fatalf("未入用户表: %+v", e.Peers())
	}
}

// 验收：未知发送者的下线广播不产生「上线又下线」的事件抖动。
func TestExitFromUnknownNoChurn(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	e.handlePacket(Packet{Version: 1, PacketNo: 1, Nick: "路人", Host: "PC-X", Command: CmdBrExit}, testAddr)
	select {
	case ev := <-ch:
		t.Fatalf("未知者下线不应产生事件: %+v", ev)
	case <-time.After(200 * time.Millisecond):
	}
	if len(e.Peers()) != 0 {
		t.Fatalf("不应建档: %+v", e.Peers())
	}
}

// 验收：飞秋 GBK 昵称经 readLoop 编码探测转 UTF-8 后建档（全链路，真 socket）。
func TestGBKNickDecodedOnReceive(t *testing.T) {
	port := freePort(t)
	ch := make(chan Event, 8)
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: port}, ch)
	if err := e.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer e.Stop()

	gbk, err := simplifiedchinese.GBK.NewEncoder().String("王义")
	if err != nil {
		t.Fatalf("GBK 编码: %v", err)
	}
	raw := fmt.Sprintf("1:5:%s:FEIQ-PC:%d:hello", gbk, CmdBrEntry)
	c, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port})
	if err != nil {
		t.Fatalf("对端 socket: %v", err)
	}
	defer c.Close()
	if _, err := c.Write([]byte(raw)); err != nil {
		t.Fatalf("发送: %v", err)
	}

	ev := recvEvent(t, ch, EventPeerOnline, 3*time.Second)
	if ev.Peer.Nick != "王义" {
		t.Fatalf("GBK 昵称未解码: %q", ev.Peer.Nick)
	}
}

// 验收：解析失败报文计数并保留 hex 样例（Stats 自诊断可见）。
func TestUnparsedCountedAndSampled(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	e.noteUnparsed([]byte{0x81, 0x40, 0xFF, 'A'})
	st := e.Stats()
	if st.RxUnparsed != 1 || st.RawSample == "" {
		t.Fatalf("计数/样例缺失: %+v", st)
	}
	if want := "8140ff41"; st.RawSample != want {
		t.Fatalf("样例 = %q, want %q", st.RawSample, want)
	}
}

// 验收：Probe 重播上线广播（tx 计数增长）。
func TestProbeRebroadcastsEntry(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME", Port: freePort(t)}, make(chan Event, 8))
	if err := e.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer e.Stop()

	before := e.Stats().TxPackets
	if err := e.Probe(); err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if after := e.Stats().TxPackets; after <= before {
		t.Fatalf("Probe 未发出报文: %d -> %d", before, after)
	}
}

// ensurePeer 建档的 extra 兼容性兜底：纯文本 extra（非 JSON）不报错。
func TestLateJoinPlainExtra(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch
	e.handlePacket(Packet{Version: 1, PacketNo: 1, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdNoOperation, Extra: "\xd6\xd0\xb9\xfa"}, testAddr)
	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Dept != "" || ev.Peer.Status != StatusOnline {
		t.Fatalf("纯文本 extra 兜底异常: %+v", ev.Peer)
	}
	_, _ = json.Marshal(ev) // 事件可序列化（Wails 桥接前提）
}
