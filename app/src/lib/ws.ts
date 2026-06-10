import { useEffect, useRef, useCallback } from 'react'
import { getToken } from './api'

const BASE_WS = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080')
  .replace(/^http/, 'ws')

export interface WsMessage {
  type: string
  orgId: string
  packName: string
  oldVersion?: string
  newVersion: string
  diffSummary?: unknown
}

type MessageHandler = (msg: WsMessage) => void

export function useWebSocket(onMessage: MessageHandler, enabled = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const token = getToken()
    if (!token || !enabled) return

    const url = `${BASE_WS}/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as WsMessage
        onMessageRef.current(data)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (enabled) {
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => ws.close()
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    connect()
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect, enabled])
}
