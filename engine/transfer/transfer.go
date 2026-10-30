// Package transfer 是飞联的 TCP 文件传输通道（T-M3-2）：
// 发送方监听，接收方凭文件请求中的 fileID 建立连接拉取；
// 协议为「请求行 + 裸数据流」，块大小与并发数可配，限速经令牌桶实现。
//
// 线上协议（TCP 2425，短连接）：
//
//	FLTN/1 <space> <fileID> \n
//	<64KB ~ N 字节二进制数据>…（发满整个文件后关闭）
package transfer

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultPort TCP 监听端口（与 UDP 同号，IPMsg 惯例）。
	DefaultPort = 2425
	// DefaultChunkSize 拉取块大小。
	DefaultChunkSize = 64 << 10
	// Magic 是请求行前缀，用于快速识别飞联连接（区别于直连飞秋的 TCP）。
	Magic = "FLTN/1"
)

// ErrNotFound 请求的 fileID 不在共享表中（已取消或从未存在）。
var ErrNotFound = errors.New("transfer: file not found")

// share 记录一个对外共享的文件（发送侧）。
type share struct {
	Path string // 绝对路径
	Size int64
}

// Limiter 传输限速接口（字节/秒；0 或 nil 表示不限速）。
type Limiter interface {
	// Wait 阻塞直到可以继续传 n 字节；ctx 取消时返回其错误。
	Wait(ctx context.Context, n int) error
}

// clockLimiter 是固定速率的朴素令牌实现（T-M5-4 分档限速在其上封装）。
type clockLimiter struct {
	mu        sync.Mutex
	bytesPerS int
	budget    int
	last      time.Time
}

// NewLimiter 创建 bytesPerSecond 字节/秒的限速器；<=0 返回 nil（不限速）。
func NewLimiter(bytesPerSecond int) Limiter {
	if bytesPerSecond <= 0 {
		return nil
	}
	return &clockLimiter{bytesPerS: bytesPerSecond, last: time.Now()}
}

func (l *clockLimiter) Wait(ctx context.Context, n int) error {
	for n > 0 {
		if err := ctx.Err(); err != nil {
			return err
		}
		l.mu.Lock()
		now := time.Now()
		l.budget += int(now.Sub(l.last).Seconds() * float64(l.bytesPerS))
		if l.budget > l.bytesPerS {
			l.budget = l.bytesPerS // 桶容量 = 1 秒突发
		}
		l.last = now
		grant := min(l.budget, n)
		l.budget -= grant
		l.mu.Unlock()

		if grant > 0 {
			n -= grant
			continue
		}
		// 预算耗尽：睡到按速率攒够 1 字节的时间，再循环
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second / time.Duration(l.bytesPerS) * 4):
		}
	}
	return nil
}

// Server 发送侧：监听 TCP，按 fileID 供出共享文件。
type Server struct {
	ln     net.Listener
	mu     sync.RWMutex
	shares map[uint32]share
	nextID uint32
	lim    Limiter
	wg     sync.WaitGroup
}

// NewServer 监听 port 并开始服务；lim 为 nil 不限速。
func NewServer(port int, lim Limiter) (*Server, error) {
	if port == 0 {
		port = DefaultPort
	}
	ln, err := net.Listen("tcp4", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("transfer: 监听 TCP %d: %w", port, err)
	}
	s := &Server{ln: ln, shares: make(map[uint32]share), lim: lim}
	go s.acceptLoop()
	return s, nil
}

