import type { Mode } from '../lib/router'
import { setSoundEnabled, useSoundEnabled } from '../lib/sound'
import { openHowToPlay } from './HowToPlay'
import { MenuButton } from './Menu'

interface HeaderProps {
  mode: Mode
  onSwitchMode: (mode: Mode) => void
}

/** Two little hexagons, one per player. */
export function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 16" className="h-4 w-[30px]">
      <polygon points="7,1 13.06,4.5 13.06,11.5 7,15 0.94,11.5 0.94,4.5" fill="var(--red)" />
      <polygon points="21,1 27.06,4.5 27.06,11.5 21,15 14.94,11.5 14.94,4.5" fill="var(--blue)" />
    </svg>
  )
}

export function Header({ mode, onSwitchMode }: HeaderProps) {
  const sound = useSoundEnabled()

  const segment = (value: Mode, label: string) => {
    const active = mode === value
    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={active}
        className={`min-h-8 whitespace-nowrap rounded-full px-1.5 text-[13px] font-medium transition-colors min-[360px]:px-2 min-[360px]:text-sm sm:px-3 ${
          active
            ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <header className="pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between gap-1 px-3 md:px-6 lg:px-10">
        <a href="/" onClick={event => { event.preventDefault(); onSwitchMode('computer') }} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg" aria-label="Hex home">
          <span className="text-base font-semibold tracking-tight max-[419px]:sr-only">Hex</span>
          <Logo />
        </a>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <nav aria-label="Game mode" className="flex items-center rounded-full bg-neutral-200/70 p-1 dark:bg-neutral-800">
            {segment('computer', 'Computer')}
            {segment('local', 'Pass & play')}
            {segment('online', 'Online')}
          </nav>
          <MenuButton
            appItems={[
              { label: 'How to play', onSelect: openHowToPlay },
              { label: 'Sound', onSelect: () => setSoundEnabled(!sound), checked: sound }
            ]}
          />
        </div>
      </div>
    </header>
  )
}
