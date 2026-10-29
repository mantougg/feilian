package engine

import (
	"testing"
	"time"
)

// 验收（T-M1-7 编码适配）：飞秋可能以 GBK 发送消息文本，
// 引擎按首包探测（UTF-8 合法性）解码，不乱码不丢消息。
func TestDecodeExtraEncoding(t *testing.T) {
	const text = "下午三点提测，注意防抖 🎉"

	// UTF-8 原样通过
	if got := DecodeExtra(text); got != text {
		t.Fatalf("UTF-8 被篡改: %q", got)
	}

	// GBK 字节（飞秋中文 Windows 默认编码）解码还原
	gbk, err := EncodeGBK("下午三点提测")
	if err != nil {
		t.Fatalf("EncodeGBK: %v", err)
	}
	if gbk == "下午三点提测" {
		t.Fatal("EncodeGBK 未生效，测试前提不成立")
	}
	if got := DecodeExtra(gbk); got != "下午三点提测" {
		t.Fatalf("GBK 解码结果: %q", got)
	}
}

// 端到端：GBK extra 的 SendMsg 报文经 handlePacket 后消息文本正确。
func TestRecvMsgGBK(t *testing.T) {
	e := New(Config{Nick: "我", Hostname: "PC-ME"}, make(chan Event, 8))
	ch := make(chan Event, 8)
	e.out = ch

	gbk, err := EncodeGBK("飞秋发来的中文消息")
	if err != nil {
		t.Fatal(err)
	}
	e.handlePacket(
		Packet{Version: 1, PacketNo: 5, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdSendMsg | OptSendCheck, Extra: gbk},
		testAddr,
	)
	ev := recvEvent(t, ch, EventMessage, time.Second)
	if ev.Text != "飞秋发来的中文消息" {
		t.Fatalf("GBK 消息解码失败: %q", ev.Text)
	}
}
