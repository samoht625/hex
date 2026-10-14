import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { cellName, type Cell, type Player } from '../../shared/hex'
import { bestOrientation, boardLayout, type Orientation } from '../lib/geometry'

interface BoardProps {
  size: number
  board: Cell[]
  lastCell: number | null
  winningPath: number[]
  /** Whose stone a tap would place; null when the board is not accepting moves. */
  turn: Player | null
  onPlay?: (cell: number) => void
  /** Fixed orientation (e.g. for small illustrations); otherwise fits the container. */
  orientation?: Orientation
  label?: string
}

const STROKE = 0.075

export function Board({ size, board, lastCell, winningPath, turn, onPlay, orientation, label }: BoardProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [cursor, setCursor] = useState(() => Math.floor(size / 2) * size + Math.floor(size / 2))

  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return
    const measure = () => setBox({ w: element.clientWidth, h: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => setCursor(Math.floor(size / 2) * size + Math.floor(size / 2)), [size])

  const { layout, scale } = useMemo(() => {
    if (orientation) {
      const fixed = boardLayout(size, orientation)
      return { layout: fixed, scale: box ? Math.min(box.w / fixed.width, box.h / fixed.height) : 0 }
    }
    return bestOrientation(size, box?.w ?? 1, box?.h ?? 1)
  }, [size, box, orientation])

  const onPath = useMemo(() => new Set(winningPath), [winningPath])
  const won = winningPath.length > 0
  const interactive = turn !== null && !won && !!onPlay

  const tryPlay = (cell: number) => {
    if (interactive && board[cell] === 0) onPlay!(cell)
  }

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = (event.target as Element).closest('[data-cell]')
    if (target) tryPlay(Number(target.getAttribute('data-cell')))
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const r = Math.floor(cursor / size)
    const c = cursor % size
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[event.key]) {
      event.preventDefault()
      const [dr, dc] = moves[event.key]
      const nr = Math.min(size - 1, Math.max(0, r + dr))
      const nc = Math.min(size - 1, Math.max(0, c + dc))
      setCursor(nr * size + nc)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      tryPlay(cursor)
    }
  }

  const pathPoints = winningPath.map(cell => layout.centers[cell].map(v => Math.round(v * 1000) / 1000).join(',')).join(' ')
  const cursorName = cellName(cursor, size)
  const cursorState = board[cursor] === 1 ? 'red' : board[cursor] === 2 ? 'blue' : 'empty'

  return (
    <div ref={boxRef} className="relative flex h-full w-full items-center justify-center">
      {box && scale > 0 && (
        <svg
          className="hex-board block"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width * scale}
          height={layout.height * scale}
          role={onPlay ? 'application' : 'img'}
          aria-label={label ?? `Hex board, ${size} by ${size}`}
          aria-roledescription={onPlay ? 'game board' : undefined}
          tabIndex={onPlay ? 0 : undefined}
          data-interactive={interactive}
          data-turn={turn ?? undefined}
          data-won={won}
          data-orientation={layout.orientation}
          onClick={onClick}
          onKeyDown={onPlay ? onKeyDown : undefined}
        >
          {layout.edges.map(([owner, points], index) => (
            <polygon key={index} points={points} fill={owner === 'red' ? 'var(--red-edge)' : 'var(--blue-edge)'} stroke={owner === 'red' ? 'var(--red-edge)' : 'var(--blue-edge)'} strokeWidth={0.02} strokeLinejoin="round" />
          ))}
          <g stroke="var(--grid)" strokeWidth={STROKE} strokeLinejoin="round">
            {layout.hexes.map((points, cell) => (
              <polygon
                key={cell}
                points={points}
                className={`hex-cell${cell === lastCell ? ' stone-in' : ''}`}
                data-cell={cell}
                data-stone={board[cell]}
                data-path={onPath.has(cell) ? '' : undefined}
              />
            ))}
          </g>
          {won && (
            <polyline
              key={pathPoints}
              className="win-path"
              points={pathPoints}
              pathLength={1}
              fill="none"
              strokeWidth={0.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
              pointerEvents="none"
            />
          )}
          {lastCell !== null && board[lastCell] !== 0 && (
            <circle cx={layout.centers[lastCell][0]} cy={layout.centers[lastCell][1]} r={0.24} fill="#fff" opacity={0.92} pointerEvents="none" data-last-move="" />
          )}
          {onPlay && (
            <polygon className="hex-cursor" points={layout.hexes[cursor]} fill="none" stroke="currentColor" strokeWidth={0.14} pointerEvents="none" />
          )}
        </svg>
      )}
      {onPlay && (
        <span className="sr-only" aria-live="polite">
          {`Cursor on ${cursorName}, ${cursorState}`}
        </span>
      )}
    </div>
  )
}
