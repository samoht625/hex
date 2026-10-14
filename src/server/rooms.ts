import { randomInt } from 'node:crypto'
import { moveError, newGame, play, replay, toRecord, type GameConfig, type GameState, type Move } from '../shared/hex'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type ErrorCode, type Role, type RoomView, type Seat } from '../shared/protocol'

export class RoomError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
  }
}

export interface Room {
  code: string
  config: GameConfig
  game: GameState
  seats: Record<Seat, string | null>
  undoRequest: Seat | null
  rematch: Set<Seat>
  round: number
  lastActivity: number
}

/** A connected client; the transport is up to the caller. */
export interface Client {
  playerId: string
  room: Room | null
  send(view: { you: Role; room: RoomView }): void
}

const SEATS: Seat[] = ['red', 'blue']

export interface RoomManagerOptions {
  /** Rooms with nobody connected are dropped after this long without activity. */
  idleMs?: number
  maxRooms?: number
  now?: () => number
}

export class RoomManager {
  readonly rooms = new Map<string, Room>()
  private readonly clients = new Map<Room, Set<Client>>()
  private readonly idleMs: number
  private readonly maxRooms: number
  private readonly now: () => number

  constructor(options: RoomManagerOptions = {}) {
    this.idleMs = options.idleMs ?? 24 * 60 * 60 * 1000
    this.maxRooms = options.maxRooms ?? 10_000
    this.now = options.now ?? Date.now
  }

  create(config: GameConfig, creatorId?: string): Room {
    if (this.rooms.size >= this.maxRooms) this.sweep(true)
    if (this.rooms.size >= this.maxRooms) throw new RoomError('no-room', 'The server is full, try again later')
    let code: string
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('')
    } while (this.rooms.has(code))
    const room: Room = {
      code,
      config,
      game: newGame(config),
      seats: { red: creatorId ?? null, blue: null },
      undoRequest: null,
      rematch: new Set(),
      round: 1,
      lastActivity: this.now()
    }
    this.rooms.set(code, room)
    this.clients.set(room, new Set())
    return room
  }

  roleOf(room: Room, playerId: string): Role {
    return SEATS.find(seat => room.seats[seat] === playerId) ?? 'spectator'
  }

  join(client: Client, code: string): void {
    const room = this.rooms.get(code)
    if (!room) throw new RoomError('no-room', 'That game does not exist (or has expired)')
    if (client.room && client.room !== room) this.leave(client)
    if (this.roleOf(room, client.playerId) === 'spectator') {
      const free = SEATS.find(seat => room.seats[seat] === null)
      if (free) room.seats[free] = client.playerId
    }
    client.room = room
    this.clients.get(room)!.add(client)
    room.lastActivity = this.now()
    this.broadcast(room)
  }

  leave(client: Client): void {
    const room = client.room
    if (!room) return
    client.room = null
    this.clients.get(room)?.delete(client)
    room.lastActivity = this.now()
    this.broadcast(room)
  }

  private seatOf(client: Client): { room: Room; seat: Seat } {
    const room = client.room
    if (!room) throw new RoomError('not-joined', 'Join a game first')
    const role = this.roleOf(room, client.playerId)
    if (role === 'spectator') throw new RoomError('spectator', 'You are watching this game')
    return { room, seat: role }
  }

  move(client: Client, move: Move, ply: number): void {
    const { room, seat } = this.seatOf(client)
    if (!room.seats.red || !room.seats.blue) throw new RoomError('waiting', 'Waiting for your opponent to join')
    if (ply !== room.game.moves.length) throw new RoomError('stale', 'The board changed, try again')
    if (room.game.toMove !== seat) throw new RoomError('not-your-turn', 'It is not your turn')
    const error = moveError(room.game, move)
    if (error) throw new RoomError('illegal', error)
    room.game = play(room.game, move)
    room.undoRequest = null
    room.rematch.clear()
    this.touch(room)
  }

  /** Request an undo, or accept the opponent's pending request. */
  undo(client: Client): void {
    const { room, seat } = this.seatOf(client)
    if (room.undoRequest && room.undoRequest !== seat) {
      const requester = room.undoRequest
      const moves = room.game.moves
      // Take back the requester's latest move and anything played after it.
      const parity = requester === 'red' ? 0 : 1
      let keep = moves.length - 1
      while (keep >= 0 && keep % 2 !== parity) keep--
      room.game = replay(room.config, moves.slice(0, Math.max(0, keep)))
      room.undoRequest = null
      room.rematch.clear()
    } else {
      const hasMoved = room.game.moves.some((_, index) => index % 2 === (seat === 'red' ? 0 : 1))
      if (!hasMoved) throw new RoomError('no-undo', 'You have no move to take back')
      room.undoRequest = seat
    }
    this.touch(room)
  }

  declineUndo(client: Client): void {
    const { room, seat } = this.seatOf(client)
    if (room.undoRequest && room.undoRequest !== seat) {
      room.undoRequest = null
      this.touch(room)
    }
  }

  /** Both players asking starts a new game with colors switched. */
  rematch(client: Client): void {
    const { room, seat } = this.seatOf(client)
    room.rematch.add(seat)
    const opponentSeated = room.seats[seat === 'red' ? 'blue' : 'red'] !== null
    if (room.rematch.size === 2 || !opponentSeated) {
      if (opponentSeated) room.seats = { red: room.seats.blue, blue: room.seats.red }
      room.game = newGame(room.config)
      room.undoRequest = null
      room.rematch.clear()
      room.round++
    }
    this.touch(room)
  }

  view(room: Room): RoomView {
    const online = new Set<string>()
    let spectators = 0
    for (const client of this.clients.get(room) ?? []) {
      online.add(client.playerId)
      if (this.roleOf(room, client.playerId) === 'spectator') spectators++
    }
    const seatView = (seat: Seat) => ({ taken: room.seats[seat] !== null, online: room.seats[seat] !== null && online.has(room.seats[seat]!) })
    return {
      code: room.code,
      game: toRecord(room.game),
      players: { red: seatView('red'), blue: seatView('blue') },
      spectators,
      undoRequest: room.undoRequest,
      rematch: [...room.rematch],
      round: room.round
    }
  }

  connectedCount(room: Room): number {
    return this.clients.get(room)?.size ?? 0
  }

  private touch(room: Room): void {
    room.lastActivity = this.now()
    this.broadcast(room)
  }

  private broadcast(room: Room): void {
    const view = this.view(room)
    for (const client of this.clients.get(room) ?? []) client.send({ you: this.roleOf(room, client.playerId), room: view })
  }

  /** Drops idle empty rooms. With `pressure`, also the oldest empty rooms. */
  sweep(pressure = false): void {
    const cutoff = this.now() - this.idleMs
    const empty = [...this.rooms.values()].filter(room => this.connectedCount(room) === 0)
    for (const room of empty) {
      if (room.lastActivity < cutoff) this.delete(room)
    }
    if (pressure && this.rooms.size >= this.maxRooms) {
      const oldest = empty.filter(room => this.rooms.has(room.code)).sort((a, b) => a.lastActivity - b.lastActivity)
      for (const room of oldest.slice(0, Math.ceil(this.maxRooms / 10))) this.delete(room)
    }
  }

  private delete(room: Room): void {
    this.rooms.delete(room.code)
    this.clients.delete(room)
  }
}
