import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Renders as a switch. */
  checked?: boolean
}

type MenuContextValue = { items: MenuItem[]; setItems: (items: MenuItem[]) => void }
const MenuContext = createContext<MenuContextValue | null>(null)

export function GameMenuProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MenuItem[]>([])
  return <MenuContext.Provider value={{ items, setItems }}>{children}</MenuContext.Provider>
}

/** Puts the current game's actions (new game, undo…) at the top of the header menu. */
export function useGameMenu(items: MenuItem[]): void {
  const context = useContext(MenuContext)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const signature = items.map(item => `${item.label}|${item.disabled ? 1 : 0}|${item.checked ?? ''}`).join(';')
  const setItems = context?.setItems
  useEffect(() => {
    setItems?.(itemsRef.current.map((item, index) => ({ ...item, onSelect: () => itemsRef.current[index]?.onSelect() })))
  }, [setItems, signature])
  useEffect(() => () => setItems?.([]), [setItems])
}

const DotsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

/** The single "more" button in the header and its dropdown. */
export function MenuButton({ appItems }: { appItems: MenuItem[] }) {
  const context = useContext(MenuContext)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const gameItems = context?.items ?? []

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    rootRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const select = (item: MenuItem) => {
    setOpen(false)
    item.onSelect()
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  const itemClass =
    'flex min-h-10 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800'

  const renderItem = (item: MenuItem) => (
    <button
      key={item.label}
      type="button"
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      disabled={item.disabled}
      onClick={() => select(item)}
      className={itemClass}
    >
      <span>{item.label}</span>
      {item.checked !== undefined && <Switch on={item.checked} />}
    </button>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menu"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
          open ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' : 'text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800'
        }`}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu"
          onKeyDown={onMenuKeyDown}
          className="animate-menu-in absolute right-0 top-11 z-40 w-56 rounded-xl border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          {gameItems.map(renderItem)}
          {gameItems.length > 0 && <div role="separator" className="my-1 h-px bg-neutral-100 dark:bg-neutral-800" />}
          {appItems.map(renderItem)}
        </div>
      )}
    </div>
  )
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-block h-5 w-8 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
    </span>
  )
}
