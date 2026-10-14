import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createApp, type App } from '../src/server/app'
import { RoomManager } from '../src/server/rooms'
import { fromRecord } from '../src/shared/hex'
import type { ClientMessage, Role, RoomView, ServerMessage } from '../src/shared/protocol'

let app: App
let base: string
const sockets: Player[] = []

/** A test client that records every message from the server. */
class Player {
  readonly messages: ServerMessage[] = []
  private waiters: Array<() => void> = []
  ws!: WebSocket

  constructor(readonly playerId: string) {}

  async connect(): Promise<this> {
    this.ws = new WebSocket(base.replace('http', 'ws') + '/ws')
    this.ws.on('message', data => {
      this.messages.push(JSON.parse(data.toString()))
      this.waiters.splice(0).forEach(wake => wake())
    })
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', reject)
    })
    sockets.push(this)
    return this
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message))
  }

  /** Position in the message log, to wait only for messages that arrive after it. */
  mark(): number {
    return this.messages.length
  }

  /** Waits for a message matching `predicate`, received at or after `from`. */
  async next<T extends ServerMessage['t']>(type: T, predicate: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true, from = 0): Promise<Extract<ServerMessage, { t: T }>> {
    const start = from
    const deadline = Date.now() + 2000
    let index = start
    for (;;) {
      while (index < this.messages.length) {
        const message = this.messages[index++]
        if (message.t === type && predicate(message as Extract<ServerMessage, { t: T }>)) return message as Extract<ServerMessage, { t: T }>
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${type}; got ${JSON.stringify(this.messages.slice(start))}`)
      await new Promise<void>(resolve => {
        this.waiters.push(resolve)
        setTimeout(resolve, 50)
      })
    }
  }

  async join(room: string): Promise<{ you: Role; room: RoomView }> {
    const pending = this.next('state', m => m.room.code === room, this.mark())
    this.send({ t: 'join', room, playerId: this.playerId })
    return pending
  }

  /** Sends a move and resolves with the resulting state or error. */
  async move(move: number | 'swap', ply: number): Promise<ServerMessage> {
    const start = this.messages.length
    this.send({ t: 'move', move, ply })
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const reply = this.messages.slice(start).find(m => m.t === 'error' || (m.t === 'state' && m.room.game.moves.length !== ply))
      if (reply) return reply
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('No reply to move')
  }

  close(): Promise<void> {
    return new Promise(resolve => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve()
      this.ws.once('close', () => resolve())
      this.ws.close()
    })
  }
}

async function createRoom(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function newRoom(playerId = 'alice-0001', swapRule = true): Promise<string> {
  const res = await createRoom({ size: 11, swapRule, playerId })
  expect(res.status).toBe(201)
  return ((await res.json()) as { code: string }).code
}

async function twoPlayers(swapRule = true) {
  const code = await newRoom('alice-0001', swapRule)
  const alice = await new Player('alice-0001').connect()
  const bob = await new Player('bob-00001').connect()
  await alice.join(code)
  const aliceMark = alice.mark()
  const joined = await bob.join(code)
  await alice.next('state', m => m.room.players.blue.online, aliceMark)
  return { code, alice, bob, joined }
}

beforeEach(async () => {
  app = createApp({ rooms: new RoomManager() })
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await Promise.all(sockets.splice(0).map(socket => socket.close()))
  await app.close()
})

describe('HTTP', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, rooms: 0 })
  })

  it('creates rooms with short codes and validates settings', async () => {
    const code = await newRoom()
    expect(code).toMatch(/^[A-Z2-9]{5}$/)
    expect((await createRoom({ size: 12, swapRule: true })).status).toBe(400)
    expect((await createRoom({ size: 11 })).status).toBe(400)
  })
})

describe('online protocol', () => {
  it('seats the creator as Red and the next player as Blue; others watch', async () => {
    const { code, alice, joined } = await twoPlayers()
    expect(joined.you).toBe('blue')
    const aliceView = alice.messages.filter(m => m.t === 'state').at(-1) as Extract<ServerMessage, { t: 'state' }>
    expect(aliceView.you).toBe('red')
    expect(aliceView.room.players.red).toEqual({ taken: true, online: true })

    const carol = await new Player('carol-0001').connect()
    const watching = await carol.join(code)
    expect(watching.you).toBe('spectator')
    expect(watching.room.spectators).toBe(1)
    expect((await carol.move(60, 0))).toMatchObject({ t: 'error', code: 'spectator' })
  })

  it('waits for both players before accepting moves', async () => {
    const code = await newRoom('alice-0001')
    const alice = await new Player('alice-0001').connect()
    expect((await alice.join(code)).you).toBe('red')
    expect(await alice.move(60, 0)).toMatchObject({ t: 'error', code: 'waiting' })
    const bob = await new Player('bob-00001').connect()
    await bob.join(code)
    expect(await alice.move(60, 0)).toMatchObject({ t: 'state' })
  })

  it('applies legal moves and broadcasts them to both players', async () => {
    const { alice, bob } = await twoPlayers()
    const bobMark = bob.mark()
    const reply = await alice.move(60, 0)
    expect(reply.t).toBe('state')
    const seen = await bob.next('state', m => m.room.game.moves.length === 1, bobMark)
    expect(seen.room.game.moves).toEqual([60])
    expect(fromRecord(seen.room.game)?.toMove).toBe('blue')
  })

  it('enforces turn order, occupancy and staleness', async () => {
    const { alice, bob } = await twoPlayers()
    expect(await bob.move(5, 0)).toMatchObject({ t: 'error', code: 'not-your-turn' })
    await alice.move(60, 0)
    expect(await alice.move(61, 1)).toMatchObject({ t: 'error', code: 'not-your-turn' })
    expect(await bob.move(60, 1)).toMatchObject({ t: 'error', code: 'illegal' })
    expect(await bob.move(500, 1)).toMatchObject({ t: 'error', code: 'illegal' })
    expect(await bob.move(61, 0)).toMatchObject({ t: 'error', code: 'stale' })
    expect(await bob.move(61, 1)).toMatchObject({ t: 'state' })
  })

  it('rejects malformed messages and moves before joining', async () => {
    const stranger = await new Player('stranger-1').connect()
    let mark = stranger.mark()
    stranger.send({ t: 'nonsense' })
    expect(await stranger.next('error', () => true, mark)).toMatchObject({ code: 'bad-message' })
    mark = stranger.mark()
    stranger.ws.send('not json')
    expect(await stranger.next('error', () => true, mark)).toMatchObject({ code: 'bad-message' })
    expect(await stranger.move(3, 0)).toMatchObject({ t: 'error', code: 'not-joined' })
    mark = stranger.mark()
    stranger.send({ t: 'join', room: 'ZZZZZ', playerId: 'stranger-1' })
    expect(await stranger.next('error', () => true, mark)).toMatchObject({ code: 'no-room' })
  })

  it('supports the swap rule only for Blue right after the first move', async () => {
    const { alice, bob } = await twoPlayers(true)
    expect(await alice.move('swap', 0)).toMatchObject({ t: 'error' })
    await alice.move(2 * 11 + 7, 0)
    const swapped = await bob.move('swap', 1)
    expect(swapped.t).toBe('state')
    const game = fromRecord((swapped as Extract<ServerMessage, { t: 'state' }>).room.game)!
    expect(game.board[7 * 11 + 2]).toBe(2)
    expect(game.toMove).toBe('red')
    expect(await alice.move('swap', 2)).toMatchObject({ t: 'error', code: 'illegal' })
  })

  it('refuses swap when the room has the rule off', async () => {
    const { alice, bob } = await twoPlayers(false)
    await alice.move(30, 0)
    expect(await bob.move('swap', 1)).toMatchObject({ t: 'error', code: 'illegal' })
  })

  it('gives a reconnecting player their seat back and shows presence', async () => {
    const { code, alice, bob } = await twoPlayers()
    await alice.move(60, 0)
    const aliceMark = alice.mark()
    await bob.close()
    const offline = await alice.next('state', m => !m.room.players.blue.online, aliceMark)
    expect(offline.room.players.blue.taken).toBe(true)

    const intruder = await new Player('intruder-1').connect()
    expect((await intruder.join(code)).you).toBe('spectator')

    const bobAgain = await new Player('bob-00001').connect()
    const rejoined = await bobAgain.join(code)
    expect(rejoined.you).toBe('blue')
    expect(rejoined.room.game.moves).toEqual([60])
    expect(await bobAgain.move(61, 1)).toMatchObject({ t: 'state' })
  })

  it('undoes only with the opponent’s agreement', async () => {
    const { alice, bob } = await twoPlayers()
    await alice.move(60, 0)
    await bob.move(61, 1)
    let bobMark = bob.mark()
    alice.send({ t: 'undo' })
    const asked = await bob.next('state', m => m.room.undoRequest === 'red', bobMark)
    expect(asked.room.game.moves).toHaveLength(2)
    let aliceMark = alice.mark()
    bob.send({ t: 'undo-decline' })
    const declined = await alice.next('state', () => true, aliceMark)
    expect(declined.room.undoRequest).toBeNull()
    expect(declined.room.game.moves).toHaveLength(2)

    bobMark = bob.mark()
    alice.send({ t: 'undo' })
    await bob.next('state', m => m.room.undoRequest === 'red', bobMark)
    aliceMark = alice.mark()
    bob.send({ t: 'undo' })
    // Red's last move and Blue's reply are both taken back; Red is to move again.
    const undone = await alice.next('state', () => true, aliceMark)
    expect(undone.room.game.moves).toEqual([])
    expect(undone.room.undoRequest).toBeNull()

    bobMark = bob.mark()
    bob.send({ t: 'undo' })
    expect(await bob.next('error', () => true, bobMark)).toMatchObject({ code: 'no-undo' })
  })

  it('starts a rematch with colors switched when both agree', async () => {
    const { alice, bob } = await twoPlayers()
    await alice.move(60, 0)
    const bobMark = bob.mark()
    alice.send({ t: 'rematch' })
    await bob.next('state', m => m.room.rematch.includes('red'), bobMark)
    const aliceMark = alice.mark()
    bob.send({ t: 'rematch' })
    const next = await alice.next('state', m => m.room.round === 2, aliceMark)
    expect(next.you).toBe('blue')
    expect(next.room.game.moves).toEqual([])
    const bobView = await bob.next('state', m => m.room.round === 2, bobMark)
    expect(bobView.you).toBe('red')
    expect(await bob.move(60, 0)).toMatchObject({ t: 'state' })
  })
})
