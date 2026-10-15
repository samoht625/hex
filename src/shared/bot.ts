/**
 * A Hex bot: Monte Carlo tree search with RAVE.
 *
 * Hex has no draws and filling the board never undoes a connection, so a
 * playout simply fills every empty cell and checks who connected. Playouts
 * defend the two virtual connections every Hex player learns first: the
 * bridge (two stones with two shared empty neighbors) and the edge template
 * (a stone on the second row with two empty cells in front of it). New tree
 * nodes get prior knowledge from the same shapes, so the search spends its
 * time on sensible moves.
 */
import { canSwap, findWinningPath, neighborTable, other, PLAYER_CELL, play, type GameState, type Move, type Player } from './hex'

export type BotLevel = 'easy' | 'medium' | 'hard'
export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard']
export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/** Reads a stored level; older versions called Medium "normal". */
export function toBotLevel(value: unknown): BotLevel {
  return value === 'easy' || value === 'hard' ? value : 'medium'
}

export interface BotOptions {
  level: BotLevel
  /** Overrides the level's thinking time (ms). */
  timeMs?: number
  /** Overrides the level's iteration cap. */
  maxIterations?: number
  random?: () => number
}

interface LevelConfig {
  timeMs: number
  maxIterations: number
  /** 0 plays the most visited move; above 0 samples, so the bot slips now and then. */
  temperature: number
  /** Takes immediate wins and blocks immediate losses. */
  tactics: boolean
  /** Uses shape knowledge (priors and virtual-connection replies). */
  knowledge: boolean
}

const LEVELS: Record<BotLevel, LevelConfig> = {
  easy: { timeMs: 150, maxIterations: 300, temperature: 1, tactics: false, knowledge: false },
  medium: { timeMs: 800, maxIterations: Infinity, temperature: 0, tactics: true, knowledge: true },
  hard: { timeMs: 3000, maxIterations: Infinity, temperature: 0, tactics: true, knowledge: true }
}

/** Visits at which a move's own results and its RAVE statistics weigh the same. */
const RAVE_EQUIVALENCE = 600
/** Prior pseudo-visits for shapes, added to a move's RAVE statistics. */
const PRIOR = {
  save: { value: 1, weight: 80 },
  bridge: { value: 0.7, weight: 25 },
  contact: { value: 0.58, weight: 10 },
  firstLine: { value: 0.2, weight: 40 }
}

/** Per-size tables the search reuses. */
interface Geometry {
  size: number
  cells: number
  neighbors: Int16Array
  /** For each cell, up to 6 bridge partners and their two carrier cells: [partner, a, b] triples, -1 padded. */
  bridges: Int16Array
  /**
   * Edge templates, per color (index 1 red, 2 blue): for each edge cell L,
   * pairs [s, e] where s is a second-row cell next to L and e is s's other
   * edge cell. If the opponent takes L in front of our stone s, e saves it.
   */
  edgePairs: [null, Int16Array, Int16Array]
  /** Cells on any edge of the board. */
  firstLine: Uint8Array
}

const geometryCache = new Map<number, Geometry>()

function geometry(size: number): Geometry {
  const cached = geometryCache.get(size)
  if (cached) return cached
  const cells = size * size
  const neighbors = neighborTable(size)
  const bridges = new Int16Array(cells * 18).fill(-1)
  for (let cell = 0; cell < cells; cell++) {
    for (let k = 0; k < 6; k++) {
      const a = neighbors[cell * 6 + k]
      const b = neighbors[cell * 6 + ((k + 1) % 6)]
      if (a < 0 || b < 0) continue
      // The cell across from `cell` past the a–b pair: a's neighbor in direction k+1.
      const partner = neighbors[a * 6 + ((k + 1) % 6)]
      if (partner < 0) continue
      bridges.set([partner, a, b], cell * 18 + k * 3)
    }
  }
  const row = (cell: number) => Math.floor(cell / size)
  const col = (cell: number) => cell % size
  const edgeLines: Record<1 | 2, Array<{ line: (cell: number) => boolean; second: (cell: number) => boolean }>> = {
    1: [
      { line: c => row(c) === 0, second: c => row(c) === 1 },
      { line: c => row(c) === size - 1, second: c => row(c) === size - 2 }
    ],
    2: [
      { line: c => col(c) === 0, second: c => col(c) === 1 },
      { line: c => col(c) === size - 1, second: c => col(c) === size - 2 }
    ]
  }
  const edgePairs: Geometry['edgePairs'] = [null, new Int16Array(cells * 4).fill(-1), new Int16Array(cells * 4).fill(-1)]
  for (const color of [1, 2] as const) {
    for (const { line, second } of edgeLines[color]) {
      for (let cell = 0; cell < cells; cell++) {
        if (!line(cell)) continue
        let slot = 0
        for (let k = 0; k < 6; k++) {
          const s = neighbors[cell * 6 + k]
          if (s < 0 || !second(s)) continue
          for (let j = 0; j < 6; j++) {
            const e = neighbors[s * 6 + j]
            if (e >= 0 && e !== cell && line(e) && slot < 2) {
              edgePairs[color].set([s, e], cell * 4 + slot * 2)
              slot++
            }
          }
        }
      }
    }
  }
  const firstLine = new Uint8Array(cells)
  for (let cell = 0; cell < cells; cell++) {
    const r = row(cell)
    const c = col(cell)
    firstLine[cell] = r === 0 || c === 0 || r === size - 1 || c === size - 1 ? 1 : 0
  }
  const result = { size, cells, neighbors, bridges, edgePairs, firstLine }
  geometryCache.set(size, result)
  return result
}

