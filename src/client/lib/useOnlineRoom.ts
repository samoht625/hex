import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fromRecord, isLegal, play, type GameState, type Move } from '../../shared/hex'
import type { ClientMessage, ErrorCode, Role, RoomView, ServerMessage } from '../../shared/protocol'
import { playerId } from './playerId'

export type Connection = 'connecting' | 'open' | 'reconnecting'

export interface OnlineRoom {
  connection: Connection
  you: Role | null
  room: RoomView | null
  /** The game to show: the server's, plus our move while it is in flight. */
  game: GameState | null
  /** The room does not exist (or expired). */
  missing: boolean
  lastError: { code: ErrorCode; message: string; at: number } | null
  move(move: Move): void
  send(message: ClientMessage): void
}

const socketUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useOnlineRoom(code: string): OnlineRoom {
  const [connection, setConnection] = useState<Connection>('connecting')
  const [state, setState] = useState<{ you: Role; room: RoomView } | null>(null)
  const [pending, setPending] = useState<{ move: Move; ply: number } | null>(null)
  const [missing, setMissing] = useState(false)
  const [lastError, setLastError] = useState<OnlineRoom['lastError']>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    setState(null)
    setMissing(false)
    setConnection('connecting')

    const connect = () => {
      clearTimeout(retryTimer)
      if (closed) return
      const ws = new WebSocket(socketUrl())
      socketRef.current = ws
      ws.onopen = () => {
        attempt = 0
        setConnection('open')
        ws.send(JSON.stringify({ t: 'join', room: code, playerId: playerId() } satisfies ClientMessage))
      }
      ws.onmessage = event => {
        const message = JSON.parse(event.data as string) as ServerMessage
        if (message.t === 'state') {
          setState({ you: message.you, room: message.room })
          setPending(null)
        } else {
          setPending(null)
          if (message.code === 'no-room') {
            setMissing(true)
            closed = true
            ws.close()
          } else setLastError({ code: message.code, message: message.message, at: Date.now() })
        }
      }
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null
        if (closed) return
        setConnection('reconnecting')
        setPending(null)
        const delay = Math.min(5000, 400 * 2 ** attempt++)
        retryTimer = setTimeout(connect, delay)
      }
    }

    // Phones drop sockets in the background; come back right away when visible again.
    const wake = () => {
      if (document.visibilityState === 'visible' && !socketRef.current && !closed) connect()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    connect()

    return () => {
      closed = true
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [code])

  const send = useCallback((message: ClientMessage) => {
    const ws = socketRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
  }, [])

  const serverGame = useMemo(() => (state ? fromRecord(state.room.game) : null), [state])

  const game = useMemo(() => {
    if (!serverGame || !pending || pending.ply !== serverGame.moves.length || !isLegal(serverGame, pending.move)) return serverGame
    return play(serverGame, pending.move)
  }, [serverGame, pending])

  const move = useCallback(
    (next: Move) => {
      if (!serverGame || socketRef.current?.readyState !== WebSocket.OPEN) return
      const ply = serverGame.moves.length
      setPending({ move: next, ply })
      send({ t: 'move', move: next, ply })
    },
    [serverGame, send]
  )

  return { connection, you: state?.you ?? null, room: state?.room ?? null, game, missing, lastError, move, send }
}
