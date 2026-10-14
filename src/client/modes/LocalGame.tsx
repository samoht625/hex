import { useCallback, useEffect, useRef, useState } from 'react'
import { canSwap, fromRecord, newGame, play, toRecord, undo, type GameRecord, type GameState, type Move, type Player } from '../../shared/hex'
import { Board } from '../components/Board'
import { GameScreen, Notice } from '../components/GameScreen'
import { Hud, IconButton, NewGameIcon, PillButton, PlayerTag, Result, SwapIcon, UndoIcon } from '../components/Hud'
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

const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const

function restore(key: string): { settings: GameSettings; game: GameState } {
  const saved = load<Partial<Saved> | null>(key, null)
  const settings = { ...DEFAULT_SETTINGS, ...saved?.settings }
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

  const thinking = useBot(game, botTurn, settings.level, apply)

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

  useGameMenu([
    { label: 'New game…', onSelect: () => setDialogOpen(true) },
    { label: 'Undo', onSelect: takeBack, disabled: !canUndo }
  ])

  const swapAvailable = canSwap(game) && humanCanMove
  const name = (player: Player) => (human === null ? (player === 'red' ? 'Red' : 'Blue') : player === human ? 'You' : `Computer · ${LEVEL_NAMES[settings.level]}`)
  const resultText = game.winner ? (human === null ? `${name(game.winner)} wins` : game.winner === human ? 'You win!' : 'The computer wins') : ''

  const hud = (
    <Hud
      actions={
        <>
          {swapAvailable && (
            <PillButton tone="light" onClick={() => apply('swap')} title="Take Red’s first stone (swap rule)">
              <SwapIcon />
              Swap
            </PillButton>
          )}
          {game.winner && <PillButton onClick={() => setDialogOpen(true)}>New game</PillButton>}
          <IconButton label="Undo" onClick={takeBack} disabled={!canUndo}>
            <UndoIcon />
          </IconButton>
          {!game.winner && (
            <IconButton label="New game" onClick={() => setDialogOpen(true)}>
              <NewGameIcon />
            </IconButton>
          )}
        </>
      }
    >
      {game.winner ? (
        <Result winner={game.winner} text={resultText} />
      ) : (
        <>
          <PlayerTag player="red" name={name('red')} active={game.toMove === 'red'} thinking={thinking && botColor === 'red'} />
          <PlayerTag player="blue" name={name('blue')} active={game.toMove === 'blue'} thinking={thinking && botColor === 'blue'} />
        </>
      )}
    </Hud>
  )

  const notice = swapAvailable && game.moves.length === 1 ? (
    <Notice>
      <span>
        {human ? 'You' : 'Blue'} may <strong className="font-medium">swap</strong> to take Red’s stone, or just play.
      </span>
    </Notice>
  ) : null

  return (
    <>
      <GameScreen hud={hud} notice={notice}>
        <Board
          size={game.size}
          board={game.board}
          lastCell={game.lastCell}
          winningPath={game.winningPath}
          turn={humanCanMove ? game.toMove : null}
          onPlay={cell => apply(cell)}
          label={`Hex board, ${game.size} by ${game.size}. ${game.winner ? resultText : `${name(game.toMove)} to move.`}`}
        />
      </GameScreen>
      <NewGameDialog open={dialogOpen} onClose={() => setDialogOpen(false)} initial={settings} vsComputer={vsComputer} onStart={start} />
    </>
  )
}
