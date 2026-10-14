/**
 * Hex rules, shared by the browser, the bot and the server.
 *
 * Cells are numbered row by row: cell = row * size + col. Red owns the top
 * and bottom edges (rows 0 and size-1); Blue owns the left and right edges
 * (cols 0 and size-1). Red always moves first.
 *
 * Swap rule ("swap pieces" form): right after Red's first stone, Blue may
 * answer with `'swap'` instead of a stone. Red's stone is then replaced by a
 * Blue stone on the mirrored cell (row and column exchanged) and it is Red's
 * turn again. Colors never change hands, so seats stay simple.
 */

export type Player = 'red' | 'blue'
export type Move = number | 'swap'
export type Cell = 0 | 1 | 2 // empty, red, blue

export const SIZES = [9, 11, 13] as const
export type BoardSize = (typeof SIZES)[number]
export const DEFAULT_SIZE: BoardSize = 11

export interface GameConfig {
  size: number
  swapRule: boolean
}

export interface GameState extends GameConfig {
  moves: Move[]
  board: Cell[]
  toMove: Player
  winner: Player | null
  /** Shortest chain of the winner's stones from one of their edges to the other. */
  winningPath: number[]
  /** The cell changed by the latest move (the mirrored cell after a swap). */
  lastCell: number | null
}

export const PLAYER_CELL: Record<Player, Cell> = { red: 1, blue: 2 }
export const other = (player: Player): Player => (player === 'red' ? 'blue' : 'red')

export function isValidSize(size: unknown): size is BoardSize {
  return typeof size === 'number' && (SIZES as readonly number[]).includes(size)
}

/** Neighbor offsets in cyclic order, so consecutive entries are adjacent to each other. */
export const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1], [0, -1]
]

const neighborCache = new Map<number, Int16Array>()

/**
 * For each cell, its 6 neighbors in cyclic order (-1 where off the board),
 * flattened: neighbors of cell i are at [i*6, i*6+6).
 */
export function neighborTable(size: number): Int16Array {
  let table = neighborCache.get(size)
  if (table) return table
  table = new Int16Array(size * size * 6)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const base = (r * size + c) * 6
      NEIGHBOR_OFFSETS.forEach(([dr, dc], k) => {
        const nr = r + dr
        const nc = c + dc
        table![base + k] = nr >= 0 && nr < size && nc >= 0 && nc < size ? nr * size + nc : -1
      })
    }
  }
  neighborCache.set(size, table)
  return table
}

export function neighbors(cell: number, size: number): number[] {
  const table = neighborTable(size)
  const out: number[] = []
  for (let k = 0; k < 6; k++) {
    const n = table[cell * 6 + k]
    if (n >= 0) out.push(n)
  }
  return out
}

/** The cell reflected across the long diagonal: (row, col) -> (col, row). */
export function mirrorCell(cell: number, size: number): number {
  const r = Math.floor(cell / size)
  const c = cell % size
  return c * size + r
}

/** Human name for a cell, e.g. "c5": column letter, then row number from 1. */
export function cellName(cell: number, size: number): string {
  const r = Math.floor(cell / size)
  const c = cell % size
  return `${String.fromCharCode(97 + c)}${r + 1}`
}

const onEndEdge = (player: Player, cell: number, size: number) =>
  player === 'red' ? cell >= size * (size - 1) : cell % size === size - 1

/**
 * Returns the shortest chain of `player`'s stones joining their two edges, or
 * an empty array if they are not connected.
 */
export function findWinningPath(board: ArrayLike<number>, size: number, player: Player): number[] {
  const mine = PLAYER_CELL[player]
  const table = neighborTable(size)
  const previous = new Int32Array(size * size).fill(-2)
  const queue: number[] = []
  for (let i = 0; i < size; i++) {
    const cell = player === 'red' ? i : i * size
    if (board[cell] === mine) {
      previous[cell] = -1
      queue.push(cell)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]
    if (onEndEdge(player, cell, size)) {
      const path: number[] = []
      for (let at = cell; at !== -1; at = previous[at]) path.push(at)
      return path.reverse()
    }
    for (let k = 0; k < 6; k++) {
      const n = table[cell * 6 + k]
      if (n >= 0 && board[n] === mine && previous[n] === -2) {
        previous[n] = cell
        queue.push(n)
      }
    }
  }
  return []
}

export function hasWon(board: ArrayLike<number>, size: number, player: Player): boolean {
  return findWinningPath(board, size, player).length > 0
}

export function newGame(config: GameConfig): GameState {
  if (!isValidSize(config.size)) throw new Error(`Unsupported board size: ${config.size}`)
  return {
    size: config.size,
    swapRule: config.swapRule,
    moves: [],
    board: new Array<Cell>(config.size * config.size).fill(0),
    toMove: 'red',
    winner: null,
    winningPath: [],
    lastCell: null
  }
}

export function canSwap(state: GameState): boolean {
  return state.swapRule && state.winner === null && state.moves.length === 1 && typeof state.moves[0] === 'number'
}

/** Why `move` is not allowed right now, or null if it is. */
export function moveError(state: GameState, move: unknown): string | null {
  if (state.winner) return 'The game is over'
  if (move === 'swap') return canSwap(state) ? null : 'Swap is not available'
  if (typeof move !== 'number' || !Number.isInteger(move)) return 'Not a move'
  if (move < 0 || move >= state.size * state.size) return 'Off the board'
  if (state.board[move] !== 0) return 'That cell is taken'
  return null
}

export function isLegal(state: GameState, move: unknown): move is Move {
  return moveError(state, move) === null
}

/** Returns the state after `move`. Throws if the move is illegal. */
export function play(state: GameState, move: Move): GameState {
  const error = moveError(state, move)
  if (error) throw new Error(error)
  const board = state.board.slice()
  const player = state.toMove
  let lastCell: number
  if (move === 'swap') {
    const first = state.moves[0] as number
    board[first] = 0
    lastCell = mirrorCell(first, state.size)
    board[lastCell] = PLAYER_CELL.blue
  } else {
    board[move] = PLAYER_CELL[player]
    lastCell = move
  }
  const winningPath = move === 'swap' ? [] : findWinningPath(board, state.size, player)
  return {
    ...state,
    moves: [...state.moves, move],
    board,
    toMove: other(player),
    winner: winningPath.length > 0 ? player : null,
    winningPath,
    lastCell
  }
}

/** Rebuilds a game from its move list. Throws on the first illegal move. */
export function replay(config: GameConfig, moves: readonly Move[]): GameState {
  let state = newGame(config)
  for (const move of moves) state = play(state, move)
  return state
}

/** The game with its last `count` moves taken back. */
export function undo(state: GameState, count = 1): GameState {
  return replay(state, state.moves.slice(0, Math.max(0, state.moves.length - count)))
}

/** Plain-data form for storage and the network. */
export interface GameRecord extends GameConfig {
  moves: Move[]
}

export const toRecord = (state: GameState): GameRecord => ({ size: state.size, swapRule: state.swapRule, moves: state.moves.slice() })

/** Parses untrusted data into a game, or returns null. */
export function fromRecord(data: unknown): GameState | null {
  if (!data || typeof data !== 'object') return null
  const { size, swapRule, moves } = data as Partial<GameRecord>
  if (!isValidSize(size) || typeof swapRule !== 'boolean' || !Array.isArray(moves)) return null
  try {
    return replay({ size, swapRule }, moves as Move[])
  } catch {
    return null
  }
}
