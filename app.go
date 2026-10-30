package main

import (
	"context"
	"errors"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gen2brain/beeep"

	"feilian/config"
	"feilian/engine"
	"feilian/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SelfInfo 是 GetSelf/SetSelf 暴露给前端的「我自己」资料。
type SelfInfo struct {
	Nick     string `json:"nick"`
	Hostname string `json:"hostname"`
	IP       string `json:"ip"`
	Dept     string `json:"dept"`
	Status   string `json:"status"`
}

// App 是绑定给前端（window.go.main.App.*）的宿主能力入口。
// 网络能力不经由这里 —— 引擎事件走 engine.Engine 的通道，
// 由 startup 里起的转发协程推到 Wails Events（T-M1-5）。
type App struct {
	ctx         context.Context
	engine      *engine.Engine
	events      chan engine.Event // 事件通道由 App 持有：引擎启动失败时也能向 UI 推错误
	cfgData     config.Data       // 本地配置快照（T-M4-5 持久化）
	recvDirPath string            // 接收目录（设置覆盖；空 = 默认下载目录）
	db          *store.Store      // 聊天记录（T-M4-6）；打开失败仅丢历史功能
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = a.initLogging(ctx)
	a.loadConfig()
	a.openStore()
	a.startEngine()
	a.registerHotkeys()
}

// initLogging 把标准日志重定向到 %AppData%\feilian\feilian.log（追加，
// 超 2MB 轮换一次；os.UserConfigDir 在 Windows 即 Roaming）。
// GUI 形态没有控制台，引擎诊断（如无法解析报文的来源
// 与 hex 样例）只有落盘才可远程取证。
func (a *App) initLogging(ctx context.Context) context.Context {
	dir, err := os.UserConfigDir()
	if err == nil {
		dir = filepath.Join(dir, "feilian")
		if mkErr := os.MkdirAll(dir, 0o755); mkErr == nil {
			path := filepath.Join(dir, "feilian.log")
			if st, stErr := os.Stat(path); stErr == nil && st.Size() > 2<<20 {
				_ = os.Rename(path, path+".old") // 简单轮换：满 2MB 挪走重开
			}
			if f, fErr := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); fErr == nil {
				log.SetOutput(f)
				log.SetFlags(log.LstdFlags | log.Lmicroseconds)
				log.Printf("---- 飞联启动 ----")
			}
		}
	}
	return ctx
}

// triggerScreenshot 供热键与前端统一入口：拉底图并通知前端打开截图工具。
func (a *App) triggerScreenshot() {
	runtime.Show(a.ctx)
	runtime.EventsEmit(a.ctx, "ui:screenshot")
}

// openStore 打开聊天记录库（与配置同目录）。
func (a *App) openStore() {
	base := config.Path()
	db, err := store.StorePath(filepath.Dir(base))
	if err != nil {
		log.Printf("聊天记录库打开失败（历史功能停用）: %v", err)
		return
	}
	a.db = db
}

// loadConfig 读取本地配置：昵称/部门/状态注入引擎，主题/接收目录等留给前端拉取。
func (a *App) loadConfig() {
	d, err := config.Load()
	if err != nil {
		log.Printf("配置损坏，按默认值运行: %v", err)
	}
	a.cfgData = d
	a.recvDirPath = d.RecvDir
}

