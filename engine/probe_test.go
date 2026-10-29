package engine

import (
	"net"
	"testing"
	"time"
)

// 守护 Windows 实测行为：同端口双绑（SO_REUSEADDR）时，第三方单播只投递给
// 先绑定的 socket。CLI 同机双开联调因此要求第二实例换端口（-port 2426），
// 单播地址须带端口或依赖用户表记录的对方实际端口。
// 若未来平台行为变化（如双投递），此测试会失败并提示重新评估联调方案。
func TestUnicastGoesToFirstBinder(t *testing.T) {
	a, _, err := listenUDP(0)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	port := a.LocalAddr().(*net.UDPAddr).Port
	b, _, err := listenUDP(port)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()

	c, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP("127.0.0.1")})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	if _, err := c.WriteToUDP([]byte("unicast"), &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port}); err != nil {
		t.Fatal(err)
	}

	a.SetReadDeadline(time.Now().Add(time.Second))
	b.SetReadDeadline(time.Now().Add(time.Second))
	buf := make([]byte, 64)
	_, _, errA := a.ReadFromUDP(buf)
	_, _, errB := b.ReadFromUDP(buf)
	if errA != nil || errB == nil {
		t.Fatalf("单播投递行为变化：先绑定者收到=%v，后绑定者收到=%v", errA == nil, errB == nil)
	}
}
