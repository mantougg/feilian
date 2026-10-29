package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是绑定给前端（window.go.main.App.*）的宿主能力入口。
// 网络能力不经由这里 —— 引擎事件走 engine.Engine 的通道，
// 由 startup 里起的转发协程推到 Wails Events（M1 接入，见任务拆解 T-M1-5）。
type App struct {
	ctx context.Context
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

// ---- 窗口控制（前端 src/lib/wailsBridge.ts 调用） ----

func (a *App) Minimize()    { runtime.WindowMinimise(a.ctx) }
func (a *App) ToggleMaximize() { runtime.WindowToggleMaximise(a.ctx) }
func (a *App) CloseWindow() { runtime.Quit(a.ctx) }

// IsDesktop 供前端区分「Wails 桌面运行」与「纯浏览器预览」两种形态。
func (a *App) IsDesktop() bool { return true }

// GetVersion 关于页用。
func (a *App) GetVersion() string { return "0.1.0" }