/**
 * The reply that keeps `color`'s virtual connection after the opponent played
 * `last`, or -1: the other carrier of an intruded bridge, or the other cell of
 * an intruded edge template.
 */
function saveReply(board: Int8Array, color: number, last: number, geo: Geometry, random: () => number, edges = true): number {
  const { neighbors } = geo
  const base = last * 6
  let found = -1
  let seen = 0
  for (let k = 0; k < 6; k++) {
    const a = neighbors[base + k]
    const between = neighbors[base + ((k + 1) % 6)]
    const b = neighbors[base + ((k + 2) % 6)]
    if (a >= 0 && b >= 0 && between >= 0 && board[a] === color && board[b] === color && board[between] === 0) {
      // Several broken bridges: pick one at random so playouts stay varied.
      if (random() * ++seen < 1) found = between
    }
  }
  if (found >= 0 || !edges) return found
  const pairs = geo.edgePairs[color as 1 | 2]
  for (let slot = 0; slot < 2; slot++) {
    const s = pairs[last * 4 + slot * 2]
    const e = pairs[last * 4 + slot * 2 + 1]
    if (s >= 0 && board[s] === color && board[e] === 0) return e
  }
  return -1
}

class Node {
  readonly moves: Int16Array
  readonly n: Float64Array
  readonly w: Float64Array
  readonly rn: Float64Array
  readonly rw: Float64Array
  readonly children: Array<Node | null>

  constructor(board: Int8Array, readonly color: number, last: number, geo: Geometry | null, random: () => number) {
    let count = 0
    for (let i = 0; i < board.length; i++) if (board[i] === 0) count++
    this.moves = new Int16Array(count)
    for (let i = 0, j = 0; i < board.length; i++) if (board[i] === 0) this.moves[j++] = i
    this.n = new Float64Array(count)
    this.w = new Float64Array(count)
    this.rn = new Float64Array(count)
    this.rw = new Float64Array(count)
    this.children = new Array(count).fill(null)
    if (geo) this.addPriors(board, last, geo, random)
  }

  private addPriors(board: Int8Array, last: number, geo: Geometry, random: () => number): void {
    const { neighbors, bridges, firstLine } = geo
    const mine = this.color
    const save = last >= 0 ? saveReply(board, mine, last, geo, random) : -1
    for (let i = 0; i < this.moves.length; i++) {
      const cell = this.moves[i]
      let prior: { value: number; weight: number } | null = null
      if (cell === save) {
        prior = PRIOR.save
      } else {
        let bridge = false
        for (let k = 0; k < 6 && !bridge; k++) {
          const at = cell * 18 + k * 3
          const partner = bridges[at]
          bridge = partner >= 0 && board[partner] === mine && board[bridges[at + 1]] === 0 && board[bridges[at + 2]] === 0
        }
        let own = 0
        let theirs = 0
        for (let k = 0; k < 6; k++) {
          const n = neighbors[cell * 6 + k]
          if (n < 0) continue
          if (board[n] === mine) own++
          else if (board[n] !== 0) theirs++
        }
        if (bridge) prior = PRIOR.bridge
        else if (firstLine[cell] && own + theirs === 0) prior = PRIOR.firstLine
        else if (theirs > 0 && own > 0) prior = PRIOR.contact
      }
      if (prior) {
        this.rn[i] = prior.weight
        this.rw[i] = prior.value * prior.weight
      }
    }
  }

  /** No exploration term: with RAVE and priors, plain greedy selection searches best in Hex. */
  select(): number {
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
        value = (1 - beta) * (this.w[i] / n) + beta * rave
      }
      if (value > bestScore) {
        bestScore = value
        best = i
      }
    }
    return best
  }
}

