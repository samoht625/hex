import { useCallback, useEffect, useRef, useState } from 'react'
import { toBotLevel, type BotLevel } from '../../shared/bot'
import { canSwap, fromRecord, newGame, play, toRecord, undo, type GameRecord, type GameState, type Move, type Player } from '../../shared/hex'
import { Board } from '../components/Board'
import { GameScreen, Notice, NoticeButton, StatusLine } from '../components/GameScreen'
import { Hud, IconButton, LevelPicker, NewGameIcon, PillButton, PlayerTag, Result, Stone, ThinkingDots, UndoIcon } from '../components/Hud'
import { useGameMenu } from '../components/Menu'
import { DEFAULT_SETTINGS, NewGameDialog, type GameSettings } from '../components/NewGameDialog'
import { track } from '../lib/analytics'
import { playStone, playWin } from '../lib/sound'
import { load, save } from '../lib/storage'
import { useBot } from '../lib/useBot'

interface Saved {
  settings: GameSettings
  game: GameRecord
}

function restore(key: string): { settings: GameSettings; game: GameState } {
  const saved = load<Partial<Saved> | null>(key, null)
  const settings = { ...DEFAULT_SETTINGS, ...saved?.settings }
  settings.level = toBotLevel(settings.level)
  const game = (saved?.game && fromRecord(saved.game)) || newGame(settings)
  return { settings, game }
}

