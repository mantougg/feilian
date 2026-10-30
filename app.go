package main

import (
	"context"
	"log"
	"net"
	"os"

	"feilian/engine"

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
	ctx    context.Context
	engine *engine.Engine
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startEngine()
}

func (a *App) shutdown(ctx context.Context) {
	if a.engine != nil {
		a.engine.Stop()
	}
}

// startEngine 创建并启动网络引擎；失败（如端口被占）不阻断窗口，
// 界面仍可用，空用户列表即引擎缺席的可见信号。
func (a *App) startEngine() {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}
	events := make(chan engine.Event, 64)
	a.engine = engine.New(engine.Config{
		Nick:     hostname, // M1 默认昵称 = 主机名，T-M2-6 起由 UI 修改
		Hostname: hostname,
		Status:   engine.StatusOnline,
	}, events)
	if err := a.engine.Start(); err != nil {
		log.Printf("引擎启动失败: %v", err)
		return
	}
	go a.pumpEvents()
}

// pumpEvents 把引擎事件逐条转发为同名 Wails 事件，payload 为完整 Event 对象；
// 引擎停止（通道关闭）后协程自然退出。
func (a *App) pumpEvents() {
	for ev := range a.engine.Events() {
		runtime.EventsEmit(a.ctx, ev.Type, ev)
	}
}

// ---- 窗口控制（前端 src/lib/wailsBridge.ts 调用） ----

func (a *App) Minimize()       { runtime.WindowMinimise(a.ctx) }
func (a *App) ToggleMaximize() { runtime.WindowToggleMaximise(a.ctx) }
func (a *App) CloseWindow()    { runtime.Quit(a.ctx) }

// IsDesktop 供前端区分「Wails 桌面运行」与「纯浏览器预览」两种形态。
func (a *App) IsDesktop() bool { return true }

// GetVersion 关于页用。
func (a *App) GetVersion() string { return "0.1.0" }

// ---- 引擎桥接（T-M1-5）：前端经绑定方法驱动引擎，只读 + 动作，不反向写状态 ----

// GetPeers 当前在线用户快照。
func (a *App) GetPeers() []engine.Peer {
	if a.engine == nil {
		return nil
	}
	return a.engine.Peers()
}

// SendText 向指定 IP 发送文本消息。
func (a *App) SendText(ip, text string) error {
	if a.engine == nil {
		return engine.ErrNotStarted
	}
	return a.engine.SendText(ip, text)
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

// SetSelf 修改我的资料并全网广播（引擎侧留空字段保持不变）。
func (a *App) SetSelf(nick, dept, status string) {
	if a.engine != nil {
		a.engine.SetSelf(nick, dept, status)
	}
}
