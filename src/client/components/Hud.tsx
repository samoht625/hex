import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { BOT_LEVEL_NAMES, BOT_LEVELS, type BotLevel } from '../../shared/bot'
import type { Player } from '../../shared/hex'

/** The fixed-height strip above the board. Keep its contents the same width as the game goes on. */
export function Hud({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function Stone({ player, className = 'h-3 w-3' }: { player: Player; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 14 16" className={`shrink-0 ${className}`}>
      <polygon points="7,0.5 13.5,4.25 13.5,11.75 7,15.5 0.5,11.75 0.5,4.25" fill={`var(--${player})`} />
    </svg>
  )
}

export function ThinkingDots() {
  return (
    <span aria-hidden="true" className="ml-0.5 inline-flex gap-0.5">
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
    </span>
  )
}

interface PlayerTagProps {
  player: Player
  name: string
  active: boolean
  /** false shows a hollow "offline" marker. */
  online?: boolean
}

/** A player's color and name; the one to move is raised like the active mode tab (same weight, so no reflow). */
export function PlayerTag({ player, name, active, online }: PlayerTagProps) {
  return (
    <span
      data-player-tag={player}
      data-active={active}
      className={`flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'
      }`}
    >
      <Stone player={player} />
      <span className="truncate">{name}</span>
      {online === false && (
        <span title="Offline" className="h-2 w-2 shrink-0 rounded-full border border-neutral-400 dark:border-neutral-500">
          <span className="sr-only">(offline)</span>
        </span>
      )}
      {active && <span className="sr-only">(to move)</span>}
    </span>
  )
}

/** The result under the board when the game ends, with its follow-up action. */
export function Result({ winner, text, children }: { winner: Player; text: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex min-h-11 items-center gap-3">
      <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Stone player={winner} className="h-4 w-4" />
        {text}
      </span>
      {children}
    </div>
  )
}

/** Easy / Medium / Hard, always on screen against the computer. */
export function LevelPicker({ value, onChange }: { value: BotLevel; onChange: (level: BotLevel) => void }) {
  return (
    <div role="radiogroup" aria-label="Computer strength" className="grid grid-cols-3 rounded-full bg-neutral-200/70 p-1 dark:bg-neutral-800">
      {BOT_LEVELS.map(level => {
        const active = level === value
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={active}
            data-level={level}
            onClick={() => onChange(level)}
            className={`h-8 rounded-full px-3 text-sm font-medium transition-colors sm:px-4 ${
              active ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            {BOT_LEVEL_NAMES[level]}
          </button>
        )
      })}
    </div>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A small pill button in the HUD, for the one action that matters right now. */
export function PillButton({ children, tone = 'dark', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'dark' | 'light' }) {
  return (
    <button
      type="button"
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 ${
        tone === 'dark'
          ? 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
          : 'bg-white text-neutral-800 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

const icon = (path: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    {path}
  </svg>
)

export const UndoIcon = () => icon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>)
export const NewGameIcon = () => icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)
export const SwapIcon = () => icon(<><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></>)
export const LinkIcon = () => icon(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>)
