import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { boardLayout } from '../lib/geometry'

const HUD_HEIGHT = 48
const SLOT_HEIGHT = 60
const MAX_WIDTH = 1000

/**
 * The HUD, the board and a status slot under it, as one centered column.
 * The column's size depends only on the screen and the board size, never on
 * what the HUD or the slot show, so nothing moves while a game is played.
 */
export function GameScreen({ size, hud, children, status }: { size: number; hud: ReactNode; children: ReactNode; status?: ReactNode }) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const element = areaRef.current
    if (!element) return
    const measure = () => setArea(current => (current && current.w === element.clientWidth && current.h === element.clientHeight ? current : { w: element.clientWidth, h: element.clientHeight }))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const layout = boardLayout(size)
  const aspect = layout.width / layout.height
  const width = area ? Math.floor(Math.max(0, Math.min(area.w, MAX_WIDTH, (area.h - HUD_HEIGHT - SLOT_HEIGHT) * aspect))) : 0

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col px-1 pb-safe sm:px-4 md:px-6">
      <div ref={areaRef} className="flex min-h-0 flex-1 flex-col items-center">
        {/* Spare height goes 2:3 above and below, so the column sits a little above the middle. */}
        <div className="flex-[2]" />
        {width > 0 && (
          <div className="flex shrink-0 flex-col" style={{ width }}>
            <div data-hud="" className="shrink-0 px-2 sm:px-0" style={{ height: HUD_HEIGHT }}>
              {hud}
            </div>
            <div className="shrink-0" style={{ height: width / aspect }}>
              {children}
            </div>
            <div data-status-slot="" className="relative shrink-0" style={{ height: SLOT_HEIGHT }}>
              {status && <div className="absolute inset-x-0 top-2 flex justify-center px-2">{status}</div>}
            </div>
          </div>
        )}
        <div className="flex-[3]" />
      </div>
    </main>
  )
}

/** A calm rounded strip for transient information under the board. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="animate-menu-in flex min-h-11 max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-1.5 text-sm text-neutral-700 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-800">
      {children}
    </div>
  )
}

/** Plain status text under the board, e.g. whose move it is. */
export function StatusLine({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex min-h-11 items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
      {children}
    </div>
  )
}

export function NoticeButton({ children, onClick, primary = false }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-8 rounded-full px-3 text-sm font-medium transition-colors ${
        primary ? 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  )
}