// saveConfig 把引擎当前资料与设置快照落盘。
func (a *App) saveConfig() {
	if a.engine != nil {
		c := a.engine.Self()
		a.cfgData.Nick, a.cfgData.Dept, a.cfgData.Status = c.Nick, c.Dept, c.Status
	}
	a.cfgData.RecvDir = a.recvDirPath
	if err := config.Save(a.cfgData); err != nil {
		log.Printf("配置保存失败: %v", err)
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.engine != nil {
		a.engine.Stop()
	}
	if a.db != nil {
		a.db.Close()
	}
}

// startEngine 创建并启动网络引擎；失败（如端口被占）不阻断窗口，
// 界面仍可用，空用户列表即引擎缺席的可见信号。
func (a *App) startEngine() {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}
	a.events = make(chan engine.Event, 64)
	cfg := engine.Config{
		Hostname: hostname,
		Status:   engine.StatusOnline,
	}
	// 配置里有昵称用配置的，否则首启用主机名并落盘
	if a.cfgData.Nick != "" {
		cfg.Nick, cfg.Dept, cfg.Status = a.cfgData.Nick, a.cfgData.Dept, a.cfgData.Status
	} else {
		cfg.Nick = hostname
		a.cfgData.Nick = hostname
		a.saveConfig()
	}
	if cfg.Status != engine.StatusOnline && cfg.Status != engine.StatusBusy && cfg.Status != engine.StatusAway {
		cfg.Status = engine.StatusOnline
	}
	a.engine = engine.New(cfg, a.events)
	a.applyLimitRate()
	go a.pumpEvents() // 先起转发：Start 失败的错误事件也能到达前端
	if err := a.engine.Start(); err != nil {
		a.engine = nil
		log.Printf("引擎启动失败: %v", err)
		a.emitError("网络引擎启动失败：" + explainEngineError(err))
		return
	}
	go a.pumpEvents()
}

// emitError 把错误作为引擎错误事件推给前端（引擎缺席时也走同一通道）。
func (a *App) emitError(text string) {
	defer func() { _ = recover() }() // 通道满/未初始化时不因错误报告而 panic
	select {
	case a.events <- engine.Event{Type: engine.EventEngineError, Text: text, Time: time.Now()}:
	default:
	}
}

// explainEngineError 把常见启动失败翻译成用户能行动的话。
func explainEngineError(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "bind") {
		return msg + " —— 端口被占用（本机可能已运行飞秋或另一实例飞联）。" +
			"可用 netstat -ano | findstr 2425 查看占用进程。"
	}
	return msg
}

// pumpEvents 把引擎事件逐条转发为同名 Wails 事件，payload 为完整 Event 对象；
// 引擎停止（通道关闭）后协程自然退出。
func (a *App) pumpEvents() {
	for ev := range a.events {
		a.recordEvent(ev)
		runtime.EventsEmit(a.ctx, ev.Type, ev)
	}
}

// recordEvent 把消息类事件落到 SQLite（T-M4-6）。失败仅日志，不影响实时聊天。
func (a *App) recordEvent(ev engine.Event) {
	if ev.Type == engine.EventMessage {
		a.notifyMessage(ev)
	}
	if a.db == nil {
		return
	}
	conv := ev.Peer.Nick + "@" + ev.Peer.Host
	m := store.Message{From: ev.Peer.Nick, SentAt: ev.Time.Unix()}
	switch ev.Type {
	case engine.EventMessage:
		m.Conv, m.Kind, m.Text, m.MsgRef = conv, "text", ev.Text, ev.MsgID
	case engine.EventFileRequest:
		m.Conv, m.Kind, m.Text, m.MsgRef = conv, "file", "文件传输", ev.MsgID
	default:
		return // presence/receipt/progress 等不落库
	}
	if _, err := a.db.Append(m); err != nil {
		log.Printf("记录落库失败: %v", err)
	}
}

// ---- 窗口控制（前端 src/lib/wailsBridge.ts 调用） ----

func (a *App) Minimize()       { runtime.WindowMinimise(a.ctx) }
func (a *App) ToggleMaximize() { runtime.WindowToggleMaximise(a.ctx) }

// CloseWindow 默认隐藏进托盘（T-M4-2），配置 closeToTray=false 时直接退出。
func (a *App) CloseWindow() {
	if a.cfgData.CloseToTrayEnabled() {
		runtime.Hide(a.ctx)
		return
	}
	runtime.Quit(a.ctx)
}

// IsDesktop 供前端区分「Wails 桌面运行」与「纯浏览器预览」两种形态。
func (a *App) IsDesktop() bool { return true }

