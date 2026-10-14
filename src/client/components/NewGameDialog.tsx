import { useEffect, useState } from 'react'
import { BOT_LEVEL_NAMES, BOT_LEVELS, type BotLevel } from '../../shared/bot'
import { SIZES, type BoardSize, type Player } from '../../shared/hex'
import { Dialog, Field, PrimaryButton, Segmented } from './Dialog'
import { Switch } from './Menu'

export interface GameSettings {
  size: BoardSize
  swapRule: boolean
  level: BotLevel
  /** The human's color against the computer. */
  humanColor: Player
}

export const DEFAULT_SETTINGS: GameSettings = { size: 11, swapRule: true, level: 'medium', humanColor: 'red' }

interface NewGameDialogProps {
  open: boolean
  onClose: () => void
  initial: GameSettings
  vsComputer?: boolean
  title?: string
  startLabel?: string
  onStart: (settings: GameSettings) => void
}

const LEVEL_HINTS: Record<BotLevel, string> = { easy: 'Good for learning', medium: 'A fair fight', hard: 'Thinks hard, plays sharp' }

export function SwapToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 text-left ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 dark:ring-neutral-700 dark:hover:bg-neutral-800"
    >
      <span>
        <span className="block text-sm font-medium">Swap rule</span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">Blue may take Red’s first stone</span>
      </span>
      <Switch on={value} />
    </button>
  )
}

export function SizePicker({ value, onChange }: { value: BoardSize; onChange: (value: BoardSize) => void }) {
  return <Segmented label="Board size" value={value} onChange={onChange} options={SIZES.map(size => ({ value: size, label: `${size}×${size}` }))} />
}

export function NewGameDialog({ open, onClose, initial, vsComputer = false, title = 'New game', startLabel = 'Start', onStart }: NewGameDialogProps) {
  const [settings, setSettings] = useState(initial)
  useEffect(() => {
    if (open) setSettings(initial)
  }, [open, initial])
  const update = (patch: Partial<GameSettings>) => setSettings(current => ({ ...current, ...patch }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={title}
      actions={
        <PrimaryButton className="w-full" onClick={() => onStart(settings)}>
          {startLabel}
        </PrimaryButton>
      }
    >
      <Field label="Board size" hint={settings.size === 11 ? 'Classic' : settings.size === 9 ? 'Quick' : 'Long'}>
        <SizePicker value={settings.size} onChange={size => update({ size })} />
      </Field>
      {vsComputer && (
        <>
          <Field label="Difficulty" hint={LEVEL_HINTS[settings.level]}>
            <Segmented label="Computer strength" value={settings.level} onChange={level => update({ level })} options={BOT_LEVELS.map(level => ({ value: level, label: BOT_LEVEL_NAMES[level] }))} />
          </Field>
          <Field label="You play" hint={settings.humanColor === 'red' ? 'You move first' : 'The computer moves first'}>
            <Segmented
              label="Your color"
              value={settings.humanColor}
              onChange={humanColor => update({ humanColor })}
              options={[
                { value: 'red', label: 'Red · first' },
                { value: 'blue', label: 'Blue · second' }
              ]}
            />
          </Field>
        </>
      )}
      <div className="mt-4">
        <SwapToggle value={settings.swapRule} onChange={swapRule => update({ swapRule })} />
      </div>
    </Dialog>
  )
}
