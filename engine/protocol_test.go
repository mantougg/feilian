package engine

import "testing"

func TestPacketRoundTrip(t *testing.T) {
	p := Packet{
		Version:  ProtocolVersion,
		PacketNo: 1690000001,
		Nick:     "周舟",
		Host:     "PC-ZHOU",
		Command:  CmdSendMsg | OptSendCheck,
		Extra:    "下午三点提测",
	}
	q, ok := ParsePacket(p.Encode())
	if !ok {
		t.Fatal("parse failed")
	}
	if q != p {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", q, p)
	}
}

func TestParseExtraWithColons(t *testing.T) {
	q, ok := ParsePacket("1:42:周舟:PC-ZHOU:32:时间:14:30:内容")
	if !ok {
		t.Fatal("parse failed")
	}
	if q.Extra != "时间:14:30:内容" {
		t.Fatalf("extra = %q", q.Extra)
	}
	if q.Command != CmdSendMsg {
		t.Fatalf("command = %#x", q.Command)
	}
}

func TestParseToleratesEmptyExtra(t *testing.T) {
	q, ok := ParsePacket("1:7:a:b:32")
	if !ok {
		t.Fatal("empty extra should be tolerated")
	}
	if q.Extra != "" {
		t.Fatalf("extra = %q", q.Extra)
	}
}

func TestParseMalformed(t *testing.T) {
	for _, raw := range []string{"", "abc", "1:2:a", "1:x:a:b:32:m", "1:2:a:b:zz:m"} {
		if _, ok := ParsePacket(raw); ok {
			t.Fatalf("malformed accepted: %q", raw)
		}
	}
}

func TestHasOpt(t *testing.T) {
	p := Packet{Command: CmdSendMsg | OptBroadcast | OptSendCheck}
	if !p.HasOpt(OptBroadcast) || !p.HasOpt(OptSendCheck) {
		t.Fatal("expected opts missing")
	}
	if p.HasOpt(OptFileAttach) {
		t.Fatal("unexpected opt present")
	}
}
