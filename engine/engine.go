package engine

import (
	"sync"
	"time"
)

// 用户状态（Peer.Status 取值）。
const (
	StatusOnline  = "online"
	StatusBusy    = "busy"
	StatusAway    = "away"
	StatusOffline = "offline"
)

// 引擎事件类型（Event.Type 取值）。
const (
	EventPeerOnline      = "peer_online"       // 新用户上线
	EventPeerOffline     = "peer_offline"      // 用户下线/超时
	EventPeerUpdate      = "peer_update"       // 昵称/状态/部门变更
	EventMessage         = "message"           // 收到文本消息
	EventReceipt         = "receipt"           // 对方回执（已送达）
	EventTyping          = "typing"            // 对方正在输入
	EventFileRequest     = "file_request"      // 对方发来文件请求
	EventFileProgress    = "file_progress"     // 传输进度
	EventFileDone        = "file_done"         // 传输完成
	EventEngineError     = "error"             // 引擎错误（发往 UI 提示）
)

// Peer 描述局域网内的一个其他用户。
type Peer struct {
	Nick     string    // 昵称
	Host     string    // 主机名
	IP       string    // 来源地址（形如 192.168.1.23）
	Dept     string    // 部门/分组（飞联扩展字段）
	Status   string    // online | busy | away | offline
	LastSeen time.Time // 最后一次收到报文的时间
}

// Event 是引擎推给 UI 的事件。字段按 Type 取用，其余为零值。
type Event struct {
	Type   string
	Peer   Peer
	MsgID  string // 我方报文 PacketNo 的字符串形式（回执匹配用）
	Text   string // 文本内容 / 错误信息
	Time   time.Time
}

// Config 引擎配置（M1 由 app.go 从本地配置读取，M4-T 持久化）。
type Config struct {
	Nick     string // 我的昵称
	Hostname string // 我的主机名
	Dept     string // 我的部门
	Status   string // online | busy | away
	Port     int    // 默认 2425
}

// Engine 是网络引擎门面，M1 逐任务实现。
type Engine struct {
	cfg   Config
	out   chan Event
	quit  chan struct{}
	once  sync.Once
}

// New 创建引擎。events 缓冲建议不小于 64。
func New(cfg Config, events chan Event) *Engine {
	if cfg.Port == 0 {
		cfg.Port = 2425
	}
	if cfg.Status == "" {
		cfg.Status = StatusOnline
	}
	return &Engine{cfg: cfg, out: events, quit: make(chan struct{})}
}

// Events 返回事件通道（UI 的订阅入口）。
func (e *Engine) Events() <-chan Event { return e.out }

// Start 启动发现与消息循环（阻塞内部 goroutine，立即返回）。
//
// TODO(T-M1-2) UDP 广播发现：
//   - Windows 下必须经 net.ListenConfig 的 Control 回调设置 syscall.SO_BROADCAST，
//     直接对广播地址 WriteTo 会被拒绝；
//   - 启动即广播 CmdBrEntry，收到他人 Entry 时单播回 CmdAnsEntry；
//   - 定时心跳（CmdNoOperation），超时未见的 Peer 按 EventPeerOffline 下线。
//
// TODO(T-M1-3) 用户表：peers map + 读写锁，Peers() 返回快照。
// TODO(T-M1-4) 文本消息：UDP 直发 CmdSendMsg|OptSendCheck，收到后回 CmdRecvMsg。
func (e *Engine) Start() error {
	return nil
}

// Stop 停止引擎：广播 CmdBrExit 下线包并结束内部循环。
// TODO(T-M1-2)：实现退出包广播。
func (e *Engine) Stop() {
	e.once.Do(func() { close(e.quit) })
}

// SendText 向指定 IP 发送文本消息。
// TODO(T-M1-4)
func (e *Engine) SendText(ip, text string) error { return nil }

// BroadcastText 向全网段发送广播消息（255.255.255.255 与本网段定向广播）。
// TODO(T-M1-4)
func (e *Engine) BroadcastText(text string) error { return nil }

// Peers 返回当前在线用户快照。
// TODO(T-M1-3)
func (e *Engine) Peers() []Peer { return nil }
