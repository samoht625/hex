/**
 * Board geometry in SVG units, where a hex has radius 1.
 *
 * The classic layout is the familiar leaning rhombus: each row shifted half a
 * cell to the right. On tall screens the same board is turned 60° so its long
 * diagonal runs top to bottom; hexes keep their pointy tops (they are
 * symmetric under 60° turns) and the cells come out much larger on phones.
 */

const SQRT3 = Math.sqrt(3)
type Point = [number, number]

export type Orientation = 'classic' | 'tall'

export interface BoardLayout {
  size: number
  orientation: Orientation
  /** Cell centers, already shifted into the view box. */
  centers: Point[]
  /** Points attribute for each cell's hexagon. */
  hexes: string[]
  /** Colored edge bands: [owner, points] (one triangle per side, meeting at the middle). */
  edges: Array<['red' | 'blue', string]>
  width: number
  height: number
}

const BORDER = 1.05
const HEX_VERTICES: Point[] = Array.from({ length: 6 }, (_, k) => {
  const angle = (Math.PI / 180) * (60 * k - 90)
  return [Math.cos(angle), Math.sin(angle)]
})

const fmt = (n: number) => Math.round(n * 1000) / 1000
const pointsAttr = (points: Point[]) => points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')

const cache = new Map<string, BoardLayout>()

export function boardLayout(size: number, orientation: Orientation): BoardLayout {
  const key = `${size}:${orientation}`
  const cached = cache.get(key)
  if (cached) return cached

  const angle = orientation === 'tall' ? Math.PI / 3 : 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const place = (r: number, c: number): Point => {
    const x = SQRT3 * (c + r / 2)
    const y = 1.5 * r
    return [x * cos - y * sin, x * sin + y * cos]
  }

  const rawCenters: Point[] = []
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) rawCenters.push(place(r, c))

  const far = size - 1 + BORDER
  const corners: Point[] = [place(-BORDER, -BORDER), place(-BORDER, far), place(far, far), place(far, -BORDER)]
  const middle = place((size - 1) / 2, (size - 1) / 2)

  const xs = corners.map(p => p[0]).concat(rawCenters.map(p => p[0] - 1), rawCenters.map(p => p[0] + 1))
  const ys = corners.map(p => p[1]).concat(rawCenters.map(p => p[1] - 1), rawCenters.map(p => p[1] + 1))
  const pad = 0.15
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const width = Math.max(...xs) + pad - minX
  const height = Math.max(...ys) + pad - minY
  const shift = ([x, y]: Point): Point => [x - minX, y - minY]

  const centers = rawCenters.map(shift)
  const hexes = centers.map(([cx, cy]) => pointsAttr(HEX_VERTICES.map(([dx, dy]) => [cx + dx, cy + dy])))
  const [p, q, s, t] = corners.map(shift)
  const m = shift(middle)
  const edges: BoardLayout['edges'] = [
    ['red', pointsAttr([m, p, q])],
    ['blue', pointsAttr([m, q, s])],
    ['red', pointsAttr([m, s, t])],
    ['blue', pointsAttr([m, t, p])]
  ]

  const layout = { size, orientation, centers, hexes, edges, width, height }
  cache.set(key, layout)
  return layout
}

/** Picks the orientation that gives the biggest cells in a box of w × h pixels. */
export function bestOrientation(size: number, w: number, h: number): { layout: BoardLayout; scale: number } {
  const classic = boardLayout(size, 'classic')
  const tall = boardLayout(size, 'tall')
  const classicScale = Math.min(w / classic.width, h / classic.height)
  const tallScale = Math.min(w / tall.width, h / tall.height)
  // The classic picture is the one people know; only turn it when that clearly helps.
  return tallScale > classicScale * 1.12 ? { layout: tall, scale: tallScale } : { layout: classic, scale: classicScale }
}
