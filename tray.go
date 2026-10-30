package main

import (
	_ "embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/appicon.png
var trayIcon []byte

// startTray 启动系统托盘（T-M4-2）：常驻图标 + 显示主窗/退出菜单。
// 在 main 里以 goroutine 运行，不阻塞 Wails 生命周期。
func (a *App) startTray() {
	go systray.Run(a.onTrayReady, nil)
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTooltip("飞联 LANChat")
	mShow := systray.AddMenuItem("显示飞联", "打开主窗口")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出", "广播下线并退出程序")
	for {
		select {
		case <-mShow.ClickedCh:
			runtime.Show(a.ctx)
		case <-mQuit.ClickedCh:
			a.shutdown(nil)
			runtime.Quit(a.ctx)
			return
		}
	}
}
