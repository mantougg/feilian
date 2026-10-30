package engine

import (
	"fmt"
	"net"
	"testing"
	"time"
)

// T-M5-2：SendGroupText 逐一单播给所有成员，全部收到同一文本。
func TestSendGroupText(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	attachConn(t, e, make(chan Event, 8))

	members := make([]*net.UDPConn, 0, 3) //nolint:prealloc
	addrs := make([]string, 0, 3)
	buf := make([]byte, 512)
	for i := 0; i < 3; i++ {
		c, cAddr := loopbackPeer(t)
		members = append(members, c)
		addrs = append(addrs, fmt.Sprintf("127.0.0.1:%d", cAddr.Port))
	}

	if err := e.SendGroupText("群发通知 📢", addrs); err != nil {
		t.Fatalf("SendGroupText: %v", err)
	}
	for i, c := range members {
		c.SetReadDeadline(time.Now().Add(2 * time.Second))
		n, _, err := c.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("成员 %d 未收到群发", i)
		}
		pkt, ok := ParsePacket(string(buf[:n]))
		if !ok || pkt.Extra != "群发通知 📢" {
			t.Fatalf("成员 %d 收到异常报文: %+v ok=%v", i, pkt, ok)
		}
	}

	// 单个无效地址不影响其他成员（尽力而为）
	bad := append([]string{"not-an-ip"}, addrs...)
	if err := e.SendGroupText("第二条", bad); err == nil {
		t.Fatal("含无效地址时应返回首个错误")
	}
	for i, c := range members {
		c.SetReadDeadline(time.Now().Add(2 * time.Second))
		if _, _, err := c.ReadFromUDP(buf); err != nil {
			t.Fatalf("第二条: 成员 %d 未收到", i)
		}
	}
}
