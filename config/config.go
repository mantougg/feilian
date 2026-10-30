// Package config 是飞联的本地配置（T-M4-5）：JSON 落盘 %APPDATA%/feilian/config.json，
// 启动读取注入 engine.Config 与 UI；保存失败不致命（仅日志），下次启动用默认值。
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Data 是配置文件的全部字段（JSON 快照，新增字段向后兼容：零值即默认）。
type Data struct {
	Nick            string `json:"nick"`            // 我的昵称
	Dept            string `json:"dept"`            // 部门
	Status          string `json:"status"`          // online | busy | away
	DarkMode        bool   `json:"darkMode"`        // 深色主题
	SystemNotify    bool   `json:"systemNotify"`    // 系统通知开关
	RecvDir         string `json:"recvDir"`         // 接收目录
	OpenAfterDone   bool   `json:"openAfterDone"`   // 传输完成后自动打开
	SpeedLimit      int    `json:"speedLimit"`      // 传输限速（字节/秒，0 不限）
	ScreenshotHot   string `json:"screenshotHot"`   // 截图热键（展示用，注册见 T-M4-4）
	SearchHot       string `json:"searchHot"`       // 全局搜索热键
	AutoLaunch      bool   `json:"autoLaunch"`      // 开机自启动
	CloseToTray     *bool  `json:"closeToTray"`     // 关闭进托盘（nil/true=是；显式 false 退出）
	SpeedLimitLabel string `json:"speedLimitLabel"` // 限速档位：不限速 | 512KB/s | 1MB/s
}

// Path 返回配置文件路径：%APPDATA%/feilian/config.json（非 Windows 用 ~/.config）。
func Path() string {
	if pathOverride != "" {
		return pathOverride
	}
	base := os.Getenv("APPDATA")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "feilian.config.json"
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "feilian", "config.json")
}

// Load 读配置；文件不存在返回零值与 nil（首次运行）。
func Load() (Data, error) {
	var d Data
	b, err := os.ReadFile(Path())
	if err != nil {
		return d, nil // 首次运行不是错误
	}
	if err := json.Unmarshal(b, &d); err != nil {
		return Data{}, err // 损坏文件按默认值重来
	}
	return d, nil
}

// Save 原子写盘（临时文件 + rename）。
func Save(d Data) error {
	p := Path()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// path 变量便于测试隔离（Path() 的可写重定向）。
var pathOverride string

// SetPathForTest 重定向配置路径（仅测试使用）。
func SetPathForTest(p string) { pathOverride = p }

// CloseToTrayEnabled 读指针语义（nil 视为 true：默认关闭进托盘）。
func (d Data) CloseToTrayEnabled() bool { return d.CloseToTray == nil || *d.CloseToTray }