/** Pass-and-play on one device, or a game against the computer. */
export function LocalGame({ vsComputer }: { vsComputer: boolean }) {
  const storageKey = vsComputer ? 'hex:computer' : 'hex:local'
  const [initial] = useState(() => restore(storageKey))
  const [settings, setSettings] = useState(initial.settings)
  const [game, setGame] = useState(initial.game)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => save(storageKey, { settings, game: toRecord(game) } satisfies Saved), [storageKey, settings, game])

  const human: Player | null = vsComputer ? settings.humanColor : null
  const botColor: Player | null = human ? (human === 'red' ? 'blue' : 'red') : null
  const botTurn = botColor !== null && game.toMove === botColor && !game.winner

  const apply = useCallback((move: Move, ply?: number) => {
    setGame(current => {
      if (ply !== undefined && current.moves.length !== ply) return current
      try {
        return play(current, move)
      } catch {
        return current
      }
    })
    playStone()
  }, [])

  useBot(game, botTurn, settings.level, apply)

  // Celebrate once per finished game.
  const announced = useRef(game.winner !== null)
  useEffect(() => {
    if (game.winner && !announced.current) {
      announced.current = true
      playWin()
      track('game-won', { mode: vsComputer ? 'computer' : 'local', winner: game.winner, size: game.size, ...(vsComputer ? { level: settings.level, human: game.winner === human } : {}) })
    } else if (!game.winner) announced.current = false
  }, [game.winner, game.size, vsComputer, settings.level, human])

  const humanCanMove = !game.winner && (human === null || game.toMove === human)
  const humanMoves = human === null ? game.moves.length : game.moves.filter((_, index) => (index % 2 === 0 ? 'red' : 'blue') === human).length
  const canUndo = humanMoves > 0

  const takeBack = () => {
    if (!canUndo) return
    setGame(current => {
      let next = undo(current)
      if (human) while (next.moves.length > 0 && next.toMove !== human) next = undo(next)
      return next
    })
  }

  const start = (next: GameSettings) => {
    setSettings(next)
    setGame(newGame(next))
    setDialogOpen(false)
    track('new-game', { mode: vsComputer ? 'computer' : 'local', size: next.size, swap: next.swapRule, ...(vsComputer ? { level: next.level, color: next.humanColor } : {}) })
  }

  const changeLevel = (level: BotLevel) => {
    if (level === settings.level) return
    setSettings(current => ({ ...current, level }))
    track('level', { level })
  }

  useGameMenu([
    { label: 'New game…', onSelect: () => setDialogOpen(true) },
    { label: 'Undo', onSelect: takeBack, disabled: !canUndo }
  ])

  const swapAvailable = canSwap(game) && humanCanMove
  const computerSwapped = botColor === 'blue' && game.moves.length === 2 && game.moves[1] === 'swap'
  const resultText = game.winner ? (human === null ? `${game.winner === 'red' ? 'Red' : 'Blue'} wins` : game.winner === human ? 'You win!' : 'The computer wins') : ''

  const hud = (
    <Hud
      actions={
        <>
          <IconButton label="Undo" onClick={takeBack} disabled={!canUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton label="New game" onClick={() => setDialogOpen(true)}>
            <NewGameIcon />
          </IconButton>
        </>
      }
    >
      {vsComputer ? (
        <LevelPicker value={settings.level} onChange={changeLevel} />
      ) : (
        <>
          <PlayerTag player="red" name="Red" active={!game.winner && game.toMove === 'red'} />
          <PlayerTag player="blue" name="Blue" active={!game.winner && game.toMove === 'blue'} />
        </>
      )}
    </Hud>
  )

  let status: React.ReactNode = null
  if (game.winner) {
    status = (
      <Result winner={game.winner} text={resultText}>
        <PillButton onClick={() => setDialogOpen(true)}>New game</PillButton>
      </Result>
    )
  } else if (swapAvailable) {
    status = (
      <Notice>
        <span title="Swap rule: take over Red’s first stone">{human ? 'You' : 'Blue'} may swap, or just play.</span>
        <NoticeButton primary onClick={() => apply('swap')}>
          Swap
        </NoticeButton>
      </Notice>
    )
  } else if (computerSwapped) {
    status = (
      <Notice>
        <span className="flex items-center gap-2" title="Swap rule: the computer took your first stone, mirrored across the board">
          <Stone player="blue" />
          Computer swapped · Your move
        </span>
      </Notice>
    )
  } else if (human && botColor) {
    if (humanMoves === 0) {
      status = <ColorChoice value={human} onChange={humanColor => start({ ...settings, humanColor })} />
    } else if (botTurn) {
      status = (
        <StatusLine>
          <Stone player={botColor} />
          Computer is thinking
          <ThinkingDots />
        </StatusLine>
      )
    } else {
      status = (
        <StatusLine>
          <Stone player={human} />
          Your move
        </StatusLine>
      )
    }
  }

  return (
    <>
      <GameScreen size={game.size} hud={hud} status={status}>
        <Board
          size={game.size}
          board={game.board}
          lastCell={game.lastCell}
          winningPath={game.winningPath}
          turn={humanCanMove ? game.toMove : null}
          onPlay={cell => apply(cell)}
          label={`Hex board, ${game.size} by ${game.size}. ${game.winner ? resultText : human === null ? `${game.toMove === 'red' ? 'Red' : 'Blue'} to move.` : humanCanMove ? 'Your move.' : 'The computer is thinking.'}`}
        />
      </GameScreen>
      <NewGameDialog open={dialogOpen} onClose={() => setDialogOpen(false)} initial={settings} vsComputer={vsComputer} onStart={start} />
    </>
  )
}

/** Before your first stone: pick a side. Red moves first. */
function ColorChoice({ value, onChange }: { value: Player; onChange: (color: Player) => void }) {
  const option = (color: Player, label: string) => {
    const active = color === value
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => !active && onChange(color)}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
          active ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
        }`}
      >
        <Stone player={color} />
        {label}
      </button>
    )
  }
  return (
    <div className="flex min-h-11 items-center gap-2.5 text-sm text-neutral-500 dark:text-neutral-400">
      <span>You play</span>
      <div role="radiogroup" aria-label="Your color" className="grid grid-cols-2 rounded-full bg-neutral-200/70 p-1 dark:bg-neutral-800">
        {option('red', 'Red · first')}
        {option('blue', 'Blue · second')}
      </div>
    </div>
  )
}
