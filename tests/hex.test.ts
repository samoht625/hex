import { describe, expect, it } from 'vitest'
import {
  canSwap, cellName, findWinningPath, fromRecord, hasWon, mirrorCell, moveError, neighbors, newGame, play, toRecord, undo,
  type Cell, type GameState, type Move
} from '../src/shared/hex'

const at = (size: number, r: number, c: number) => r * size + c

/** Builds a board from rows of '.', 'R', 'B' (whitespace ignored). */
function board(rows: string[]): { size: number; cells: Cell[] } {
  const clean = rows.map(row => row.replace(/\s/g, ''))
  const size = clean.length
  return { size, cells: clean.join('').split('').map(ch => (ch === 'R' ? 1 : ch === 'B' ? 2 : 0)) }
}

/** Plays the moves in order. */
function playAll(state: GameState, moves: Move[]): GameState {
  return moves.reduce(play, state)
}

describe('board geometry', () => {
  it('gives corner and interior cells the right neighbors', () => {
    expect(neighbors(at(11, 0, 0), 11).sort((a, b) => a - b)).toEqual([at(11, 0, 1), at(11, 1, 0)])
    expect(neighbors(at(11, 0, 10), 11).sort((a, b) => a - b)).toEqual([at(11, 0, 9), at(11, 1, 9), at(11, 1, 10)])
    expect(neighbors(at(11, 5, 5), 11)).toHaveLength(6)
    expect(neighbors(at(11, 5, 5), 11)).toEqual([at(11, 4, 5), at(11, 4, 6), at(11, 5, 6), at(11, 6, 5), at(11, 6, 4), at(11, 5, 4)])
  })

  it('names cells by column letter and row number', () => {
    expect(cellName(0, 11)).toBe('a1')
    expect(cellName(at(11, 10, 10), 11)).toBe('k11')
  })

  it('mirrors across the long diagonal', () => {
    expect(mirrorCell(at(11, 2, 7), 11)).toBe(at(11, 7, 2))
    expect(mirrorCell(at(11, 4, 4), 11)).toBe(at(11, 4, 4))
  })
})

describe('win detection', () => {
  it('finds a straight red column from top to bottom', () => {
    const { size, cells } = board(['.R...', '.R...', '.R...', '.R...', '.R...'])
    expect(hasWon(cells, size, 'red')).toBe(true)
    expect(hasWon(cells, size, 'blue')).toBe(false)
    expect(findWinningPath(cells, size, 'red')).toEqual([1, 6, 11, 16, 21])
  })

  it('follows hex adjacency (down-left diagonal links, not down-right)', () => {
    // (r, c) touches (r+1, c-1) but not (r+1, c+1).
    const linked = board(['....R', '...R.', '..R..', '.R...', 'R....'])
    expect(hasWon(linked.cells, linked.size, 'red')).toBe(true)
    const broken = board(['R....', '.R...', '..R..', '...R.', '....R'])
    expect(hasWon(broken.cells, broken.size, 'red')).toBe(false)
  })

  it('detects a winding blue chain from left to right', () => {
    const { size, cells } = board([
      'BB...',
      '.B...',
      '.B.BB',
      '.BB..',
      '.....'
    ])
    // (2,3) is reached from (3,2) through its up-right neighbor.
    expect(hasWon(cells, size, 'blue')).toBe(true)
    const path = findWinningPath(cells, size, 'blue')
    expect(path[0] % size).toBe(0)
    expect(path[path.length - 1] % size).toBe(size - 1)
  })

  it('returns the shortest chain, not the whole group', () => {
    const { size, cells } = board([
      'RRRR.',
      'R..R.',
      'R..R.',
      'R..R.',
      'R..R.'
    ])
    expect(findWinningPath(cells, size, 'red')).toHaveLength(5)
  })

  it('does not count touching only one edge', () => {
    const { size, cells } = board(['RRRRR', '.....', '.....', '.....', '.....'])
    expect(hasWon(cells, size, 'red')).toBe(false)
    expect(hasWon(cells, size, 'blue')).toBe(false)
  })

  it('ends the game when a move completes a chain', () => {
    let state = newGame({ size: 9, swapRule: false })
    for (let r = 0; r < 8; r++) state = playAll(state, [at(9, r, 4), at(9, r, 0)])
    expect(state.winner).toBeNull()
    state = play(state, at(9, 8, 4))
    expect(state.winner).toBe('red')
    expect(state.winningPath).toHaveLength(9)
    expect(moveError(state, at(9, 8, 8))).toBe('The game is over')
  })

  it('a full board always has exactly one winner', () => {
    for (let trial = 0; trial < 50; trial++) {
      const size = 9
      const cells = Array.from({ length: size * size }, () => (Math.random() < 0.5 ? 1 : 2)) as Cell[]
      expect(hasWon(cells, size, 'red')).not.toBe(hasWon(cells, size, 'blue'))
    }
  })
})

