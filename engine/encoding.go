package engine

import (
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
)

// DecodeExtra 按编码探测解码对端报文 extra：
// 合法 UTF-8 原样返回（飞联 / 新版飞鸽）；
// 含非法 UTF-8 序列时按 GBK 解码（飞秋在中文 Windows 上默认 GBK）。
// 出站方向恒用 UTF-8（Go 字符串天然 UTF-8），向 GBK 对端定向编码留待 T-M1-7 真机互通时定夺。
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

// EncodeGBK 把 UTF-8 文本转 GBK（T-M1-7 真机互通确认对端编码后按需启用）。
func EncodeGBK(s string) (string, error) {
	out, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(s))
	if err != nil {
		return "", err
	}
	return string(out), nil
}
