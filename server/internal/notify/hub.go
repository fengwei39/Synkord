package notify

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 50 * time.Second
	maxMsgSize = 4096
)

// client represents one active WebSocket connection for a user.
type client struct {
	userID string
	conn   *websocket.Conn
	send   chan []byte
}

// Hub manages all active WebSocket connections, keyed by userID.
type Hub struct {
	mu       sync.RWMutex
	clients  map[string]map[*client]struct{} // userID → set of clients
	register chan *client
	unregist chan *client
}

func NewHub() *Hub {
	h := &Hub{
		clients:  make(map[string]map[*client]struct{}),
		register: make(chan *client, 64),
		unregist: make(chan *client, 64),
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			if h.clients[c.userID] == nil {
				h.clients[c.userID] = make(map[*client]struct{})
			}
			h.clients[c.userID][c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregist:
			h.mu.Lock()
			if set, ok := h.clients[c.userID]; ok {
				delete(set, c)
				if len(set) == 0 {
					delete(h.clients, c.userID)
				}
			}
			h.mu.Unlock()
			close(c.send)
		}
	}
}

// Send pushes msg to all WebSocket connections belonging to userID.
// Non-blocking: drops message if client send buffer is full.
func (h *Hub) Send(userID string, msg interface{}) {
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	set := h.clients[userID]
	h.mu.RUnlock()

	for c := range set {
		select {
		case c.send <- b:
		default:
		}
	}
}

// ServeClient registers the client and pumps messages until the connection closes.
func (h *Hub) ServeClient(userID string, conn *websocket.Conn) {
	c := &client{
		userID: userID,
		conn:   conn,
		send:   make(chan []byte, 64),
	}
	h.register <- c
	defer func() { h.unregist <- c }()

	// Read pump (keep alive via ping/pong)
	go func() {
		defer conn.Close()
		conn.SetReadLimit(maxMsgSize)
		_ = conn.SetReadDeadline(time.Now().Add(pongWait))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(pongWait))
		})
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
		h.unregist <- c
	}()

	// Write pump
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	defer conn.Close()

	for {
		select {
		case msg, ok := <-c.send:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
