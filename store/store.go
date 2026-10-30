// Package store 是飞联的聊天记录存储（T-M4-6，用户拍板 SQLite 形态）：
// modernc.org/sqlite 纯 Go 实现（免 CGO，保持单文件 exe）。
// 表结构按「会话（nick@host）+ 消息」两表；M5-T 搜索在 message 上建索引即可。
package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Message 是一条聊天记录（收发双向）。
type Message struct {
	ID     int64  `json:"id"`
	Conv   string `json:"conv"`   // 会话键 nick@host / bc
	From   string `json:"from"`   // 发送者昵称
	IsMine bool   `json:"isMine"` // true=我发的
	Kind   string `json:"kind"`   // text | file | img | chip
	Text   string `json:"text"`   // 内容 / 文件名 / 路径
	MsgRef string `json:"msgRef"` // 引擎报文 PacketNo（回执关联）
	SentAt int64  `json:"sentAt"` // unix 秒
}

// Store 打开并初始化数据库（库文件不存在时建表）。
type Store struct{ db *sql.DB }

// Open 打开 path 的 SQLite 库并确保表存在。
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	const schema = `
CREATE TABLE IF NOT EXISTS message (
	id      INTEGER PRIMARY KEY AUTOINCREMENT,
	conv    TEXT NOT NULL,
	from_n  TEXT NOT NULL DEFAULT '',
	is_mine INTEGER NOT NULL DEFAULT 0,
	kind    TEXT NOT NULL DEFAULT 'text',
	text    TEXT NOT NULL DEFAULT '',
	msg_ref TEXT NOT NULL DEFAULT '',
	sent_at INTEGER NOT NULL,
	resend  TEXT NOT NULL DEFAULT ''  -- 重复落盘策略占位（T-M4-6 验收：重命名=重插入）
);
CREATE INDEX IF NOT EXISTS idx_message_conv_time ON message(conv, sent_at);
CREATE INDEX IF NOT EXISTS idx_message_text ON message(text);`
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close 关库。
func (s *Store) Close() error { return s.db.Close() }

// Append 落一条记录，返回自增 ID。
func (s *Store) Append(m Message) (int64, error) {
	r, err := s.db.Exec(
		`INSERT INTO message (conv, from_n, is_mine, kind, text, msg_ref, sent_at) VALUES (?,?,?,?,?,?,?)`,
		m.Conv, m.From, boolInt(m.IsMine), m.Kind, m.Text, m.MsgRef, m.SentAt)
	if err != nil {
		return 0, err
	}
	return r.LastInsertId()
}

// History 按会话取 before 之前的 limit 条（倒序翻页，时间升序返回）。
func (s *Store) History(conv string, before time.Time, limit int) ([]Message, error) {
	rows, err := s.db.Query(
		`SELECT id, conv, from_n, is_mine, kind, text, msg_ref, sent_at
		 FROM message WHERE conv=? AND sent_at<? ORDER BY sent_at DESC LIMIT ?`,
		conv, before.Unix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var m Message
		var mine int
		if err := rows.Scan(&m.ID, &m.Conv, &m.From, &mine, &m.Kind, &m.Text, &m.MsgRef, &m.SentAt); err != nil {
			return nil, err
		}
		m.IsMine = mine != 0
		out = append(out, m)
	}
	// 倒序翻页取出后反转为时间升序，UI 直接 append 渲染
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// Search 全文子串搜索（M5-T3 入口，LIKE 足够内网量级）。
func (s *Store) Search(conv, keyword string, limit int) ([]Message, error) {
	rows, err := s.db.Query(
		`SELECT id, conv, from_n, is_mine, kind, text, msg_ref, sent_at
		 FROM message WHERE conv=? AND text LIKE ? ORDER BY sent_at DESC LIMIT ?`,
		conv, "%"+keyword+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var m Message
		var mine int
		if err := rows.Scan(&m.ID, &m.Conv, &m.From, &mine, &m.Kind, &m.Text, &m.MsgRef, &m.SentAt); err != nil {
			return nil, err
		}
		m.IsMine = mine != 0
		out = append(out, m)
	}
	return out, nil
}

// ClearConv 清空会话记录（UI「清空聊天记录」）。
func (s *Store) ClearConv(conv string) error {
	_, err := s.db.Exec(`DELETE FROM message WHERE conv=?`, conv)
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// StorePath 在 dir 下打开 feilian.db（app 用；目录自动创建）。
func StorePath(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return Open(filepath.Join(dir, "feilian.db"))
}
