package store

import (
	"path/filepath"
	"testing"
	"time"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "chat.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// 验收：落库→翻页取回内容与顺序正确。
func TestAppendHistory(t *testing.T) {
	s := openTest(t)
	base := time.Now().Add(-time.Hour)
	for i := 0; i < 5; i++ {
		if _, err := s.Append(Message{Conv: "甲@A", From: "甲", IsMine: i%2 == 1, Kind: "text", Text: "消息", SentAt: base.Add(time.Duration(i) * time.Minute).Unix()}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.History("甲@A", time.Now(), 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("limit=3 得 %d 条", len(got))
	}
	// 最新 3 条、时间升序
	if got[0].SentAt >= got[2].SentAt {
		t.Fatal("History 未按时间升序返回")
	}
	if got[2].IsMine != (2%2 == 1) {
		t.Fatalf("IsMine 标记错误: %+v", got[2])
	}
}

// 搜索命中子串、会话隔离、清空生效。
func TestSearchAndClear(t *testing.T) {
	s := openTest(t)
	now := time.Now().Add(-time.Minute) // 与 History 的 before 留出秒级余量
	s.Append(Message{Conv: "甲@A", From: "甲", Text: "下午三点提测", SentAt: now.Unix()})
	s.Append(Message{Conv: "乙@B", From: "乙", Text: "提测清单我发你", SentAt: now.Unix()})
	s.Append(Message{Conv: "甲@A", From: "我", IsMine: true, Text: "收到 🚀", SentAt: now.Unix()})

	hits, err := s.Search("甲@A", "提测", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 || hits[0].Text != "下午三点提测" {
		t.Fatalf("搜索结果: %+v", hits)
	}
	if err := s.ClearConv("甲@A"); err != nil {
		t.Fatal(err)
	}
	left, _ := s.History("甲@A", time.Now(), 10)
	if len(left) != 0 {
		t.Fatalf("清空后仍有 %d 条", len(left))
	}
	other, _ := s.History("乙@B", time.Now(), 10)
	if len(other) != 1 {
		t.Fatal("其他会话被误清")
	}
}
