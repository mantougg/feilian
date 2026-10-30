//go:build !windows

package main

import "os/exec"

func execOpen(path string) error { return exec.Command("xdg-open", path).Start() }
