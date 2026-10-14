import { useEffect, useRef, useState, type FormEvent } from 'react'
import { canSwap, newGame, other, type BoardSize, type Player } from '../../shared/hex'
import { normalizeRoomCode, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, type CreateRoomRequest, type CreateRoomResponse } from '../../shared/protocol'
import { Board } from '../components/Board'
import { Field, PrimaryButton, SecondaryButton } from '../components/Dialog'
import { GameScreen, Notice, NoticeButton } from '../components/GameScreen'
import { Hud, IconButton, LinkIcon, PillButton, PlayerTag, Result, SwapIcon, UndoIcon } from '../components/Hud'
import { useGameMenu } from '../components/Menu'
import { SizePicker, SwapToggle } from '../components/NewGameDialog'
import { showToast } from '../components/Toast'
import { track } from '../lib/analytics'
import { playerId } from '../lib/playerId'
import { navigate } from '../lib/router'
import { playStone, playWin } from '../lib/sound'
import { load, save } from '../lib/storage'
import { useOnlineRoom } from '../lib/useOnlineRoom'

const LAST_ROOM_KEY = 'hex:last-room'
const ONLINE_SETTINGS_KEY = 'hex:online-settings'

const inviteUrl = (code: string) => `${location.origin}/r/${code}`

async function shareInvite(code: string): Promise<void> {
  const url = inviteUrl(code)
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'Play Hex with me', text: `Join my game of Hex (code ${code})`, url })
      track('invite-shared')
      return
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    showToast('Invite link copied')
  } catch {
    showToast(url)
  }
  track('invite-copied')
}

export function OnlineGame({ code }: { code: string | null }) {
  if (!code) return <Lobby />
  if (!ROOM_CODE_PATTERN.test(code)) return <Missing code={code} />
  return <Room key={code} code={code} />
}

function Lobby() {
  const [settings, setSettings] = useState(() => load<{ size: BoardSize; swapRule: boolean }>(ONLINE_SETTINGS_KEY, { size: 11, swapRule: true }))
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const lastRoom = load<string | null>(LAST_ROOM_KEY, null)

  const create = async () => {
    setBusy(true)
    save(ONLINE_SETTINGS_KEY, settings)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, playerId: playerId() } satisfies CreateRoomRequest)
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Could not create a game')
      const { code } = (await res.json()) as CreateRoomResponse
      track('online-created', { size: settings.size, swap: settings.swapRule })
      navigate({ mode: 'online', code })
    } catch (error) {
      showToast((error as Error).message || 'Could not create a game')
      setBusy(false)
    }
  }

  const join = (event: FormEvent) => {
    event.preventDefault()
    const code = normalizeRoomCode(joinCode.includes('/') ? joinCode.split('/').pop()! : joinCode)
    if (!ROOM_CODE_PATTERN.test(code)) return showToast(`Codes are ${ROOM_CODE_LENGTH} letters or digits`)
    navigate({ mode: 'online', code })
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-3 pb-safe">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Play a friend online</h1>
        <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">Start a game, send the link, and play live on two devices.</p>
        <div className="mt-5">
          <Field label="Board size">
            <SizePicker value={settings.size} onChange={size => setSettings(current => ({ ...current, size }))} />
          </Field>
          <div className="mt-3">
            <SwapToggle value={settings.swapRule} onChange={swapRule => setSettings(current => ({ ...current, swapRule }))} />
          </div>
        </div>
        <PrimaryButton className="mt-5 w-full" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create game'}
        </PrimaryButton>
        <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">You play Red and move first.</p>

        <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          or join with a code
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <form onSubmit={join} className="flex gap-2">
          <input
            value={joinCode}
            onChange={event => setJoinCode(event.target.value)}
            placeholder="ABCDE"
            aria-label="Game code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="min-h-11 min-w-0 flex-1 rounded-full bg-neutral-100 px-4 text-base uppercase tracking-[0.2em] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-neutral-600"
          />
          <SecondaryButton type="submit">Join</SecondaryButton>
        </form>
        {lastRoom && ROOM_CODE_PATTERN.test(lastRoom) && (
          <button type="button" onClick={() => navigate({ mode: 'online', code: lastRoom })} className="mt-4 w-full text-center text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100">
            Back to your last game ({lastRoom})
          </button>
        )}
      </section>
    </main>
  )
}

function Missing({ code }: { code: string }) {
  useEffect(() => {
    if (load<string | null>(LAST_ROOM_KEY, null) === code) save(LAST_ROOM_KEY, null)
  }, [code])
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-3 pb-safe">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-base font-semibold">Game not found</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">There’s no game with the code {code}. It may have expired.</p>
        <PrimaryButton className="mt-5 w-full" onClick={() => navigate({ mode: 'online', code: null })}>
          Start a new game
        </PrimaryButton>
      </section>
    </main>
  )
}

