package main

import (
	"log"

	"golang.design/x/hotkey"
	"golang.design/x/hotkey/mainthread"
)

// registerHotkeys 注册全局热键（T-M4-4）：
//   - Ctrl+Alt+A 截图（与设计稿一致）
//   - Ctrl+Alt+F 全局唤起主窗（Ctrl+F 在非焦点窗口无法可靠全局，搜索焦点键留在前端窗口内）
//
// Windows 上 hotkey 回调不在主线程，触发后经 Wails runtime 调 UI；注册失败仅日志
// （如与其他软件冲突），窗口内快捷键仍然可用。mainthread.Init 满足库的平台要求。
func (a *App) registerHotkeys() {
	go mainthread.Init(func() {
		hk := hotkey.New([]hotkey.Modifier{hotkey.ModCtrl, hotkey.ModAlt}, hotkey.KeyA)
		if err := hk.Register(); err != nil {
			log.Printf("Ctrl+Alt+A 注册失败（可能被占用）: %v", err)
			return
		}
		for range hk.Keydown() {
			a.triggerScreenshot()
		}
	})
}