// ShareWithID 以指定 fileID 注册共享文件（发送侧条目 ID 需与协议一致）。
func (s *Server) ShareWithID(id uint32, path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	st, err := os.Stat(abs)
	if err != nil {
		return err
	}
	if st.IsDir() {
		return fmt.Errorf("transfer: %s 是目录，请先展开为文件列表", path)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.shares[id] = share{Path: abs, Size: st.Size()}
	return nil
}

// Share 注册一个对外共享文件，返回接收方拉取用的 fileID。
func (s *Server) Share(path string) (uint32, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return 0, err
	}
	st, err := os.Stat(abs)
	if err != nil {
		return 0, err
	}
	if st.IsDir() {
		return 0, fmt.Errorf("transfer: %s 是目录，请先展开为文件列表（T-M3-4）", path)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	id := s.nextID
	s.shares[id] = share{Path: abs, Size: st.Size()}
	return id, nil
}

// Unshare 取消共享（发送方撤回）。
func (s *Server) Unshare(id uint32) {
	s.mu.Lock()
	delete(s.shares, id)
	s.mu.Unlock()
}

// Port 返回实际监听端口（测试用 0 端口时取随机值）。
func (s *Server) Port() int { return s.ln.Addr().(*net.TCPAddr).Port }

// Close 停止监听并等待在途连接结束。
func (s *Server) Close() {
	s.ln.Close()
	s.wg.Wait()
}

func (s *Server) acceptLoop() {
	for {
		conn, err := s.ln.Accept()
		if err != nil {
			return
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.serveConn(conn)
		}()
	}
}

// serveConn 处理单个拉取连接：解析请求行 → 定位文件 → 流式发送。
func (s *Server) serveConn(conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second)) // 只约束请求头；开传后放开

	id, err := readRequest(conn)
	if err != nil {
		return
	}
	s.mu.RLock()
	sh, ok := s.shares[id]
	s.mu.RUnlock()
	if !ok {
		return // 静默关闭：接收方读 0 字节即知失败
	}
	f, err := os.Open(sh.Path)
	if err != nil {
		return
	}
	defer f.Close()

	conn.SetDeadline(time.Time{}) // 大文件传输不设超时，由取消/断连兜底
	buf := make([]byte, DefaultChunkSize)
	ctx := context.Background()
	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			if s.lim != nil {
				if werr := s.lim.Wait(ctx, n); werr != nil {
					return
				}
			}
			if _, werr := conn.Write(buf[:n]); werr != nil {
				return
			}
		}
		if rerr == io.EOF {
			return
		}
		if rerr != nil {
			return
		}
	}
}

// readRequest 解析请求行 "FLTN/1 <fileID>\n"。
func readRequest(conn net.Conn) (uint32, error) {
	line, err := bufio.NewReader(io.LimitReader(conn, 128)).ReadString('\n')
	if err != nil {
		return 0, err
	}
	ver, idStr, ok := strings.Cut(strings.TrimSpace(line), " ")
	if !ok || ver != Magic {
		return 0, fmt.Errorf("transfer: 非法请求行 %q", line)
	}
	var id uint32
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		return 0, fmt.Errorf("transfer: 非法 fileID %q", idStr)
	}
	return id, nil
}

// Fetch 从 ip:port 拉取 fileID 写入 dst（接收侧）。dst 由调用方建好。
// 返回写入字节数；服务端断开即视为结束（读多少写多少）。
func Fetch(ctx context.Context, addr string, fileID uint32, dst io.Writer, lim Limiter) (int64, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp4", addr)
	if err != nil {
		return 0, fmt.Errorf("transfer: 连接 %s: %w", addr, err)
	}
	defer conn.Close()

	if dl, ok := ctx.Deadline(); ok {
		conn.SetDeadline(dl)
	} else {
		conn.SetDeadline(time.Now().Add(10 * time.Second)) // 只约束请求阶段
	}
	if _, err := fmt.Fprintf(conn, "%s %d\n", Magic, fileID); err != nil {
		return 0, err
	}
	conn.SetDeadline(time.Time{})

	var total int64
	buf := make([]byte, DefaultChunkSize)
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		n, rerr := conn.Read(buf)
		if n > 0 {
			if lim != nil {
				if werr := lim.Wait(ctx, n); werr != nil {
					return total, werr
				}
			}
			if _, werr := dst.Write(buf[:n]); werr != nil {
				return total, werr
			}
			total += int64(n)
		}
		if rerr == io.EOF {
			return total, nil
		}
		if rerr != nil {
			return total, rerr
		}
	}
}
