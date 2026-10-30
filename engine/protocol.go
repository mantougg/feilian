// Package engine 是飞联的网络引擎层：纯 Go、不依赖 UI。
// 引擎通过事件通道向外推送状态，UI（Wails）只是订阅者；
// 架构约定见《飞联-需求文档.md》§5，任务拆解见《飞联-开发任务拆解.md》。
package engine

import (
	"fmt"
	"strconv"
	"strings"
)

// ProtocolVersion 是 IPMsg 线上协议版本号。
const ProtocolVersion = 1

// IPMsg 标准命令码（与飞鸽传书 / 飞秋一致）。
const (
	CmdNoOperation uint32 = 0x00000000 // 无操作（心跳探测）
	CmdBrEntry     uint32 = 0x00000001 // 上线广播
	CmdBrExit      uint32 = 0x00000002 // 下线广播
	CmdAnsEntry    uint32 = 0x00000003 // 上线应答
	CmdBrAbsence   uint32 = 0x00000004 // 状态变更（离开/勿扰）
	CmdSendMsg     uint32 = 0x00000020 // 发送消息
	CmdRecvMsg     uint32 = 0x00000021 // 收到消息回执
	CmdReadMsg     uint32 = 0x00000030 // 已读回执
	CmdDelMsg      uint32 = 0x00000040 // 撤回消息
)

// 命令选项位（与命令码按位或）。
const (
	OptSendCheck  uint32 = 0x00000100 // 要求回执
	OptSecret     uint32 = 0x00000200 // 加密内容
	OptBroadcast  uint32 = 0x00000400 // 广播
	OptMulticast  uint32 = 0x00000800 // 组播
	OptNoPopup    uint32 = 0x00001000 // 收到不弹窗
	OptFileAttach uint32 = 0x00200000 // 附加文件信息（M3 文件传输用）
	OptFeiqFlag   uint32 = 0x00600000 // 飞秋私有心跳/状态包标志（文档 §4「6291457 = 0x600001」），分发时按选项位剥除
)

// 飞联自定义扩展命令码：仅飞联之间识别，
// 对飞秋/飞鸽退化为普通消息或被忽略（《飞联-需求文档.md》§4.3）。
// 注意：0x1000 位与 OptNoPopup 重合，引擎分发时扩展码必须按完整值
// 精确匹配（见 handlePacket），不可参与标准命令的选项位掩码剥离。
const (
	CmdFeiLinkTyping   uint32 = 0x00001001 // 正在输入
	CmdFeiLinkGroupMsg uint32 = 0x00001002 // 群聊消息
)

// 飞秋公开使用的 IPMsg 命令扩展。
const (
	CmdInputing  uint32 = 0x00000079 // 正在输入
	CmdInputEnd  uint32 = 0x0000007a // 停止输入
	CmdSendImage uint32 = 0x000000c0 // 图片（数据格式尚未兼容）
	CmdKnock     uint32 = 0x000000d1 // 窗口抖动
)

// Packet 是一条 IPMsg 报文。
//
// 线上格式：version:packetNo:nick:host:command:extra
// extra 可以包含冒号，解析时只切前 5 个字段。
type Packet struct {
	Version  int
	PacketNo uint64
	Nick     string
	Host     string
	Command  uint32
	Extra    string
}

// Encode 将报文序列化为线上格式。
func (p Packet) Encode() string {
	return fmt.Sprintf("%d:%d:%s:%s:%d:%s", p.Version, p.PacketNo, p.Nick, p.Host, p.Command, p.Extra)
}

// ParsePacket 解析一条线上报文；格式非法时返回 false。
// 兼容 extra 为空（报文以第 5 个冒号结尾、无内容）的情况。
func ParsePacket(raw string) (Packet, bool) {
	raw = strings.TrimRight(raw, "\x00\r\n")
	parts := strings.SplitN(raw, ":", 6)
	if len(parts) < 5 {
		return Packet{}, false
	}
	version, err1 := strconv.Atoi(parts[0])
	packetNo, err2 := strconv.ParseUint(parts[1], 10, 64)
	command, err3 := strconv.ParseUint(parts[4], 10, 32)
	if err1 != nil || err2 != nil || err3 != nil {
		return Packet{}, false
	}
	extra := ""
	if len(parts) == 6 {
		extra = parts[5]
	}
	return Packet{
		Version:  version,
		PacketNo: packetNo,
		Nick:     parts[2],
		Host:     parts[3],
		Command:  uint32(command),
		Extra:    extra,
	}, true
}

