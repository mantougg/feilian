package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "飞联 LANChat",
		Width:            1180,
		Height:           720,
		MinWidth:         720,
		MinHeight:        520,
		BackgroundColour: &options.RGBA{R: 236, G: 238, B: 242, A: 255},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Frameless:  true, // 使用前端自定义标题栏（可拖动，见 TitleBar.tsx）
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
