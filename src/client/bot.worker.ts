/// <reference lib="webworker" />
import { chooseMove, type BotLevel } from '../shared/bot'
import { fromRecord, type GameRecord } from '../shared/hex'

export interface BotRequest {
  id: number
  record: GameRecord
  level: BotLevel
}

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, record, level } = event.data
  const state = fromRecord(record)
  if (!state || state.winner) return
  const result = chooseMove(state, { level })
  self.postMessage({ id, ...result })
}
