package engine

import (
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// DecodeExtra 按编码探测解码对端报文 extra：
// 合法 UTF-8 原样返回（飞联 / 新版飞鸽）；
// 含非法 UTF-8 序列时按 GBK 解码（飞秋在中文 Windows 上默认 GBK）。
func DecodeExtra(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	dec, err := simplifiedchinese.GBK.NewDecoder().Bytes([]byte(s))
	if err != nil {
		return s // 解码失败原样返回，不丢消息
	}
	return string(dec)
}

// EncodeGBK 把 UTF-8 文本转 GBK，飞秋单播与兼容广播使用；无法编码的字符返回错误。
func EncodeGBK(s string) (string, error) {
	out, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(s))
	if err != nil {
		return "", err
	}
	return string(out), nil
}
