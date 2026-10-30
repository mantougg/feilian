package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kbinani/screenshot"
)

// CaptureScreen 截取主显示器（T-M4-1），PNG data URL 返回给前端做选区底图。
func (a *App) CaptureScreen() (string, error) {
	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return "", fmt.Errorf("截屏失败: %w", err)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// SaveScreenshot 把前端裁剪后的 PNG 落盘（接收目录/screenshots），
// 返回路径供 SendFiles 发送（图片产物走 M3 文件通道，T-M3-5）。
func (a *App) SaveScreenshot(pngData string) (string, error) {
	if i := strings.Index(pngData, "base64,"); i >= 0 {
		pngData = pngData[i+7:]
	}
	data, err := base64.StdEncoding.DecodeString(pngData)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(a.recvDir(), "screenshots")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(dir, fmt.Sprintf("截图_%s.png", time.Now().Format("0102_150405")))
	if err := os.WriteFile(p, data, 0o644); err != nil {
		return "", err
	}
	return p, nil
}
