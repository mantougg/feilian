// 文件传输管理（T-M3-3 / T-M3-4）：
// 发送侧展开文件/目录 → 注册共享 → 发带附件消息；
// 接收侧收到请求推 EventFileRequest，AcceptFiles 后拉取并推进度/完成事件。
package engine

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"feilian/engine/transfer"
)

// SendFiles 向指定地址发送文件（可含目录，递归展开为条目树），
// 返回带附件消息的报文 PacketNo（对端凭它 AcceptFiles）。
func (e *Engine) SendFiles(dst, text string, paths []string) (string, error) {
	if e.tserver == nil {
		return "", ErrNotStarted
	}
	ip, port, err := e.resolveAddr(dst)
	if err != nil {
		return "", err
	}
	entries, paths2, err := e.buildEntries(paths)
	if err != nil {
		return "", err
	}
	if len(entries) == 0 {
		return "", fmt.Errorf("engine: 没有可发送的文件")
	}
	// 文件条目注册进共享表（目录条目无流可拉，不注册），ID 与协议条目一致
	for i, fe := range entries {
		if !fe.IsDir() {
			if serr := e.tserver.ShareWithID(fe.ID, paths2[i]); serr != nil {
				return "", serr
			}
		}
	}
	extra := EncodeFileExtra(text, entries)
	return e.sendPacket(CmdSendMsg|OptFileAttach|OptSendCheck, extra, &net.UDPAddr{IP: ip, Port: port})
}

// buildEntries 展开路径列表为协议条目：目录递归（T-M3-4），
// 根条目 attr=Dir 且 RelPath 为空，子孙条目带 fl= 相对路径。
func (e *Engine) buildEntries(paths []string) ([]FileEntry, []string, error) {
	var entries []FileEntry
	var absPaths []string // entries[i] 对应的真实绝对路径（目录条目为其目录路径）
	var id uint32
	add := func(fe FileEntry, abs string) {
		id++
		fe.ID = id
		entries = append(entries, fe)
		absPaths = append(absPaths, abs)
	}
	for _, p := range paths {
		abs, err := filepath.Abs(p)
		if err != nil {
			return nil, nil, err
		}
		st, err := os.Stat(abs)
		if err != nil {
			return nil, nil, err
		}
		name := filepath.Base(abs)
		if !st.IsDir() {
			add(FileEntry{Name: name, Size: st.Size(), MTime: st.ModTime().Unix(), Attr: FileAttrRegular}, abs)
			continue
		}
		// 目录根条目（RelPath 为空表示树根）
		add(FileEntry{Name: name, MTime: st.ModTime().Unix(), Attr: FileAttrDir}, abs)
		// 递归收集子孙；排序保证条目顺序稳定（父目录先于其内容）
		var files []string
		werr := filepath.WalkDir(abs, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if path == abs {
				return nil
			}
			files = append(files, path)
			return nil
		})
		if werr != nil {
			return nil, nil, werr
		}
		sort.Strings(files)
		relBase := filepath.Dir(abs)
		for _, f := range files {
			fst, serr := os.Stat(f)
			if serr != nil {
				continue
			}
			rel, serr := filepath.Rel(relBase, f)
			if serr != nil {
				continue
			}
			rel = filepath.ToSlash(rel) // 线上路径统一正斜杠
			if fst.IsDir() {
				add(FileEntry{Name: filepath.Base(f), MTime: fst.ModTime().Unix(), Attr: FileAttrDir, RelPath: rel}, f)
			} else {
				add(FileEntry{Name: filepath.Base(f), Size: fst.Size(), MTime: fst.ModTime().Unix(), Attr: FileAttrRegular, RelPath: rel}, f)
			}
		}
	}
	return entries, absPaths, nil
}

// handleFileRequest 处理带附件的消息：推 EventFileRequest（对端据此弹接收确认）。
func (e *Engine) handleFileRequest(pkt Packet, from *net.UDPAddr) {
	text, entries := DecodeFileExtra(pkt.Extra)
	if len(entries) == 0 {
		return
	}
	e.upsertPresence(pkt, from)
	peer := Peer{Nick: pkt.Nick, Host: pkt.Host, IP: from.IP.String(), Port: from.Port}
	if p, ok := e.peerInfo(peerKey(pkt.Nick, pkt.Host)); ok {
		peer.Dept, peer.Status = p.Dept, p.Status
	}
	// 请求入 pending 表：AcceptFiles 凭 MsgID（= 请求报文 PacketNo）取回上下文
	reqID := strconv.FormatUint(pkt.PacketNo, 10)
	e.xfersMu.Lock()
	e.pending[reqID] = fileRequest{from: from, peer: peer, entries: entries}
	e.xfersMu.Unlock()
	e.emit(Event{
		Type:  EventFileRequest,
		Peer:  peer,
		MsgID: reqID,
		Text:  DecodeExtra(text),
		Files: entries,
		Time:  time.Now(),
	})
}

// AcceptFiles 接受一次文件请求（reqID = 请求报文 PacketNo 字符串）：
// 逐条目拉取落盘到 saveDir（目录条目只建树不拉流），推进度与完成事件。
func (e *Engine) AcceptFiles(reqID, saveDir string) error {
	// 从最近一次请求事件里恢复条目：由 UI 传入，简单起见管理器保存 pending 表
	e.xfersMu.Lock()
	req := e.pending[reqID]
	delete(e.pending, reqID)
	if _, running := e.xfers[reqID]; running {
		e.xfersMu.Unlock()
		return fmt.Errorf("engine: 传输 %s 已在进行", reqID)
	}
	ctx, cancel := context.WithCancel(context.Background())
	e.xfers[reqID] = &xferTask{cancel: cancel}
	e.xfersMu.Unlock()

	go e.receiveLoop(ctx, reqID, req, saveDir, cancel)
	return nil
}

