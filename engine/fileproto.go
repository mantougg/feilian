// 文件附加协议（T-M3-1）：对齐 IPMsg 0x0011 扩展格式，
// 飞联在条目尾部追加 fl= 扩展字段承载目录树（对飞鸽是未知的扩展属性，忽略即可）。
//
// 线上格式（CmdSendMsg|OptFileAttach 的 extra）：
//
//	消息文本 \0 fileID:名字:大小:mtime:attr[:fl=相对路径] \0 条目2 \0 …
//
// IPMsg 官方条目为 fileID:名字:大小:mtime:attr，多文件以 \0 分隔；
// attr 取值：0x11 普通文件、0x13 目录（IPMSG_FILE_REGULAR / IPMSG_FILE_DIR）。
package engine

import (
	"fmt"
	"path"
	"strconv"
	"strings"
)

// 文件属性位（IPMsg 官方值）。
const (
	FileAttrRegular uint32 = 0x00000011 // 普通文件
	FileAttrDir     uint32 = 0x00000013 // 目录
)

// 飞联扩展属性键：相对根目录路径（目录树重建用，仅嵌套条目携带）。
const fileAttrKeyFeilian = "fl"

// FileEntry 描述一个待传输条目（文件或目录）。
type FileEntry struct {
	ID      uint32 `json:"id"`                // fileID，同一消息内唯一；TCP 拉取时凭它定位文件
	Name    string `json:"name"`              // 展示名（根条目为文件/目录名）
	Size    int64  `json:"size"`              // 字节数（目录为递归累计）
	MTime   int64  `json:"mtime"`             // unix 秒
	Attr    uint32 `json:"attr"`              // FileAttrRegular(0x11) | FileAttrDir(0x13)
	RelPath string `json:"relPath,omitempty"` // 相对根目录路径（飞联扩展；根条目为空）
}

// IsDir 报告条目是否目录。
func (fe FileEntry) IsDir() bool { return fe.Attr == FileAttrDir }

// encodeFileEntry 序列化单条目：fileID:名字:大小:mtime:attr[:fl=相对路径]。
func encodeFileEntry(fe FileEntry) string {
	s := fmt.Sprintf("%d:%s:%d:%d:%x", fe.ID, fe.Name, fe.Size, fe.MTime, fe.Attr)
	if fe.RelPath != "" {
		s += ":" + fileAttrKeyFeilian + "=" + fe.RelPath
	}
	return s
}

// decodeFileEntry 解析单条目；飞联扩展键之外的其他扩展属性（如 IPMSG 官方
// mtime=/li= 等）忽略，字段数不足返回 false。
func decodeFileEntry(s string) (FileEntry, bool) {
	parts := strings.Split(s, ":")
	if len(parts) < 5 {
		return FileEntry{}, false
	}
	id, err1 := strconv.ParseUint(parts[0], 10, 32)
	size, err2 := strconv.ParseInt(parts[2], 10, 64)
	mtime, err3 := strconv.ParseInt(parts[3], 10, 64)
	attr, err4 := strconv.ParseUint(parts[4], 16, 32) // IPMsg 官方 attr 为十六进制串
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return FileEntry{}, false
	}
	fe := FileEntry{
		ID:    uint32(id),
		Name:  parts[1],
		Size:  size,
		MTime: mtime,
		Attr:  uint32(attr),
	}
	// 扩展属性从第 6 段起（值里可能含冒号的场景按 key= 前缀识别）
	for _, ext := range parts[5:] {
		if k, v, ok := strings.Cut(ext, "="); ok && k == fileAttrKeyFeilian {
			fe.RelPath = v
		}
	}
	return fe, true
}

// EncodeFileExtra 组装带附件的 extra：消息文本 + \0 + 条目列表。
func EncodeFileExtra(text string, entries []FileEntry) string {
	parts := make([]string, 0, len(entries)+1)
	parts = append(parts, text)
	for _, fe := range entries {
		parts = append(parts, encodeFileEntry(fe))
	}
	return strings.Join(parts, "\x00")
}

// DecodeFileExtra 拆解带附件的 extra；无 \0 时按纯文本处理（空条目列表）。
func DecodeFileExtra(extra string) (text string, entries []FileEntry) {
	parts := strings.Split(extra, "\x00")
	text = DecodeExtra(parts[0])
	for _, p := range parts[1:] {
		feiqFormat := strings.Contains(p, "\a")
		for _, item := range strings.Split(p, "\a") {
			if item == "" {
				continue
			}
			if feiqFormat {
				if fe, ok := decodeFeiqFileEntry(item); ok {
					entries = append(entries, fe)
				}
				continue
			}
			if fe, ok := decodeFileEntry(item); ok {
				entries = append(entries, fe)
			} else if fe, ok := decodeFeiqFileEntry(item); ok {
				entries = append(entries, fe)
			}
		}
	}
	return text, entries
}

// EncodeFeiqFileExtra 按飞秋文件通知格式序列化：消息\0条目\a条目\a。
func EncodeFeiqFileExtra(text string, entries []FileEntry) string {
	items := make([]string, 0, len(entries))
	for _, fe := range entries {
		fileType := uint32(1)
		if fe.IsDir() {
			fileType = 2
		}
		name := fe.Name
		if fe.RelPath != "" {
			name = strings.TrimSuffix(fe.RelPath, "/")
		}
		name = strings.ReplaceAll(name, ":", "::")
		items = append(items, fmt.Sprintf("%d:%s:%x:%x:%x", fe.ID, name, fe.Size, fe.MTime, fileType))
	}
	if len(items) == 0 {
		return text
	}
	return text + "\x00" + strings.Join(items, "\a") + "\a"
}

// 飞秋文件清单用十进制 fileID，size/mtime/type 使用十六进制，名字中的冒号写作 ::。
func decodeFeiqFileEntry(s string) (FileEntry, bool) {
	idEnd := strings.IndexByte(s, ':')
	if idEnd < 1 {
		return FileEntry{}, false
	}
	id, err := strconv.ParseUint(s[:idEnd], 10, 32)
	if err != nil {
		return FileEntry{}, false
	}
	rest := s[idEnd+1:]
	fileTypeEnd := strings.LastIndexByte(rest, ':')
	if fileTypeEnd < 0 {
		return FileEntry{}, false
	}
	mtimeEnd := strings.LastIndexByte(rest[:fileTypeEnd], ':')
	if mtimeEnd < 0 {
		return FileEntry{}, false
	}
	sizeEnd := strings.LastIndexByte(rest[:mtimeEnd], ':')
	if sizeEnd < 0 {
		return FileEntry{}, false
	}
	name := strings.ReplaceAll(rest[:sizeEnd], "::", ":")
	size, e1 := strconv.ParseInt(rest[sizeEnd+1:mtimeEnd], 16, 64)
	mtime, e2 := strconv.ParseInt(rest[mtimeEnd+1:fileTypeEnd], 16, 64)
	typ, e3 := strconv.ParseUint(rest[fileTypeEnd+1:], 16, 32)
	if e1 != nil || e2 != nil || e3 != nil || name == "" || (typ != 1 && typ != 2) {
		return FileEntry{}, false
	}
	name = DecodeExtra(name)
	name = strings.ReplaceAll(name, `\`, "/")
	fe := FileEntry{ID: uint32(id), Size: size, MTime: mtime, Attr: FileAttrRegular}
	if typ == 2 {
		fe.Attr = FileAttrDir
	}
	if strings.Contains(name, "/") {
		fe.RelPath = strings.TrimPrefix(name, "./")
		fe.Name = path.Base(fe.RelPath)
	} else {
		fe.Name = name
	}
	return fe, true
}
