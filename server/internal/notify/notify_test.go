package notify

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

// ─── Hub tests ────────────────────────────────────────────────────────────────

func TestHub_SendToUnknownUser(t *testing.T) {
	h := NewHub()
	// Should not panic when sending to a user with no connections
	h.Send("ghost-user", WsMessage{Type: "contract_updated", PackName: "x"})
}

func TestHub_RegisterAndSend(t *testing.T) {
	h := NewHub()

	// Use a pipe-like approach: capture messages via a channel mock
	sent := make(chan []byte, 4)

	c := &client{
		userID: "user-1",
		send:   make(chan []byte, 4),
	}

	// Register manually
	h.mu.Lock()
	h.clients["user-1"] = map[*client]struct{}{c: {}}
	h.mu.Unlock()

	msg := WsMessage{Type: "contract_updated", PackName: "auth-pack", NewVersion: "1.1.0"}
	h.Send("user-1", msg)

	// Drain the client send channel
	go func() {
		for b := range c.send {
			sent <- b
		}
	}()

	select {
	case b := <-sent:
		var got WsMessage
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if got.Type != "contract_updated" {
			t.Errorf("type = %q, want contract_updated", got.Type)
		}
		if got.PackName != "auth-pack" {
			t.Errorf("packName = %q, want auth-pack", got.PackName)
		}
		if got.NewVersion != "1.1.0" {
			t.Errorf("newVersion = %q, want 1.1.0", got.NewVersion)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for message")
	}
}

func TestHub_MultipleClients(t *testing.T) {
	h := NewHub()

	const numClients = 3
	clients := make([]*client, numClients)
	for i := range clients {
		clients[i] = &client{
			userID: "user-multi",
			send:   make(chan []byte, 4),
		}
	}

	h.mu.Lock()
	h.clients["user-multi"] = make(map[*client]struct{})
	for _, c := range clients {
		h.clients["user-multi"][c] = struct{}{}
	}
	h.mu.Unlock()

	h.Send("user-multi", WsMessage{Type: "contract_updated", PackName: "x"})

	var wg sync.WaitGroup
	for _, c := range clients {
		wg.Add(1)
		go func(cl *client) {
			defer wg.Done()
			select {
			case <-cl.send:
			case <-time.After(200 * time.Millisecond):
				t.Errorf("client %p timed out", cl)
			}
		}(c)
	}
	wg.Wait()
}

// ─── Semver / model tests ─────────────────────────────────────────────────────

func TestWsMessage_JSONRoundtrip(t *testing.T) {
	msg := WsMessage{
		Type:       "contract_updated",
		OrgID:      "org-1",
		PackName:   "auth-pack",
		OldVersion: "1.0.0",
		NewVersion: "1.1.0",
	}

	b, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got WsMessage
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.Type != msg.Type || got.PackName != msg.PackName || got.NewVersion != msg.NewVersion {
		t.Errorf("round-trip mismatch: %+v", got)
	}
}

func TestPublishEvent_NullableString(t *testing.T) {
	cases := []struct {
		input string
		isNil bool
	}{
		{"", true},
		{"1.0.0", false},
	}
	for _, tc := range cases {
		got := nullableString(tc.input)
		if tc.isNil && got != nil {
			t.Errorf("nullableString(%q) = %v, want nil", tc.input, got)
		}
		if !tc.isNil && (got == nil || *got != tc.input) {
			t.Errorf("nullableString(%q) = %v, want &%q", tc.input, got, tc.input)
		}
	}
}
