/**
 * A Hex bot: Monte Carlo tree search with RAVE, and playouts that answer
 * intrusions into their own bridges. Hex has no draws and filling the board
 * never undoes a connection, so a playout simply fills every empty cell and
 * checks who connected.
 */
import { canSwap, findWinningPath, neighborTable, other, PLAYER_CELL, play, type GameState, type Move, type Player } from './hex'

export type BotLevel = 'easy' | 'normal' | 'hard'
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard']

export interface BotOptions {
  level: BotLevel
  /** Overrides the level's thinking time (ms). */
  timeMs?: number
  /** Overrides the level's iteration cap. */
  maxIterations?: number
  random?: () => number
}

const LEVELS: Record<BotLevel, { timeMs: number; maxIterations: number; temperature: number }> = {
  easy: { timeMs: 120, maxIterations: 400, temperature: 1 },
  normal: { timeMs: 700, maxIterations: Infinity, temperature: 0 },
  hard: { timeMs: 2500, maxIterations: Infinity, temperature: 0 }
}

const RAVE_EQUIVALENCE = 400
const EXPLORATION = 0.15

class Node {
  readonly moves: Int16Array
  readonly n: Float64Array
  readonly w: Float64Array
  readonly rn: Float64Array
  readonly rw: Float64Array
  readonly children: Array<Node | null>
  visits = 0

  constructor(board: Int8Array, readonly color: number) {
    let count = 0
    for (let i = 0; i < board.length; i++) if (board[i] === 0) count++
    this.moves = new Int16Array(count)
    for (let i = 0, j = 0; i < board.length; i++) if (board[i] === 0) this.moves[j++] = i
    this.n = new Float64Array(count)
    this.w = new Float64Array(count)
    this.rn = new Float64Array(count)
    this.rw = new Float64Array(count)
    this.children = new Array(count).fill(null)
  }

  select(): number {
    const logVisits = Math.log(this.visits + 1)
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < this.moves.length; i++) {
      const n = this.n[i]
      const rn = this.rn[i]
      const rave = rn > 0 ? this.rw[i] / rn : 0.5
      let value: number
      if (n === 0) {
        value = rave + 1
      } else {
        const beta = Math.sqrt(RAVE_EQUIVALENCE / (3 * n + RAVE_EQUIVALENCE))
        value = (1 - beta) * (this.w[i] / n) + beta * rave + EXPLORATION * Math.sqrt(logVisits / n)
      }
      if (value > bestScore) {
        bestScore = value
        best = i
      }
    }
    return best
  }
}

/** Fills the board at random from `color` to move, answering bridge intrusions. Mutates `board`. */
function playout(board: Int8Array, color: number, table: Int16Array, random: () => number, lastMove: number): void {
  const total = board.length
  const empties = new Int16Array(total)
  const position = new Int16Array(total).fill(-1)
  let count = 0
  for (let i = 0; i < total; i++) {
    if (board[i] === 0) {
      position[i] = count
      empties[count++] = i
    }
  }
  const take = (cell: number) => {
    const at = position[cell]
    const moved = empties[--count]
    empties[at] = moved
    position[moved] = at
    position[cell] = -1
  }
  let last = lastMove
  while (count > 0) {
    let move = -1
    if (last >= 0) {
      // Opponent stepped between two of our stones that formed a bridge: save it.
      const base = last * 6
      for (let k = 0; k < 6; k++) {
        const a = table[base + k]
        const between = table[base + ((k + 1) % 6)]
        const b = table[base + ((k + 2) % 6)]
        if (a >= 0 && b >= 0 && between >= 0 && board[a] === color && board[b] === color && board[between] === 0) {
          move = between
          break
        }
      }
    }
    if (move < 0) move = empties[Math.floor(random() * count)]
    take(move)
    board[move] = color
    last = move
    color = 3 - color
  }
}

function redWins(board: Int8Array, size: number): boolean {
  return findWinningPath(board, size, 'red').length > 0
}

/** A move that wins at once for `player`, or -1. */
function winningMove(state: GameState, player: Player): number {
  const board = state.board.slice()
  const mine = PLAYER_CELL[player]
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) continue
    board[i] = mine
    const won = findWinningPath(board, state.size, player).length > 0
    board[i] = 0
    if (won) return i
  }
  return -1
}

function edgeDistance(cell: number, size: number): number {
  const r = Math.floor(cell / size)
  const c = cell % size
  return Math.min(r, c, size - 1 - r, size - 1 - c)
}

