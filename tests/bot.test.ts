import { describe, expect, it } from 'vitest'
import { chooseMove, internals, shouldSwap, toBotLevel, type BotLevel } from '../src/shared/bot'
import { isLegal, newGame, play, type GameState, type Move } from '../src/shared/hex'

const at = (size: number, r: number, c: number) => r * size + c
const playAll = (state: GameState, moves: Move[]) => moves.reduce(play, state)

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function boardWith(size: number, stones: Record<number, 1 | 2>): Int8Array {
  const board = new Int8Array(size * size)
  for (const [cell, color] of Object.entries(stones)) board[Number(cell)] = color
  return board
}

describe('bot', () => {
  it('takes an immediate win', () => {
    // Red has column 4 filled except the last row.
    let state = newGame({ size: 9, swapRule: false })
    for (let r = 0; r < 8; r++) state = playAll(state, [at(9, r, 4), at(9, r, r === 0 ? 0 : 8)])
    const { move } = chooseMove(state, { level: 'medium', maxIterations: 50 })
    expect([at(9, 8, 3), at(9, 8, 4)]).toContain(move)
    expect(play(state, move).winner).toBe('red')
  })

  it('blocks a one-move threat', () => {
    // Blue fills row 4 except (4, 4); Red to move must take that cell.
    let state = newGame({ size: 9, swapRule: false })
    const blues = [0, 1, 2, 3, 5, 6, 7, 8].map(c => at(9, 4, c))
    const reds = [at(9, 0, 0), at(9, 0, 2), at(9, 0, 4), at(9, 0, 6), at(9, 0, 8), at(9, 8, 0), at(9, 8, 3), at(9, 8, 6)]
    for (let i = 0; i < blues.length; i++) state = playAll(state, [reds[i], blues[i]])
    expect(state.toMove).toBe('red')
    expect(chooseMove(state, { level: 'medium', maxIterations: 3000 }).move).toBe(at(9, 4, 4))
  })

  it('swaps a strong central opening but not a weak corner one', () => {
    const center = play(newGame({ size: 11, swapRule: true }), at(11, 5, 5))
    const corner = play(newGame({ size: 11, swapRule: true }), at(11, 0, 0))
    expect(shouldSwap(center, 'medium')).toBe(true)
    expect(chooseMove(center, { level: 'medium' }).move).toBe('swap')
    expect(shouldSwap(corner, 'medium')).toBe(false)
    expect(chooseMove(corner, { level: 'medium', maxIterations: 200 }).move).not.toBe('swap')
  })

  it('opens near the edge when the opponent may swap, in the center otherwise', () => {
    const withSwap = chooseMove(newGame({ size: 11, swapRule: true }), { level: 'medium' }).move as number
    const r = Math.floor(withSwap / 11)
    expect(r === 1 || r === 9).toBe(true)
    expect(chooseMove(newGame({ size: 11, swapRule: false }), { level: 'medium' }).move).toBe(at(11, 5, 5))
  })

  it('only plays legal moves, at every level', () => {
    for (const level of ['easy', 'medium'] as const) {
      let state = playAll(newGame({ size: 9, swapRule: true }), [at(9, 4, 4), 'swap', at(9, 2, 2)])
      for (let i = 0; i < 6 && !state.winner; i++) {
        const { move } = chooseMove(state, { level, maxIterations: 300 })
        expect(isLegal(state, move)).toBe(true)
        state = play(state, move)
      }
    }
  })

  it('beats a random player', () => {
    for (let game = 0; game < 4; game++) {
      const botColor = game % 2 === 0 ? 'red' : 'blue'
      let state = newGame({ size: 9, swapRule: false })
      while (!state.winner) {
        let move: Move
        if (state.toMove === botColor) move = chooseMove(state, { level: 'medium', maxIterations: 1500 }).move
        else {
          const empty = state.board.flatMap((cell, index) => (cell === 0 ? [index] : []))
          move = empty[Math.floor(Math.random() * empty.length)]
        }
        state = play(state, move)
      }
      expect(state.winner).toBe(botColor)
    }
  })

  it('reads stored levels, including the old name for Medium', () => {
    expect(toBotLevel('easy')).toBe('easy')
    expect(toBotLevel('hard')).toBe('hard')
    expect(toBotLevel('normal')).toBe('medium')
    expect(toBotLevel(undefined)).toBe('medium')
  })

  it('knows every bridge and its two carrier cells', () => {
    const { bridges, neighbors } = internals.geometry(9)
    const center = at(9, 4, 4)
    const partners: number[] = []
    for (let k = 0; k < 6; k++) {
      const [partner, a, b] = bridges.slice(center * 18 + k * 3, center * 18 + k * 3 + 3)
      partners.push(partner)
      for (const carrier of [a, b]) {
        expect(neighbors.slice(center * 6, center * 6 + 6)).toContain(carrier)
        expect(neighbors.slice(partner * 6, partner * 6 + 6)).toContain(carrier)
      }
    }
    expect(partners.sort((x, y) => x - y)).toEqual([at(9, 2, 5), at(9, 3, 3), at(9, 3, 6), at(9, 5, 2), at(9, 5, 5), at(9, 6, 3)].sort((x, y) => x - y))
    // A corner has a single bridge, toward the middle.
    expect(Array.from(bridges.slice(0, 18)).filter((_, i) => i % 3 === 0 && bridges[i] >= 0)).toEqual([at(9, 1, 1)])
  })

  it('answers an intrusion into a bridge with the other carrier', () => {
    const geo = internals.geometry(9)
    // Red bridge (4,4)-(2,5) has carriers (3,4) and (3,5); Blue takes (3,4).
    const board = boardWith(9, { [at(9, 4, 4)]: 1, [at(9, 2, 5)]: 1, [at(9, 3, 4)]: 2 })
    expect(internals.saveReply(board, 1, at(9, 3, 4), geo, Math.random)).toBe(at(9, 3, 5))
    // Blue has nothing to save there.
    expect(internals.saveReply(board, 2, at(9, 3, 4), geo, Math.random)).toBe(-1)
  })

  it('answers an intrusion into an edge template', () => {
    const geo = internals.geometry(9)
    // Red stone on the second row, (1,4), reaches the top edge through (0,4) or (0,5).
    const top = boardWith(9, { [at(9, 1, 4)]: 1, [at(9, 0, 4)]: 2 })
    expect(internals.saveReply(top, 1, at(9, 0, 4), geo, Math.random)).toBe(at(9, 0, 5))
    // Blue stone next to the right edge, (4,7), reaches it through (3,8) or (4,8).
    const right = boardWith(9, { [at(9, 4, 7)]: 2, [at(9, 4, 8)]: 1 })
    expect(internals.saveReply(right, 2, at(9, 4, 8), geo, Math.random)).toBe(at(9, 3, 8))
    // Red's edges are top and bottom only.
    expect(internals.saveReply(right, 1, at(9, 4, 8), geo, Math.random)).toBe(-1)
  })

  it('gets stronger with each level', () => {
    const match = (strong: BotLevel, weak: BotLevel, budget: [number, number], games: number) => {
      let wins = 0
      for (let game = 0; game < games; game++) {
        const strongColor = game % 2 === 0 ? 'red' : 'blue'
        const random = seeded(game + 1)
        let state = play(newGame({ size: 9, swapRule: false }), at(9, 2 + (game % 5), 3 + (game % 3)))
        while (!state.winner) {
          const level = state.toMove === strongColor ? strong : weak
          state = play(state, chooseMove(state, { level, maxIterations: level === strong ? budget[0] : budget[1], timeMs: 1e9, random }).move)
        }
        if (state.winner === strongColor) wins++
      }
      return wins
    }
    expect(match('medium', 'easy', [3000, 300], 4)).toBe(4)
  })
})
