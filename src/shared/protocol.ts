/**
 * Messages between the browser and the server for online games, sent as JSON
 * over the WebSocket at /ws. The server is authoritative: clients send intents
 * and the server answers every change with a full `state` snapshot, so a
 * client that reconnects only needs to `join` again.
 */
import type { GameRecord, Move, Player } from './hex'

export type Seat = Player
export type Role = Seat | 'spectator'

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type ClientMessage =
  /** Join (or rejoin) a room. The same playerId always gets its seat back. */
  | { t: 'join'; room: string; playerId: string }
  /** `ply` is the number of moves the client has seen; stale moves are refused. */
  | { t: 'move'; move: Move; ply: number }
  /** Ask to take back your last move, or accept the opponent's request. */
  | { t: 'undo' }
  | { t: 'undo-decline' }
  /** Ask for (or agree to) a new game; colors switch so the other player starts. */
  | { t: 'rematch' }

export interface SeatView {
  /** Someone has taken this seat. */
  taken: boolean
  /** That player has at least one open connection. */
  online: boolean
}

export interface RoomView {
  code: string
  game: GameRecord
  players: Record<Seat, SeatView>
  spectators: number
  undoRequest: Seat | null
  rematch: Seat[]
  /** Increments on every new game in the room. */
  round: number
}

export type ErrorCode = 'bad-message' | 'no-room' | 'not-joined' | 'waiting' | 'not-your-turn' | 'spectator' | 'illegal' | 'stale' | 'no-undo'

export type ServerMessage =
  | { t: 'state'; you: Role; room: RoomView }
  | { t: 'error'; code: ErrorCode; message: string }

export interface CreateRoomRequest {
  size: number
  swapRule: boolean
  playerId: string
}

export interface CreateRoomResponse {
  code: string
}

export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
}