/** Reusable buffers for playouts and the end-of-playout connection check. */
class Scratch {
  readonly empties: Int16Array
  readonly position: Int16Array
  readonly stack: Int16Array
  readonly seen: Int32Array
  stamp = 0

  constructor(cells: number) {
    this.empties = new Int16Array(cells)
    this.position = new Int16Array(cells)
    this.stack = new Int16Array(cells)
    this.seen = new Int32Array(cells)
  }
}

/** Fills the board at random from `color` to move. Mutates `board`. */
function playout(board: Int8Array, color: number, last: number, geo: Geometry, knowledge: boolean, scratch: Scratch, random: () => number): void {
  const { empties, position } = scratch
  let count = 0
  for (let i = 0; i < geo.cells; i++) {
    if (board[i] === 0) {
      position[i] = count
      empties[count++] = i
    } else {
      position[i] = -1
    }
  }
  while (count > 0) {
    let move = last >= 0 ? saveReply(board, color, last, geo, random, knowledge) : -1
    if (move < 0) move = empties[Math.floor(random() * count)]
    const at = position[move]
    const moved = empties[--count]
    empties[at] = moved
    position[moved] = at
    position[move] = -1
    board[move] = color
    last = move
    color = 3 - color
  }
}

/** On a full board exactly one side is connected: is it Red (top to bottom)? */
function redConnects(board: Int8Array, geo: Geometry, scratch: Scratch): boolean {
  const { size, neighbors } = geo
  const { stack, seen } = scratch
  const stamp = ++scratch.stamp
  let top = 0
  for (let c = 0; c < size; c++) {
    if (board[c] === 1) {
      seen[c] = stamp
      stack[top++] = c
    }
  }
  const lastRow = size * (size - 1)
  while (top > 0) {
    const cell = stack[--top]
    if (cell >= lastRow) return true
    for (let k = 0; k < 6; k++) {
      const n = neighbors[cell * 6 + k]
      if (n >= 0 && board[n] === 1 && seen[n] !== stamp) {
        seen[n] = stamp
        stack[top++] = n
      }
    }
  }
  return false
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

/** Steps between two cells on the hex grid. */
function hexDistance(a: number, b: number, size: number): number {
  const dr = Math.floor(a / size) - Math.floor(b / size)
  const dc = (a % size) - (b % size)
  return Math.max(Math.abs(dr), Math.abs(dc), Math.abs(dr + dc))
}

/**
 * Should Blue swap Red's opening stone? Only Hard does, and only for a strong
 * opening close to the center (2 steps on 9×9 and 11×11, 3 on 13×13): a casual
 * player's first stone should stay theirs on Easy and Medium.
 */
export function shouldSwap(state: GameState, level: BotLevel): boolean {
  if (level !== 'hard' || !canSwap(state)) return false
  const first = state.moves[0] as number
  const center = Math.floor(state.size / 2) * state.size + Math.floor(state.size / 2)
  return hexDistance(first, center, state.size) <= Math.floor((state.size - 1) / 4)
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
  if (level.tactics) {
    const win = winningMove(state, player)
    if (win >= 0) return { move: win, iterations: 0, winRate: 1 }
    const threat = winningMove(state, other(player))
    if (threat >= 0) return { move: threat, iterations: 0, winRate: 0.5 }
  }

  const timeMs = options.timeMs ?? level.timeMs
  const maxIterations = options.maxIterations ?? level.maxIterations
  const geo = geometry(size)
  const knowledge = level.knowledge
  const priors = knowledge ? geo : null
  const scratch = new Scratch(geo.cells)
  const rootBoard = Int8Array.from(state.board)
  const rootColor = PLAYER_CELL[player]
  const lastCell = state.lastCell ?? -1
  const root = new Node(rootBoard, rootColor, lastCell, priors, random)
  const board = new Int8Array(rootBoard.length)
  const path: Array<[Node, number]> = []
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
        if (node.n[index] > 0) node.children[index] = new Node(board, color, move, priors, random)
        break
      }
      node = child
    }
    playout(board, color, last, geo, knowledge, scratch, random)
    const winner = redConnects(board, geo, scratch) ? 1 : 2
    for (const [visited, index] of path) {
      const result = winner === visited.color ? 1 : 0
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
    // Sample in proportion to visits, so weaker moves get played now and then.
    let sum = 0
    for (let i = 0; i < root.n.length; i++) sum += root.n[i] ** (1 / level.temperature)
    let target = random() * sum
    for (let i = 0; i < root.n.length; i++) {
      target -= root.n[i] ** (1 / level.temperature)
      if (target <= 0) {
        pick = i
        break
      }
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

/** Exposed for tests. */
export const internals = { geometry, saveReply }