// CancelTransfer 取消进行中的接收任务。
func (e *Engine) CancelTransfer(reqID string) {
	e.xfersMu.Lock()
	if t, ok := e.xfers[reqID]; ok {
		t.cancel()
	}
	e.xfersMu.Unlock()
}

// fileRequest 一次待接受请求的上下文。
type fileRequest struct {
	from    *net.UDPAddr
	peer    Peer
	entries []FileEntry
}

// rejectRequest 拒绝请求（UI 不接受时调用，清 pending 表）。
func (e *Engine) RejectFiles(reqID string) {
	e.xfersMu.Lock()
	delete(e.pending, reqID)
	e.xfersMu.Unlock()
}

// receiveLoop 执行实际接收：建树 → 逐文件拉取 → 进度/完成事件。
func (e *Engine) receiveLoop(ctx context.Context, reqID string, req fileRequest, saveDir string, cancel context.CancelFunc) {
	defer cancel()
	defer func() {
		e.xfersMu.Lock()
		delete(e.xfers, reqID)
		e.xfersMu.Unlock()
	}()

	addr := fmt.Sprintf("%s:%d", req.from.IP.String(), req.from.Port)
	for _, fe := range req.entries {
		if ctx.Err() != nil {
			e.emit(Event{Type: EventEngineError, Text: "传输已取消", MsgID: reqID, Time: time.Now()})
			return
		}
		rel := fe.RelPath
		if fe.IsDir() {
			if err := os.MkdirAll(filepath.Join(saveDir, filepath.FromSlash(rel)), 0o755); err != nil {
				e.emit(Event{Type: EventEngineError, Text: "建目录失败: " + err.Error(), MsgID: reqID, Time: time.Now()})
				return
			}
			continue
		}
		dstPath := uniquePath(filepath.Join(saveDir, filepath.FromSlash(rel)))
		if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
			e.emit(Event{Type: EventEngineError, Text: "建目录失败: " + err.Error(), MsgID: reqID, Time: time.Now()})
			return
		}
		if err := e.fetchOne(ctx, addr, fe, dstPath, reqID); err != nil {
			if ctx.Err() != nil {
				e.emit(Event{Type: EventEngineError, Text: "传输已取消", MsgID: reqID, Time: time.Now()})
			} else {
				e.emit(Event{Type: EventEngineError, Text: "拉取失败: " + err.Error(), MsgID: reqID, Time: time.Now()})
			}
			return
		}
		e.emit(Event{Type: EventFileDone, MsgID: reqID, Text: dstPath, Peer: req.peer, Time: time.Now()})
	}
}

// fetchOne 拉取单文件并按 500ms 节流推进度。
func (e *Engine) fetchOne(ctx context.Context, addr string, fe FileEntry, dstPath, reqID string) error {
	f, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer f.Close()

	var done int64
	lastEmit := time.Now()
	pw := &progressWriter{
		w:     f,
		total: fe.Size,
		onTick: func(written int64) {
			done = written
			if time.Since(lastEmit) >= 500*time.Millisecond {
				lastEmit = time.Now()
				e.emitProgress(reqID, fe, written)
			}
		},
	}
	if _, err := transfer.Fetch(ctx, addr, fe.ID, pw, nil); err != nil {
		return err
	}
	e.emitProgress(reqID, fe, done)
	return nil
}

// emitProgress 推一次进度事件（百分比按条目大小；未知大小只报字节）。
func (e *Engine) emitProgress(reqID string, fe FileEntry, written int64) {
	pct := 0
	if fe.Size > 0 {
		pct = int(written * 100 / fe.Size)
		if pct > 100 {
			pct = 100
		}
	}
	e.emit(Event{Type: EventFileProgress, MsgID: reqID, Text: fe.Name, Progress: pct, Time: time.Now()})
}

// progressWriter 透传写入底层文件并按比例节流回调进度。
type progressWriter struct {
	w       io.Writer // 底层落盘目标
	total   int64
	written int64
	onTick  func(written int64)
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.w.Write(b)
	p.written += int64(n)
	if n > 0 && p.onTick != nil {
		tick := p.written >= p.total || p.written%(max(p.total/30, 1)) < int64(n)
		if tick {
			p.onTick(p.written)
		}
	}
	return n, err
}

// uniquePath 落盘重名策略：追加序号重命名（report.pdf → report(1).pdf），
// 不静默覆盖已有文件。
func uniquePath(p string) string {
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return p
	}
	ext := filepath.Ext(p)
	base := strings.TrimSuffix(p, ext)
	for i := 1; ; i++ {
		cand := fmt.Sprintf("%s(%d)%s", base, i, ext)
		if _, err := os.Stat(cand); os.IsNotExist(err) {
			return cand
		}
	}
}

// SendGroupText 本地分组群聊（T-M5-2，用户拍板「本地分组即可」形态）：
// 同一文本逐一单播给成员列表（IPMsg 原生无群概念，飞联扩展 CmdFeiLinkGroupMsg
// 仅用于将来成员聚合；M5 阶段对端按普通单聊消息呈现）。
// 返回首个失败（其余照发，尽力而为语义）。
func (e *Engine) SendGroupText(text string, targets []string) error {
	var firstErr error
	for _, dst := range targets {
		if _, err := e.SendText(dst, text); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