// GetVersion 关于页用。
func (a *App) GetVersion() string { return "0.1.0" }

// ---- 聊天记录（T-M4-6）：前端历史加载 / 清空 / 搜索 ----

// History 按会话取历史（before 传空串表示从头取最新一页）。
func (a *App) History(conv string, before string, limit int) []store.Message {
	if a.db == nil {
		return nil
	}
	var bt time.Time
	if before != "" {
		sec, err := strconv.ParseInt(before, 10, 64)
		if err == nil {
			bt = time.Unix(sec, 0)
		}
	} else {
		bt = time.Now().Add(time.Second)
	}
	msgs, err := a.db.History(conv, bt, limit)
	if err != nil {
		log.Printf("历史查询失败: %v", err)
		return nil
	}
	return msgs
}

// SearchHistory 全文搜索（M5-T3 前端入口）。
func (a *App) SearchHistory(conv, keyword string) []store.Message {
	if a.db == nil {
		return nil
	}
	msgs, err := a.db.Search(conv, keyword, 50)
	if err != nil {
		return nil
	}
	return msgs
}

// ClearHistory 清空会话记录。
func (a *App) ClearHistory(conv string) error {
	if a.db == nil {
		return nil
	}
	return a.db.ClearConv(conv)
}

// ---- 文件传输桥接（T-M3-5）----

// PickFiles 弹出文件选择对话框，返回完整路径（取消返回空切片）。
// Wails v2.17 未暴露多选对话框，M3 先单文件逐个发（文件夹已支持整树）。
func (a *App) PickFiles() ([]string, error) {
	p, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择要发送的文件",
	})
	if err != nil || p == "" {
		return nil, err
	}
	return []string{p}, nil
}

// PickFolder 弹出目录选择对话框（发送整个文件夹）。
func (a *App) PickFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择要发送的文件夹",
	})
}

// SendFiles 发送文件/目录到指定 IP，返回消息报文序号。
func (a *App) SendFiles(ip, text string, paths []string) (string, error) {
	if a.engine == nil {
		return "", engine.ErrNotStarted
	}
	return a.engine.SendFiles(ip, text, paths)
}

// AcceptFiles 接受文件请求，落盘到接收目录（重名自动改名）。
func (a *App) AcceptFiles(reqID string) error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.AcceptFiles(reqID, a.recvDir())
}

// RejectFiles 拒绝文件请求。
func (a *App) RejectFiles(reqID string) {
	if a.engine != nil {
		a.engine.RejectFiles(reqID)
	}
}

// CancelTransfer 取消进行中的接收任务。
func (a *App) CancelTransfer(reqID string) {
	if a.engine != nil {
		a.engine.CancelTransfer(reqID)
	}
}

// OpenPath 在资源管理器中打开目录/选中文件（「打开文件夹」按钮）。
func (a *App) OpenPath(path string) error { return execOpen(path) }

// SetLimitRate 设置传输限速档位（"不限速"/"1MB/s"/"512KB/s"），持久化并即时生效。
func (a *App) SetLimitRate(label string) {
	a.cfgData.SpeedLimitLabel = label
	a.applyLimitRate()
	a.saveConfig()
}

// applyLimitRate 把档位标签换算为字节/秒并下发引擎。
func (a *App) applyLimitRate() {
	if a.engine == nil {
		return
	}
	switch a.cfgData.SpeedLimitLabel {
	case "1MB/s":
		a.engine.SetLimitRate(1 << 20)
	case "512KB/s":
		a.engine.SetLimitRate(512 << 10)
	default:
		a.engine.SetLimitRate(0)
	}
}

// GetRecvDir 当前接收目录（设置页展示与修改，T-M4-5 持久化）。
func (a *App) GetRecvDir() string { return a.recvDir() }

