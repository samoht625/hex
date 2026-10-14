import { useEffect, useState } from 'react'
import type { Cell } from '../../shared/hex'
import { track } from '../lib/analytics'
import { Board } from './Board'
import { Dialog } from './Dialog'

const OPEN_EVENT = 'hex:how-to-play'

export function openHowToPlay(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

const parse = (rows: string[]): Cell[] => rows.join('').split('').map(ch => (ch === 'R' ? 1 : ch === 'B' ? 2 : 0))

// A red chain joining top and bottom on a 5×5 board.
const EXAMPLE = parse(['..R..', '.BR..', '.RB..', 'BR.B.', 'R.B..'])
const EXAMPLE_PATH = [2, 7, 11, 16, 20]
const SWAP_BEFORE = parse(['.....', '...R.', '.....', '.....', '.....'])
const SWAP_AFTER = parse(['.....', '.....', '.....', '.B...', '.....'])

function MiniBoard({ board, path = [], last = null }: { board: Cell[]; path?: number[]; last?: number | null }) {
  return (
    <div className="h-24 w-full">
      <Board size={5} board={board} winningPath={path} lastCell={last} turn={null} orientation="classic" label="Example board" />
    </div>
  )
}

export function HowToPlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      track('how-to-play')
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  return (
    <Dialog open={open} onClose={() => setOpen(false)} label="How to play">
      <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        <div className="mx-auto max-w-56">
          <MiniBoard board={EXAMPLE} path={EXAMPLE_PATH} />
        </div>
        <p className="mt-3 text-center font-medium text-neutral-900 dark:text-neutral-100">Connect your two sides of the board.</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-4">
          <li>Take turns placing one stone on any empty cell. Red moves first.</li>
          <li>
            <span className="font-medium text-[var(--red)]">Red</span> joins the two red edges, <span className="font-medium text-[var(--blue)]">Blue</span> the two blue edges, with an unbroken chain of their own stones. Corner cells count for both edges.
          </li>
          <li>Stones never move or get captured, and there are no draws: a full board always has a winner.</li>
        </ul>

        <h3 className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Swap rule</h3>
        <div className="mt-2 flex items-center gap-2">
          <MiniBoard board={SWAP_BEFORE} last={8} />
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <MiniBoard board={SWAP_AFTER} last={16} />
        </div>
        <p className="mt-2">
          Moving first is a big edge, so after Red’s first stone Blue may <span className="font-medium text-neutral-900 dark:text-neutral-100">swap</span> instead of
          playing: that stone becomes Blue’s, mirrored onto Blue’s side, and Red plays again. So Red’s best opening is one that is neither too strong nor too weak.
          You can turn the rule off when starting a new game.
        </p>

        <details className="mt-4 text-xs text-neutral-600 dark:text-neutral-400">
          <summary className="cursor-pointer text-center text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">Tips &amp; modes</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Two of your stones with two shared empty neighbors form a <em>bridge</em>: if your opponent takes one of those cells, take the other and stay connected.</li>
            <li>Blocking from right in front rarely works. Block from a distance.</li>
            <li><strong>Pass &amp; play</strong>: two players share this device. <strong>Online</strong>: send a friend the game link and play live. <strong>Computer</strong>: play the bot at three levels.</li>
            <li>On a keyboard, focus the board and use the arrow keys and Enter.</li>
          </ul>
        </details>
      </div>
    </Dialog>
  )
}