/** Should Blue swap Red's opening stone? Central stones are too strong to leave to Red. */
export function shouldSwap(state: GameState, level: BotLevel): boolean {
  if (!canSwap(state)) return false
  const first = state.moves[0] as number
  return edgeDistance(first, state.size) >= (level === 'easy' ? 2 : 1)
}

/** A modest first move for when the opponent may swap: near an edge, away from the corners. */
function fairOpening(size: number, random: () => number): number {
  const options: number[] = []
  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size)
    const c = cell % size
    const nearEdge = edgeDistance(cell, size) === 1
    const awayFromCorners = Math.min(r, size - 1 - r) >= 2 || Math.min(c, size - 1 - c) >= 2
    if (nearEdge && awayFromCorners && (r === 1 || r === size - 2)) options.push(cell)
  }
  return options[Math.floor(random() * options.length)]
}

export interface SearchResult {
  move: Move
  iterations: number
  /** Estimated chance that the side to move wins, from the search. */
  winRate: number
}

export function chooseMove(state: GameState, options: BotOptions): SearchResult {
  if (state.winner) throw new Error('The game is over')
  const random = options.random ?? Math.random
  const level = LEVELS[options.level]
  const size = state.size
  const player = state.toMove

  if (canSwap(state) && shouldSwap(state, options.level)) return { move: 'swap', iterations: 0, winRate: 0.5 }
  if (state.moves.length === 0) {
    const center = Math.floor(size / 2) * size + Math.floor(size / 2)
    return { move: state.swapRule ? fairOpening(size, random) : center, iterations: 0, winRate: 0.5 }
  }
  if (options.level !== 'easy') {
    const win = winningMove(state, player)
    if (win >= 0) return { move: win, iterations: 0, winRate: 1 }
    const threat = winningMove(state, other(player))
    if (threat >= 0) return { move: threat, iterations: 0, winRate: 0.5 }
  }

  const timeMs = options.timeMs ?? level.timeMs
  const maxIterations = options.maxIterations ?? level.maxIterations
  const table = neighborTable(size)
  const rootBoard = Int8Array.from(state.board)
  const rootColor = PLAYER_CELL[player]
  const root = new Node(rootBoard, rootColor)
  const board = new Int8Array(rootBoard.length)
  const path: Array<[Node, number]> = []
  const lastCell = state.lastCell ?? -1
  const deadline = performance.now() + timeMs
  let iterations = 0

  while (iterations < maxIterations && (iterations & 63 || performance.now() < deadline)) {
    board.set(rootBoard)
    path.length = 0
    let node = root
    let color = rootColor
    let last = lastCell
    while (node.moves.length > 0) {
      const index = node.select()
      const move = node.moves[index]
      board[move] = color
      last = move
      path.push([node, index])
      color = 3 - color
      const child = node.children[index]
      if (!child) {
        if (node.n[index] > 0) node.children[index] = new Node(board, color)
        break
      }
      node = child
    }
    playout(board, color, table, random, last)
    const winner = redWins(board, size) ? 1 : 2
    for (const [visited, index] of path) {
      const result = winner === visited.color ? 1 : 0
      visited.visits++
      visited.n[index]++
      visited.w[index] += result
      for (let i = 0; i < visited.moves.length; i++) {
        if (board[visited.moves[i]] === visited.color) {
          visited.rn[i]++
          visited.rw[i] += result
        }
      }
    }
    iterations++
  }

  let pick = 0
  if (level.temperature > 0) {
    // Easy: sample in proportion to squared visits, so it slips now and then.
    let sum = 0
    for (let i = 0; i < root.n.length; i++) sum += root.n[i] ** 2
    let target = random() * sum
    for (let i = 0; i < root.n.length; i++) {
      target -= root.n[i] ** 2
      if (target <= 0) { pick = i; break }
    }
  } else {
    for (let i = 1; i < root.n.length; i++) if (root.n[i] > root.n[pick]) pick = i
  }
  const winRate = root.n[pick] > 0 ? root.w[pick] / root.n[pick] : 0.5
  return { move: root.moves[pick], iterations, winRate }
}

/** Test helper: plays a whole bot-vs-bot game. */
export function selfPlay(state: GameState, options: BotOptions): GameState {
  while (!state.winner) state = play(state, chooseMove(state, options).move)
  return state
}
