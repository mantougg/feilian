package config

import (
	"os"
	"path/filepath"
	"testing"
)

// 用临时目录隔离真实 %APPDATA%。
func TestLoadSaveRoundTrip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	orig := Path()
	defer SetPathForTest(orig)
	SetPathForTest(p)

	d := Data{Nick: "周舟", Dept: "研发", Status: "busy", DarkMode: true, RecvDir: `D:\recv`, SpeedLimit: 1048576}
	if err := Save(d); err != nil {
		t.Fatal(err)
	}
	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != d {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", got, d)
	}
}

// 原子写：.tmp 残留不应出现（Save 后 rename 完成）。
func TestSaveAtomic(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	defer SetPathForTest(Path())
	SetPathForTest(p)
	if err := Save(Data{Nick: "x"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("临时文件残留")
	}
}

// 首次运行：文件不存在 Load 返回零值且无错。
func TestLoadFirstRun(t *testing.T) {
	defer SetPathForTest(Path())
	SetPathForTest(filepath.Join(t.TempDir(), "none.json"))
	d, err := Load()
	if err != nil || d != (Data{}) {
		t.Fatalf("d=%+v err=%v", d, err)
	}
}
