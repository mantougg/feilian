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
	text = parts[0]
	for _, p := range parts[1:] {
		if p == "" {
			continue
		}
		if fe, ok := decodeFileEntry(p); ok {
			entries = append(entries, fe)
		}
	}
	return text, entries
}
