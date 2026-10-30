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
)

// 飞联自定义扩展命令码：仅飞联之间识别，
// 对飞秋/飞鸽退化为普通消息或被忽略（《飞联-需求文档.md》§4.3）。
// 注意：0x1000 位与 OptNoPopup 重合，引擎分发时扩展码必须按完整值
// 精确匹配（见 handlePacket），不可参与标准命令的选项位掩码剥离。
const (
	CmdFeiLinkTyping   uint32 = 0x00001001 // 正在输入
	CmdFeiLinkGroupMsg uint32 = 0x00001002 // 群聊消息
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
