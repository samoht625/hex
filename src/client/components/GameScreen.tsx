import type { ReactNode } from 'react'

/** HUD on top, the board filling the rest of the screen, and an optional notice under it. */
export function GameScreen({ hud, children, notice }: { hud: ReactNode; children: ReactNode; notice?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 pb-safe md:px-6">
      {hud}
      <div className="relative min-h-0 flex-1 py-1">{children}</div>
      {notice && <div className="flex shrink-0 justify-center pt-2">{notice}</div>}
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