function Room({ code }: { code: string }) {
  const { connection, you, room, game, missing, lastError, move, send } = useOnlineRoom(code)

  useEffect(() => save(LAST_ROOM_KEY, code), [code])

  useEffect(() => {
    if (lastError && lastError.code !== 'stale') showToast(lastError.message)
  }, [lastError])

  // Sounds for every new stone, and once per finished game.
  const seenPosition = useRef<string | null>(null)
  const seenWinner = useRef<string | null>(null)
  useEffect(() => {
    if (!game || !room) return
    const position = `${room.round}:${game.moves.length}`
    const winner = game.winner ? `${room.round}:${game.winner}` : ''
    const firstLook = seenPosition.current === null
    if (!firstLook && position !== seenPosition.current && game.moves.length > 0) playStone()
    if (!firstLook && winner && winner !== seenWinner.current) {
      playWin()
      track('game-won', { mode: 'online', size: game.size, won: game.winner === you })
    }
    seenPosition.current = position
    seenWinner.current = winner
  }, [game, room, you])

  const seat: Player | null = you === 'red' || you === 'blue' ? you : null
  const opponent = seat ? other(seat) : null
  const opponentHere = !!(room && opponent && room.players[opponent].taken)
  const myTurn = !!(game && seat && !game.winner && game.toMove === seat && opponentHere && connection === 'open')
  const myMoveCount = game && seat ? game.moves.filter((_, index) => (index % 2 === 0 ? 'red' : 'blue') === seat).length : 0

  useGameMenu([
    { label: 'Copy invite link', onSelect: () => void shareInvite(code) },
    { label: 'Ask to undo', onSelect: () => send({ t: 'undo' }), disabled: !seat || myMoveCount === 0 || room?.undoRequest === seat },
    { label: 'New online game', onSelect: () => navigate({ mode: 'online', code: null }) }
  ])

  if (missing) return <Missing code={code} />

  const shown = game ?? newGame({ size: 11, swapRule: true })
  const name = (player: Player) => (seat ? (player === seat ? 'You' : 'Friend') : player === 'red' ? 'Red' : 'Blue')
  const resultText = game?.winner ? (seat ? (game.winner === seat ? 'You win!' : 'Your friend wins') : `${name(game.winner)} wins`) : ''
  const rematchAsked = !!(room && seat && room.rematch.includes(seat))
  const opponentRematch = !!(room && opponent && room.rematch.includes(opponent))

  const hud = (
    <Hud
      actions={
        <>
          {myTurn && game && canSwap(game) && (
            <PillButton tone="light" onClick={() => move('swap')} title="Take Red’s first stone (swap rule)">
              <SwapIcon />
              Swap
            </PillButton>
          )}
          {game?.winner && seat && (
            <PillButton onClick={() => send({ t: 'rematch' })} disabled={rematchAsked} className="disabled:opacity-50">
              {rematchAsked ? 'Waiting…' : opponentRematch ? 'Accept rematch' : 'Rematch'}
            </PillButton>
          )}
          {seat && (
            <IconButton label="Ask to undo" onClick={() => send({ t: 'undo' })} disabled={myMoveCount === 0 || room?.undoRequest === seat}>
              <UndoIcon />
            </IconButton>
          )}
          <IconButton label="Invite link" onClick={() => void shareInvite(code)}>
            <LinkIcon />
          </IconButton>
        </>
      }
    >
      {!room || !game ? (
        <span className="pl-1 text-sm text-neutral-500">Connecting…</span>
      ) : game.winner ? (
        <Result winner={game.winner} text={resultText} />
      ) : seat ? (
        <>
          <PlayerTag player={seat} name="You" active={game.toMove === seat} />
          <PlayerTag player={opponent!} name="Friend" active={game.toMove === opponent} online={room.players[opponent!].taken ? room.players[opponent!].online : undefined} />
        </>
      ) : (
        <>
          <PlayerTag player="red" name="Red" active={game.toMove === 'red'} online={room.players.red.online} />
          <PlayerTag player="blue" name="Blue" active={game.toMove === 'blue'} online={room.players.blue.online} />
          <span className="truncate pl-1 text-xs text-neutral-500">Watching</span>
        </>
      )}
    </Hud>
  )

  let notice: React.ReactNode = null
  if (connection !== 'open') {
    notice = <Notice><span>{connection === 'connecting' ? 'Connecting…' : 'Connection lost. Reconnecting…'}</span></Notice>
  } else if (room && seat && opponent && !room.players[opponent].taken) {
    notice = (
      <Notice>
        <span>
          Waiting for a friend · code <strong className="font-semibold tracking-wider">{code}</strong>
        </span>
        <NoticeButton primary onClick={() => void shareInvite(code)}>Share link</NoticeButton>
      </Notice>
    )
  } else if (room && seat && opponent && room.undoRequest === opponent) {
    notice = (
      <Notice>
        <span>Your friend asks to take back a move.</span>
        <span className="flex gap-1">
          <NoticeButton onClick={() => send({ t: 'undo-decline' })}>Decline</NoticeButton>
          <NoticeButton primary onClick={() => send({ t: 'undo' })}>Allow</NoticeButton>
        </span>
      </Notice>
    )
  } else if (room && seat && room.undoRequest === seat) {
    notice = <Notice><span>Asked your friend to undo…</span></Notice>
  } else if (game?.winner && opponentRematch && !rematchAsked) {
    notice = <Notice><span>Your friend wants a rematch. Colors switch, so Red moves first.</span></Notice>
  } else if (room && opponent && room.players[opponent].taken && !room.players[opponent].online && !game?.winner) {
    notice = <Notice><span>Your friend is offline. They can come back with the same link.</span></Notice>
  } else if (myTurn && game && canSwap(game)) {
    notice = <Notice><span>You may <strong className="font-medium">swap</strong> to take Red’s stone, or just play.</span></Notice>
  }

  return (
    <GameScreen hud={hud} notice={notice}>
      <Board
        size={shown.size}
        board={shown.board}
        lastCell={shown.lastCell}
        winningPath={shown.winningPath}
        turn={myTurn ? seat : null}
        onPlay={cell => move(cell)}
        label={`Hex board, ${shown.size} by ${shown.size}. ${game?.winner ? resultText : myTurn ? 'Your move.' : 'Waiting for your friend.'}`}
      />
    </GameScreen>
  )
}
