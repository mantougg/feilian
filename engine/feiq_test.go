package engine

import (
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

// 验收（云桌面联系人恒空最终修复）：飞秋原生心跳按源 IP 建档推 peer_online，
// 两台登录名相同的机器靠 IP 区分成两个联系人；后续心跳只刷新不重推事件。
func TestFeiqNativeCreatesPeers(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	ip98 := &net.UDPAddr{IP: net.ParseIP("192.168.133.98"), Port: 2425}
	ip164 := &net.UDPAddr{IP: net.ParseIP("192.168.133.164"), Port: 2425}
	e.handleFeiqNative(mustFeiq(t, feiqSample1), ip98)
	ev := recvEvent(t, ch, EventPeerOnline, time.Second)
	if ev.Peer.Nick != "Administrator" || ev.Peer.Dept != "飞秋" || ev.Peer.IP != "192.168.133.98" {
		t.Fatalf("建档字段异常: %+v", ev.Peer)
	}

	e.handleFeiqNative(mustFeiq(t, feiqSample2), ip164)
	recvEvent(t, ch, EventPeerOnline, time.Second)
	if len(e.Peers()) != 2 {
		t.Fatalf("同名不同 IP 应为两个联系人: %+v", e.Peers())
	}

	e.handleFeiqNative(mustFeiq(t, feiqSample1), ip98)
	select {
	case ev := <-ch:
		t.Fatalf("已知心跳不应重复推事件: %+v", ev)
	case <-time.After(200 * time.Millisecond):
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

func mustFeiq(t *testing.T, raw string) FeiqNative {
	t.Helper()
	fq, ok := ParseFeiqNative(raw)
	if !ok {
		t.Fatalf("样例解析失败: %q", raw)
	}
	return fq
}
