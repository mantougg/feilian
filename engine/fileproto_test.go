package engine

import (
	"strings"
	"testing"
	"time"
)

func TestFileEntryRoundTrip(t *testing.T) {
	fe := FileEntry{ID: 1, Name: "设计稿.fig", Size: 18 << 20, MTime: time.Now().Unix(), Attr: FileAttrRegular}
	enc := encodeFileEntry(fe)
	dec, ok := decodeFileEntry(enc)
	if !ok {
		t.Fatalf("decode %q failed", enc)
	}
	if dec.ID != fe.ID || dec.Name != fe.Name || dec.Size != fe.Size || dec.MTime != fe.MTime || dec.Attr != fe.Attr {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", dec, fe)
	}
}

func TestFileEntryWithRelPath(t *testing.T) {
	fe := FileEntry{ID: 3, Name: "a.go", Size: 1024, MTime: 1690000000, Attr: FileAttrRegular, RelPath: "src/inner/a.go"}
	dec, ok := decodeFileEntry(encodeFileEntry(fe))
	if !ok {
		t.Fatal("decode failed")
	}
	if dec.RelPath != "src/inner/a.go" {
		t.Fatalf("RelPath = %q", dec.RelPath)
	}
	// 飞联目录条目
	dir := FileEntry{ID: 2, Name: "src", Attr: FileAttrDir, RelPath: "src"}
	dec, ok = decodeFileEntry(encodeFileEntry(dir))
	if !ok || !dec.IsDir() || dec.RelPath != "src" {
		t.Fatalf("dir entry: %+v ok=%v", dec, ok)
	}
}

// 兼容飞鸽官方条目：含未知扩展属性（mtime= 等）时忽略并正常解析。
func TestFileEntryToleratesForeignExts(t *testing.T) {
	dec, ok := decodeFileEntry("2:report.pdf:2048:1690000000:11:mtime=1690000000.123")
	if !ok {
		t.Fatal("foreign entry decode failed")
	}
	if dec.Name != "report.pdf" || dec.Size != 2048 || dec.Attr != FileAttrRegular || dec.RelPath != "" {
		t.Fatalf("foreign entry: %+v", dec)
	}
}

func TestDecodeFileEntryMalformed(t *testing.T) {
	for _, s := range []string{"", "1:name", "x:name:1:2:11", "1:name:xx:2:11"} {
		if _, ok := decodeFileEntry(s); ok {
			t.Fatalf("malformed accepted: %q", s)
		}
	}
}

func TestFileExtraRoundTrip(t *testing.T) {
	text := "给你验收材料 📁"
	entries := []FileEntry{
		{ID: 1, Name: "资料", Size: 0, MTime: 1690000000, Attr: FileAttrDir},
		{ID: 2, Name: "说明.docx", Size: 4096, MTime: 1690000001, Attr: FileAttrRegular, RelPath: "资料/说明.docx"},
	}
	extra := EncodeFileExtra(text, entries)
	if !strings.HasPrefix(extra, text+"\x00") {
		t.Fatalf("extra 前缀异常: %q", extra)
	}
	gotText, gotEntries := DecodeFileExtra(extra)
	if gotText != text {
		t.Fatalf("text = %q", gotText)
	}
	if len(gotEntries) != 2 {
		t.Fatalf("entries = %d", len(gotEntries))
	}
	if gotEntries[1].RelPath != "资料/说明.docx" || gotEntries[0].IsDir() == false {
		t.Fatalf("entries: %+v", gotEntries)
	}
}

// 纯文本 extra（无附件）解析为空列表，不误伤普通消息。
func TestFileExtraPlainText(t *testing.T) {
	text, entries := DecodeFileExtra("普通消息没有附件")
	if text != "普通消息没有附件" || len(entries) != 0 {
		t.Fatalf("text=%q entries=%d", text, len(entries))
	}
}
