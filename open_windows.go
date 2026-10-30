package main

import "os/exec"

// execOpen 用资源管理器打开目录（Explorer 单独进程，不阻塞宿主）。
func execOpen(path string) error { return exec.Command("explorer", path).Start() }