describe('turns and legality', () => {
  it('alternates turns starting with Red', () => {
    let state = newGame({ size: 11, swapRule: false })
    expect(state.toMove).toBe('red')
    state = play(state, 60)
    expect(state.toMove).toBe('blue')
    expect(state.board[60]).toBe(1)
    expect(state.lastCell).toBe(60)
  })

  it('refuses taken cells and cells off the board', () => {
    const state = play(newGame({ size: 11, swapRule: false }), 60)
    expect(moveError(state, 60)).toBe('That cell is taken')
    expect(moveError(state, 121)).toBe('Off the board')
    expect(moveError(state, -1)).toBe('Off the board')
    expect(moveError(state, 2.5)).toBe('Not a move')
    expect(() => play(state, 60)).toThrow()
  })

  it('undoes moves', () => {
    const state = playAll(newGame({ size: 11, swapRule: true }), [3, 'swap', 50])
    expect(undo(state).moves).toEqual([3, 'swap'])
    expect(undo(state, 2).board[3]).toBe(1)
    expect(undo(state, 5).moves).toEqual([])
  })

  it('round-trips through records and rejects tampered ones', () => {
    const state = playAll(newGame({ size: 9, swapRule: true }), [10, 'swap', 40])
    expect(fromRecord(JSON.parse(JSON.stringify(toRecord(state))))?.board).toEqual(state.board)
    expect(fromRecord({ size: 9, swapRule: true, moves: [10, 10] })).toBeNull()
    expect(fromRecord({ size: 10, swapRule: true, moves: [] })).toBeNull()
    expect(fromRecord({ size: 9, swapRule: false, moves: [10, 'swap'] })).toBeNull()
  })
})

describe('swap rule', () => {
  const size = 11
  const first = at(size, 2, 7)

  it('lets Blue swap only right after the first move', () => {
    const fresh = newGame({ size, swapRule: true })
    expect(canSwap(fresh)).toBe(false)
    expect(moveError(fresh, 'swap')).toBe('Swap is not available')
    const afterFirst = play(fresh, first)
    expect(canSwap(afterFirst)).toBe(true)
    const afterSecond = play(afterFirst, 0)
    expect(canSwap(afterSecond)).toBe(false)
    expect(() => play(afterSecond, 'swap')).toThrow('Swap is not available')
  })

  it('replaces Red’s stone with a Blue stone on the mirrored cell, and Red moves next', () => {
    const swapped = playAll(newGame({ size, swapRule: true }), [first, 'swap'])
    expect(swapped.board[first]).toBe(0)
    expect(swapped.board[at(size, 7, 2)]).toBe(2)
    expect(swapped.board.filter(cell => cell !== 0)).toHaveLength(1)
    expect(swapped.toMove).toBe('red')
    expect(swapped.lastCell).toBe(at(size, 7, 2))
    expect(canSwap(swapped)).toBe(false)
  })

  it('keeps a stone on the diagonal in place but changes its color', () => {
    const diagonal = at(size, 5, 5)
    const swapped = playAll(newGame({ size, swapRule: true }), [diagonal, 'swap'])
    expect(swapped.board[diagonal]).toBe(2)
  })

  it('is unavailable when the rule is off', () => {
    const state = play(newGame({ size, swapRule: false }), first)
    expect(canSwap(state)).toBe(false)
    expect(moveError(state, 'swap')).toBe('Swap is not available')
  })

  it('cannot be used twice', () => {
    const swapped = playAll(newGame({ size, swapRule: true }), [first, 'swap'])
    expect(moveError(swapped, 'swap')).toBe('Swap is not available')
  })

  it('swapped stones count toward Blue’s connection', () => {
    // Red opens in the top-right corner; the swap turns it into Blue's bottom-left corner stone.
    let state = playAll(newGame({ size: 9, swapRule: true }), [at(9, 0, 8), 'swap'])
    for (let i = 0; i < 8; i++) {
      state = play(state, at(9, i, 0))
      state = play(state, at(9, 8, i + 1))
    }
    expect(state.winner).toBe('blue')
    expect(state.winningPath).toContain(at(9, 8, 0))
  })
})
