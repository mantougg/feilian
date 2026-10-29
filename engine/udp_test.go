package engine

import (
	"net"
	"testing"
	"time"
)

func TestDirectedBroadcast(t *testing.T) {
	for _, tc := range []struct {
		cidr string
		want string
	}{
		{"192.168.1.23/24", "192.168.1.255"},
		{"10.0.5.7/16", "10.0.255.255"},
		{"172.16.0.1/8", "172.255.255.255"},
	} {
		_, ipnet, _ := net.ParseCIDR(tc.cidr)
		got := directedBroadcast(ipnet)
		if got == nil || got.String() != tc.want {
			t.Fatalf("%s → %v, want %s", tc.cidr, got, tc.want)
		}
	}
	if got := directedBroadcast(&net.IPNet{IP: net.ParseIP("fe80::1"), Mask: net.CIDRMask(64, 128)}); got != nil {
		t.Fatalf("IPv6 应返回 nil，得到 %v", got)
	}
}

// 验收：本机两个 UDP 套接字经广播地址互收报文。
// 同端口双绑依赖 listenUDP 设置的 SO_REUSEADDR（与双开联调一致）。
func TestBroadcastLoopback(t *testing.T) {
	a, bcast, err := listenUDP(0)
	if err != nil {
		t.Fatalf("listen a: %v", err)
	}
	defer a.Close()
	port := a.LocalAddr().(*net.UDPAddr).Port

	if len(bcast) == 0 {
		t.Skip("本机无可用广播网段（无 FlagBroadcast 网卡），跳过广播回环验收")
	}

	b, _, err := listenUDP(port)
	if err != nil {
		t.Fatalf("listen b(同端口 %d): %v", port, err)
	}
	defer b.Close()

	a.SetReadDeadline(time.Now().Add(3 * time.Second))
	b.SetReadDeadline(time.Now().Add(3 * time.Second))

	// a → 广播 → b
	if _, err := a.WriteToUDP([]byte("ping-飞联"), &net.UDPAddr{IP: bcast[0], Port: port}); err != nil {
		t.Fatalf("a 广播发送: %v", err)
	}
	buf := make([]byte, 128)
	n, from, err := b.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("b 未收到广播报文: %v", err)
	}
	if string(buf[:n]) != "ping-飞联" {
		t.Fatalf("b 收到 %q", buf[:n])
	}
	if from.Port != port {
		t.Fatalf("b 收到来自异常端口 %d 的报文", from.Port)
	}

	// b → 广播 → a。
	// 广播回环会把 b 的包同时投递给 a 和 b 自己（含 a 先前发的回环包），
	// 所以 a 需跳过非目标报文（真实引擎读循环同样要过滤自己发出的广播）。
	if _, err := b.WriteToUDP([]byte("pong-回复"), &net.UDPAddr{IP: bcast[0], Port: port}); err != nil {
		t.Fatalf("b 广播发送: %v", err)
	}
	for {
		n, _, err = a.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("a 未收到 b 的广播报文: %v", err)
		}
		if got := string(buf[:n]); got == "pong-回复" {
			break
		}
	}
}

// 未 Start 的引擎调用 broadcast 应返回 ErrNotStarted 而非 panic。
func TestBroadcastNotStarted(t *testing.T) {
	e := New(Config{Nick: "测试"}, make(chan Event, 1))
	if err := e.broadcast([]byte("x")); err != ErrNotStarted {
		t.Fatalf("want ErrNotStarted, got %v", err)
	}
}
