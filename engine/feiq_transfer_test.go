package engine

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"feilian/engine/transfer"
)

func TestFeiqFileTransferCompatibility(t *testing.T) {
	t.Run("发送到飞秋可按IPMsg请求行拉取", func(t *testing.T) {
		port := freePort(t)
		e := New(Config{Nick: "飞联用户", Hostname: "PC-FEILIAN", Port: port}, make(chan Event, 16))
		if err := e.Start(); err != nil {
			t.Fatalf("Start: %v", err)
		}
		defer e.Stop()
		remote, remoteAddr := loopbackPeer(t)
		e.handleFeiqNative(FeiqNative{Login: "Admin", Nick: "飞秋用户", Host: "FEIQ-PC", Command: 6291457}, "sample", remoteAddr)

		src := filepath.Join(t.TempDir(), "飞秋兼容.txt")
		content := []byte("文件传输内容")
		if err := os.WriteFile(src, content, 0o644); err != nil {
			t.Fatal(err)
		}
		msgID, err := e.SendFiles(remoteAddr.String(), "附件", []string{src})
		if err != nil {
			t.Fatalf("SendFiles: %v", err)
		}
		buf := make([]byte, 2048)
		var pkt Packet
		for {
			remote.SetReadDeadline(time.Now().Add(time.Second))
			n, _, err := remote.ReadFromUDP(buf)
			if err != nil {
				t.Fatalf("未收到文件通知: %v", err)
			}
			var ok bool
			pkt, ok = ParsePacket(string(buf[:n]))
			if ok && pkt.HasOpt(OptFileAttach) {
				break
			}
		}
		if pkt.PacketNo == 0 {
			t.Fatalf("文件通知格式异常: %+v", pkt)
		}
		text, entries := DecodeFileExtra(DecodeExtra(pkt.Extra))
		if text != "附件" || len(entries) != 1 || entries[0].Name != "飞秋兼容.txt" || msgID != fmt.Sprint(pkt.PacketNo) {
			t.Fatalf("飞秋文件通知内容异常: text=%q entries=%+v msgID=%s", text, entries, msgID)
		}

		conn, err := net.Dial("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := fmt.Fprintf(conn, "%x:%x:0:\n", pkt.PacketNo, entries[0].ID); err != nil {
			conn.Close()
			t.Fatal(err)
		}
		payload, err := io.ReadAll(conn)
		if err != nil {
			conn.Close()
			t.Fatalf("飞秋 TCP 拉取失败: %v", err)
		}
		conn.Close()
		if string(payload) != string(content) {
			t.Fatalf("文件内容不一致: %q", payload)
		}
	})

	t.Run("从飞秋IPMsg通道接收文件", func(t *testing.T) {
		port := freePort(t)
		ch := make(chan Event, 16)
		e := New(Config{Nick: "飞联用户", Hostname: "PC-FEILIAN", Port: port}, ch)
		if err := e.Start(); err != nil {
			t.Fatalf("Start: %v", err)
		}
		defer e.Stop()

		remote, remoteAddr := loopbackPeer(t)
		remoteServer, err := transfer.NewServer(remoteAddr.Port, nil)
		if err != nil {
			t.Fatalf("飞秋 TCP 模拟服务: %v", err)
		}
		defer remoteServer.Close()
		src := filepath.Join(t.TempDir(), "来源.bin")
		content := []byte("来自飞秋的文件数据")
		if err := os.WriteFile(src, content, 0o644); err != nil {
			t.Fatal(err)
		}
		if err := remoteServer.ShareWithID(7, src); err != nil {
			t.Fatal(err)
		}

		e.handleFeiqNative(FeiqNative{PacketNo: 11, Login: "Admin", Nick: "飞秋用户", Host: "FEIQ-PC", Command: 6291457}, "sample", remoteAddr)
		name, err := EncodeGBK("来自飞秋.bin")
		if err != nil {
			t.Fatal(err)
		}
		text, err := EncodeGBK("附件消息")
		if err != nil {
			t.Fatal(err)
		}
		extra := text + "\x00" + fmt.Sprintf("7:%s:%x:%x:1\a", name, len(content), time.Now().Unix())
		e.handlePacket(Packet{PacketNo: 99, Nick: "飞秋用户", Host: "FEIQ-PC", Command: CmdSendMsg | OptFileAttach | OptSendCheck, Extra: extra}, remoteAddr)
		buf := make([]byte, 512)
		remote.SetReadDeadline(time.Now().Add(time.Second))
		n, _, err := remote.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("飞秋文件请求未收到回执: %v", err)
		}
		receipt, ok := ParsePacket(string(buf[:n]))
		if !ok || receipt.Command != CmdRecvMsg || receipt.Extra != "99" {
			t.Fatalf("飞秋文件回执异常: %+v ok=%v", receipt, ok)
		}
		req := recvEvent(t, ch, EventFileRequest, time.Second)
		if req.Text != "附件消息" || len(req.Files) != 1 || req.Files[0].Name != "来自飞秋.bin" {
			t.Fatalf("飞秋文件请求解析异常: %+v", req)
		}
		destDir := t.TempDir()
		if err := e.AcceptFiles(req.MsgID, destDir); err != nil {
			t.Fatalf("AcceptFiles: %v", err)
		}
		done := recvEvent(t, ch, EventFileDone, 3*time.Second)
		got, err := os.ReadFile(done.Text)
		if err != nil || string(got) != string(content) {
			t.Fatalf("接收文件异常: data=%q err=%v", got, err)
		}
	})
}
