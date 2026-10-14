import { describe, expect, it } from 'vitest'
import { chooseMove, shouldSwap } from '../src/shared/bot'
import { isLegal, newGame, play, type GameState, type Move } from '../src/shared/hex'

const at = (size: number, r: number, c: number) => r * size + c
const playAll = (state: GameState, moves: Move[]) => moves.reduce(play, state)

describe('bot', () => {
  it('takes an immediate win', () => {
    // Red has column 4 filled except the last row.
    let state = newGame({ size: 9, swapRule: false })
    for (let r = 0; r < 8; r++) state = playAll(state, [at(9, r, 4), at(9, r, r === 0 ? 0 : 8)])
    const { move } = chooseMove(state, { level: 'normal', maxIterations: 50 })
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
    expect(chooseMove(state, { level: 'normal', maxIterations: 3000 }).move).toBe(at(9, 4, 4))
  })

  it('swaps a strong central opening but not a weak corner one', () => {
    const center = play(newGame({ size: 11, swapRule: true }), at(11, 5, 5))
    const corner = play(newGame({ size: 11, swapRule: true }), at(11, 0, 0))
    expect(shouldSwap(center, 'normal')).toBe(true)
    expect(chooseMove(center, { level: 'normal' }).move).toBe('swap')
    expect(shouldSwap(corner, 'normal')).toBe(false)
    expect(chooseMove(corner, { level: 'normal', maxIterations: 200 }).move).not.toBe('swap')
  })

  it('opens near the edge when the opponent may swap, in the center otherwise', () => {
    const withSwap = chooseMove(newGame({ size: 11, swapRule: true }), { level: 'normal' }).move as number
    const r = Math.floor(withSwap / 11)
    expect(r === 1 || r === 9).toBe(true)
    expect(chooseMove(newGame({ size: 11, swapRule: false }), { level: 'normal' }).move).toBe(at(11, 5, 5))
  })

  it('only plays legal moves, at every level', () => {
    for (const level of ['easy', 'normal'] as const) {
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
        if (state.toMove === botColor) move = chooseMove(state, { level: 'normal', maxIterations: 1500 }).move
        else {
          const empty = state.board.flatMap((cell, index) => (cell === 0 ? [index] : []))
          move = empty[Math.floor(Math.random() * empty.length)]
        }
        state = play(state, move)
      }
      expect(state.winner).toBe(botColor)
    }
  })
})