// HasOpt 报告报文命令码是否携带全部指定选项位。
func (p Packet) HasOpt(opt uint32) bool { return p.Command&opt == opt }

// feiqNativePrefix 是飞秋私有报文的特征前缀（lbt = 萝卜头，飞秋作者团队
// 标记）。飞秋在标准 IPMsg 之外持续广播自有格式的心跳/状态包。
const feiqNativePrefix = "1_lbt"

// FeiqNative 是飞秋私有格式报文的解析结果。
// 新版线上格式：
//
//	1_lbt6_03#128#FEFFCFAFAC#0#0#0#4001#9:1793326334373:Administrator#:YANFA0223:6291457:昵称\x00部门\x00
//
// 字段含义遵循 docs/飞秋-私有协议分析.md §2-§4；旧式 # 分隔抓样继续兼容。
type FeiqNative struct {
	PacketNo uint64
	Command  uint32
	MAC      string
	Login    string
	Nick     string
	Host     string
	Dept     string
	Extra    string
}

// ParseFeiqNative 解析飞秋私有格式报文；非该格式返回 false。
// 只在标准 IPMsg 解析失败后调用（前缀 "1_lbt" 与标准报文 "1:…" 天然不冲突）。
func ParseFeiqNative(raw string) (FeiqNative, bool) {
	if !strings.HasPrefix(raw, feiqNativePrefix) {
		return FeiqNative{}, false
	}
	if fq, ok := parseFeiqColonPacket(raw); ok {
		return fq, true
	}
	return parseFeiqLegacyPacket(raw)
}

// 飞秋新格式仍使用 IPMsg 的六段冒号链，私有 version 只是在首段附加 # 字段。
func parseFeiqColonPacket(raw string) (FeiqNative, bool) {
	raw = strings.TrimRight(raw, "\x00\r\n")
	parts := strings.SplitN(raw, ":", 6)
	if len(parts) < 5 || !strings.HasPrefix(parts[0], feiqNativePrefix) {
		return FeiqNative{}, false
	}
	packetNo, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return FeiqNative{}, false
	}
	command, err := strconv.ParseUint(parts[4], 10, 32)
	if err != nil {
		return FeiqNative{}, false
	}
	extra := ""
	if len(parts) == 6 {
		extra = parts[5]
	}
	versionFields := strings.Split(parts[0], "#")
	mac := ""
	if len(versionFields) > 2 {
		mac = versionFields[2]
	}
	login, nick := parts[2], ""
	if i := strings.IndexByte(login, '#'); i >= 0 {
		if i+1 < len(login) {
			nick = login[i+1:]
		}
		login = login[:i]
	}
	values := strings.Split(extra, "\x00")
	if nick == "" && len(values) > 0 {
		nick = values[0]
	}
	dept := ""
	if len(values) > 1 {
		dept = values[1]
	}
	if nick == "" {
		nick = login
	}
	if nick == "" || parts[3] == "" {
		return FeiqNative{}, false
	}
	return FeiqNative{
		PacketNo: packetNo,
		Command:  uint32(command),
		MAC:      mac,
		Login:    login,
		Nick:     nick,
		Host:     parts[3],
		Dept:     dept,
		Extra:    extra,
	}, true
}

// 兼容仓库中早期真机抓样记录的 # 分隔旧布局，升级期间不丢发现能力。
func parseFeiqLegacyPacket(raw string) (FeiqNative, bool) {
	fields := strings.Split(raw, "#")
	cmdIdx := -1
	for i, f := range fields {
		if strings.HasPrefix(f, "9:") && i > 0 {
			cmdIdx = i - 1
			break
		}
	}
	if cmdIdx < 0 {
		return FeiqNative{}, false
	}
	cmd, err := strconv.ParseUint(fields[cmdIdx], 10, 32)
	if err != nil {
		return FeiqNative{}, false
	}
	// 昵称在命令码字段之后的「9:」链里：把命令码后的原文按 ':' 切，
	// 第 3 段（下标 2，前两段为 "9" 与时间戳/序号）即昵称，截掉其后
	// 可能并排的 '#' 后续字段。64B 截断的各种残尾形态均可命中。
	rest := strings.Join(fields[cmdIdx+1:], "#")
	segs := strings.SplitN(rest, ":", 4)
	if len(segs) < 3 {
		return FeiqNative{}, false
	}
	nick := segs[2]
	if i := strings.IndexByte(nick, '#'); i >= 0 {
		nick = nick[:i]
	}
	if nick == "" {
		return FeiqNative{}, false
	}
	return FeiqNative{Command: uint32(cmd), Login: nick, Nick: nick}, true
}
