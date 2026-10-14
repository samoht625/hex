import { useEffect, useRef, useState } from 'react'
import type { BotLevel, SearchResult } from '../../shared/bot'
import { toRecord, type GameState, type Move } from '../../shared/hex'
import type { BotRequest } from '../bot.worker'

/** Even instant answers wait this long, so the bot's stone doesn't feel abrupt. */
const MIN_DELAY_MS = 450

let nextId = 1

/**
 * Asks the bot (in a web worker) for a move whenever `active` is true, and
 * calls `onMove` with it and the move count it was computed for.
 */
export function useBot(game: GameState, active: boolean, level: BotLevel, onMove: (move: Move, ply: number) => void): boolean {
  const workerRef = useRef<Worker | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const [thinking, setThinking] = useState(false)

  useEffect(() => () => workerRef.current?.terminate(), [])

  useEffect(() => {
    if (!active) return
    workerRef.current ??= new Worker(new URL('../bot.worker.ts', import.meta.url), { type: 'module' })
    const worker = workerRef.current
    const id = nextId++
    const started = performance.now()
    const ply = game.moves.length
    let answered = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setThinking(true)

    const onMessage = (event: MessageEvent<SearchResult & { id: number }>) => {
      if (event.data.id !== id) return
      answered = true
      timer = setTimeout(() => {
        setThinking(false)
        onMoveRef.current(event.data.move, ply)
      }, Math.max(0, MIN_DELAY_MS - (performance.now() - started)))
    }
    worker.addEventListener('message', onMessage)
    worker.postMessage({ id, record: toRecord(game), level } satisfies BotRequest)

    return () => {
      worker.removeEventListener('message', onMessage)
      clearTimeout(timer)
      setThinking(false)
      if (!answered) {
        // Stop a long search for a position that no longer exists.
        worker.terminate()
        if (workerRef.current === worker) workerRef.current = null
      }
    }
  }, [active, game, level])

  return thinking
}