// SetRecvDir 设置接收目录并持久化。
func (a *App) SetRecvDir(dir string) {
	a.recvDirPath = dir
	a.cfgData.RecvDir = dir
	a.saveConfig()
}

// recvDir 返回接收目录：设置值优先，缺省 %USERPROFILE%\Downloads\飞联接收。
func (a *App) recvDir() string {
	if a.recvDirPath != "" {
		return a.recvDirPath
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, "Downloads", "飞联接收")
}

// ---- 引擎桥接（T-M1-5）：前端经绑定方法驱动引擎，只读 + 动作，不反向写状态 ----

// GetPeers 当前在线用户快照。
func (a *App) GetPeers() []engine.Peer {
	if a.engine == nil {
		return nil
	}
	return a.engine.Peers()
}

// EngineStats 引擎自诊断（监听端口/收发包数/在线数），空态排查入站链路用。
func (a *App) EngineStats() engine.Stats {
	if a.engine == nil {
		return engine.Stats{}
	}
	return a.engine.Stats()
}

// ProbePeers 手动重播上线广播（联系人空态「重新探测」按钮）。
func (a *App) ProbePeers() error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.Probe()
}

// GetUnparsedSamples 最近解析失败报文的诊断行（时间/来源/hex，供 UI 复制取证）。
func (a *App) GetUnparsedSamples() []string {
	if a.engine == nil {
		return nil
	}
	return a.engine.UnparsedSamples()
}

// SendText 向指定 IP 发送文本消息，返回报文 PacketNo 字符串（回执关联用）。
func (a *App) SendText(ip, text string) (string, error) {
	if a.engine == nil {
		return "", errors.New("引擎未启动（见启动时的错误提示，通常为 UDP 2425 端口被占用）")
	}
	return a.engine.SendText(ip, text)
}

// SendTyping 向指定 IP 发送「正在输入」提示（飞联扩展，尽力而为不报错给 UI）。
func (a *App) SendTyping(ip string) error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.SendTyping(ip)
}

// SendKnock 请求指定用户抖动窗口。
func (a *App) SendKnock(ip string) error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.SendKnock(ip)
}

// BroadcastText 向全网段广播文本消息。
func (a *App) BroadcastText(text string) error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.BroadcastText(text)
}

// GetSelf 我的资料（IP 取首个非回环 IPv4，展示用）。
func (a *App) GetSelf() SelfInfo {
	if a.engine == nil {
		return SelfInfo{}
	}
	cfg := a.engine.Self()
	return SelfInfo{Nick: cfg.Nick, Hostname: cfg.Hostname, IP: localIP(), Dept: cfg.Dept, Status: cfg.Status}
}

// localIP 取本机首个非回环 IPv4 地址（多网卡时为主要网卡，展示足够）。
func localIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet.IP.IsLoopback() {
			continue
		}
		if ip := ipnet.IP.To4(); ip != nil {
			return ip.String()
		}
	}
	return ""
}

// SetSelf 修改我的资料并全网广播，随即持久化。
func (a *App) SetSelf(nick, dept, status string) {
	if a.engine != nil {
		a.engine.SetSelf(nick, dept, status)
	}
	a.saveConfig()
}

// notifyMessage 系统通知（T-M4-3）：仅文本消息；我方勿扰/离开状态不弹（只累计未读）；
// 开关由配置控制（默认开）。beeep 失败静默（无通知环境不致命）。
func (a *App) notifyMessage(ev engine.Event) {
	if !a.cfgData.SystemNotify {
		return
	}
	if self := a.engine.Self(); self.Status == engine.StatusBusy || self.Status == engine.StatusAway {
		return // 勿扰：不弹，前端照常累计未读
	}
	title := "飞联 · " + ev.Peer.Nick
	if ev.Broadcast {
		title = "飞联 · 局域网广播"
	}
	text := ev.Text
	if len(text) > 60 {
		text = text[:60] + "…"
	}
	go func() {
		_ = beeep.Notify(title, text, "build/appicon.png")
	}()
}
