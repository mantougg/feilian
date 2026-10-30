package transfer

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 验收（T-M3-2 基础链路）：端到端拉取一个文件，内容一致。
func TestFetchRoundTrip(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "验收材料.bin")
	payload := bytes.Repeat([]byte("飞联传输测试-\x00\x01\x02-"), 5000) // ~85KB，跨多块
	if err := os.WriteFile(src, payload, 0o644); err != nil {
		t.Fatal(err)
	}

	srv, err := NewServer(0, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	id, err := srv.Share(src)
	if err != nil {
		t.Fatal(err)
	}

	var got bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	n, err := Fetch(ctx, fmt.Sprintf("127.0.0.1:%d", srv.Port()), id, &got, nil)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if n != int64(len(payload)) || !bytes.Equal(got.Bytes(), payload) {
		t.Fatalf("内容不一致: n=%d want=%d", n, len(payload))
	}
}

func TestIPMsgFetchAndOffsetRequest(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "feiq.bin")
	payload := []byte("0123456789")
	if err := os.WriteFile(src, payload, 0o644); err != nil {
		t.Fatal(err)
	}
	srv, err := NewServer(0, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	if err := srv.ShareWithID(10, src); err != nil {
		t.Fatal(err)
	}
	addr := fmt.Sprintf("127.0.0.1:%d", srv.Port())

	var got bytes.Buffer
	n, err := FetchIPMsg(context.Background(), addr, 0x1234, 10, int64(len(payload)), &got, nil)
	if err != nil || n != int64(len(payload)) || !bytes.Equal(got.Bytes(), payload) {
		t.Fatalf("IPMsg 拉取异常: n=%d err=%v data=%q", n, err, got.Bytes())
	}

	conn, err := net.Dial("tcp4", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := fmt.Fprint(conn, "1234:a:5:\n"); err != nil {
		t.Fatal(err)
	}
	suffix, err := io.ReadAll(conn)
	if err != nil || string(suffix) != "56789" {
		t.Fatalf("偏移请求异常: data=%q err=%v", suffix, err)
	}
}

// 限速生效：1MB 文件限 250KB/s，耗时应 ≥ 3s。
func TestLimiterSlowsTransfer(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "speed.bin")
	payload := make([]byte, 1<<20) // 1MB
	if err := os.WriteFile(src, payload, 0o644); err != nil {
		t.Fatal(err)
	}

	srv, err := NewServer(0, NewLimiter(250<<10))
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	id, err := srv.Share(src)
	if err != nil {
		t.Fatal(err)
	}

	start := time.Now()
	_, err = Fetch(context.Background(), fmt.Sprintf("127.0.0.1:%d", srv.Port()), id, io.Discard, NewLimiter(250<<10))
	if err != nil {
		t.Fatal(err)
	}
	if el := time.Since(start); el < 3*time.Second {
		t.Fatalf("限速未生效：1MB @250KB/s 只用了 %v", el)
	}
}

// 未知 fileID：服务端静默关闭，Fetch 必须报错——
// 否则上层会把 0 字节当「传输完成」落出空文件。
func TestFetchUnknownID(t *testing.T) {
	srv, err := NewServer(0, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	n, err := Fetch(context.Background(), fmt.Sprintf("127.0.0.1:%d", srv.Port()), 999, io.Discard, nil)
	if err == nil || n != 0 {
		t.Fatalf("n=%d err=%v（未注册 fileID 应报错）", n, err)
	}
}

// Share 拒绝目录与不存在的路径。
func TestShareValidation(t *testing.T) {
	srv, err := NewServer(0, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	if _, err := srv.Share(t.TempDir()); err == nil {
		t.Fatal("目录应被拒绝")
	}
	if _, err := srv.Share(filepath.Join(t.TempDir(), "不存在")); err == nil {
		t.Fatal("不存在路径应被拒绝")
	}
}

// NewLimiter 零值返回 nil（不限速），调用处对 nil 直通。
func TestNewLimiterZero(t *testing.T) {
	if NewLimiter(0) != nil || NewLimiter(-1) != nil {
		t.Fatal("<=0 应返回 nil")
	}
}
