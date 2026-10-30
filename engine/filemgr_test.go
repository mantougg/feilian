package engine

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 端到端：A SendFiles（含目录树）→ B 收 EventFileRequest → AcceptFiles →
// 落盘内容一致 + 目录结构重建 + EventFileDone。
func TestFileTransferEndToEnd(t *testing.T) {
	// 同机联调拓扑：A 用默认端口 2425，B 用随机异端口。
	// 发现闭环：B 广播到 [自己端口, 2425] → A 收到 → A 按 B 源端口单播 AnsEntry → B 收到。
	// （同端口双绑时 AnsEntry 只投先绑定者、TCP 也无法同端口双听，故必须异端口）
	portA, portB := DefaultPort, freePort(t)
	chA := make(chan Event, 64)
	a := New(Config{Nick: "甲", Hostname: "PC-A", Port: portA}, chA)
	if err := a.Start(); err != nil {
		t.Skipf("默认端口 2425 被占用，跳过: %v", err)
	}
	defer a.Stop()

	chB := make(chan Event, 64)
	b := New(Config{Nick: "乙", Hostname: "PC-B", Port: portB}, chB)
	if err := b.Start(); err != nil {
		t.Fatal(err)
	}
	defer b.Stop()

	// 双方都应发现对方（A 收 B 广播；B 收 A 的 AnsEntry）
	evA := recvEvent(t, chA, EventPeerOnline, 3*time.Second)
	recvEvent(t, chB, EventPeerOnline, 3*time.Second)
	bIP := evA.Peer.IP // B 的广播源 IP（本机为 LAN IP，非 127.0.0.1）

	// 准备源目录树：根/子目录/文件
	srcRoot := t.TempDir()
	sub := filepath.Join(srcRoot, "docs")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	payload := []byte("飞联端到端文件传输验收内容 🚀")
	if err := os.WriteFile(filepath.Join(srcRoot, "readme.txt"), payload, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "inner.txt"), []byte("嵌套文件"), 0o644); err != nil {
		t.Fatal(err)
	}

	// A 发送整个目录（用用户表里的 B 真实 IP，端口查表得 B 监听口）
	if _, err := a.SendFiles(bIP, "验收材料", []string{srcRoot}); err != nil {
		t.Fatalf("SendFiles: %v", err)
	}

	// B 收请求
	ev := recvEvent(t, chB, EventFileRequest, 3*time.Second)
	if len(ev.Files) < 4 { // 根目录 + readme + docs + inner
		t.Fatalf("条目数不足: %d", len(ev.Files))
	}
	if ev.Text != "验收材料" {
		t.Fatalf("附带文本 = %q", ev.Text)
	}

	// B 接受（先把 pending 与请求对齐：AcceptFiles 用引擎内保存的 pending）
	saveDir := t.TempDir()
	if err := b.AcceptFiles(ev.MsgID, saveDir); err != nil {
		t.Fatalf("AcceptFiles: %v", err)
	}

	// 等完成事件（readme + inner 两个文件 → 两个 done）
	donePaths := map[string]bool{}
	deadline := time.After(5 * time.Second)
	for len(donePaths) < 2 {
		select {
		case e := <-chB:
			switch e.Type {
			case EventFileDone:
				donePaths[e.Text] = true
			case EventEngineError:
				t.Fatalf("引擎错误: %s", e.Text)
			}
		case <-deadline:
			t.Fatalf("完成事件不足: %v", donePaths)
		}
	}

	// 内容与目录树校验
	got, err := os.ReadFile(filepath.Join(saveDir, filepath.Base(srcRoot), "readme.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatalf("内容不一致: %q", got)
	}
	got2, err := os.ReadFile(filepath.Join(saveDir, filepath.Base(srcRoot), "docs", "inner.txt"))
	if err != nil {
		t.Fatalf("目录树未重建: %v", err)
	}
	if string(got2) != "嵌套文件" {
		t.Fatalf("嵌套内容不一致: %q", got2)
	}
}

// 重复落盘重命名：同名文件第二次接收落为 name(1).ext。
func TestUniquePath(t *testing.T) {
	dir := t.TempDir()
	p1 := filepath.Join(dir, "a.txt")
	if err := os.WriteFile(p1, []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniquePath(p1); got != filepath.Join(dir, "a(1).txt") {
		t.Fatalf("uniquePath = %s", got)
	}
	if err := os.WriteFile(filepath.Join(dir, "a(1).txt"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniquePath(p1); got != filepath.Join(dir, "a(2).txt") {
		t.Fatalf("uniquePath = %s", got)
	}
	// 无冲突原样返回
	if got := uniquePath(filepath.Join(dir, "b.txt")); got != filepath.Join(dir, "b.txt") {
		t.Fatalf("uniquePath = %s", got)
	}
}
