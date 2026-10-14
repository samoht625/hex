/**
 * Captures mobile (portrait) and desktop screenshots of in-progress and won
 * games from a running server. Start the app first (`npm run build && npm start`),
 * then run `npm run screenshots`.
 *
 *   BASE_URL        server to capture (default http://localhost:3000)
 *   SCREENSHOT_DIR  output directory (default ./artifacts)
 *   CHROME_PATH     Chrome binary (default /usr/local/bin/google-chrome)
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { chooseMove, selfPlay } from '../src/shared/bot'
import { newGame, play, toRecord, undo, type GameState, type Move } from '../src/shared/hex'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '..', 'artifacts')

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const finishedGame = (seed: number): GameState =>
  selfPlay(newGame({ size: 11, swapRule: true }), { level: 'medium', maxIterations: 3000, random: seededRandom(seed) })

async function seeded(browser: Browser, device: typeof DESKTOP | typeof MOBILE, key: string, game: GameState, extra: Record<string, unknown> = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(device)
  const saved = JSON.stringify({ settings: { size: game.size, swapRule: game.swapRule, level: 'medium', humanColor: 'red', ...extra }, game: toRecord(game) })
  await context.addInitScript(([k, v]) => localStorage.getItem(k) === null && localStorage.setItem(k, v), [key, saved] as const)
  return { context, page: await context.newPage() }
}

const stoneCount = (page: Page) => page.locator('.hex-cell:not([data-stone="0"])').count()

async function waitForStones(page: Page, count: number, myTurn = false): Promise<void> {
  await page.waitForFunction(
    ([n, turn]) => document.querySelectorAll('.hex-cell:not([data-stone="0"])').length === n && (!turn || document.querySelector('svg.hex-board[data-turn]') !== null),
    [count, myTurn] as const,
    { timeout: 20_000 }
  )
}

async function playMove(page: Page, move: Move): Promise<void> {
  if (move === 'swap') await page.getByRole('button', { name: 'Swap', exact: true }).click()
  else await page.locator(`[data-cell="${move}"]`).click()
}

async function shot(page: Page, name: string, settleMs = 700): Promise<void> {
  await page.waitForTimeout(settleMs) // let stone and win-path animations finish
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`  ${name}.png`)
}

/** Vs computer: play a real move and wait for the bot's reply. */
async function computerInProgress(browser: Browser, device: typeof DESKTOP | typeof MOBILE, name: string, seed: number): Promise<void> {
  const full = finishedGame(seed)
  const base = undo(full, full.moves.length - Math.min(22, full.moves.length - 6))
  const position = base.toMove === 'red' ? base : undo(base)
  const { context, page } = await seeded(browser, device, 'hex:computer', position)
  await page.goto(BASE_URL)
  await waitForStones(page, await stoneCount(page), true)
  const before = await stoneCount(page)
  await playMove(page, chooseMove(position, { level: 'easy', random: seededRandom(seed) }).move)
  await waitForStones(page, before + 2, true)
  await shot(page, name)
  await context.close()
}

/** First visit: the computer game with the strength and color pickers, then the new-game dialog. */
async function pickers(browser: Browser, device: typeof DESKTOP | typeof MOBILE, name: string): Promise<void> {
  const context = await browser.newContext(device)
  const page = await context.newPage()
  await page.goto(BASE_URL)
  await page.getByRole('radiogroup', { name: 'Your color' }).waitFor()
  await page.getByRole('radio', { name: /Hard/ }).click()
  await shot(page, `${name}-first-visit`)
  await page.getByRole('button', { name: 'New game', exact: true }).first().click()
  await page.getByRole('dialog').waitFor()
  await shot(page, `${name}-difficulty`, 400)
  await context.close()
}

/** Pass-and-play: seed the position before the end and play the winning move. */
async function localWon(browser: Browser, device: typeof DESKTOP | typeof MOBILE, name: string, seed: number): Promise<void> {
  const full = finishedGame(seed)
  const { context, page } = await seeded(browser, device, 'hex:local', undo(full))
  await page.goto(`${BASE_URL}/local`)
  await page.locator('svg.hex-board[data-turn]').waitFor()
  await playMove(page, full.moves.at(-1)!)
  await page.locator('svg.hex-board[data-won="true"]').waitFor()
  await shot(page, name, 1600)
  await context.close()
}

/** Online: create a room on one device, join from another, and play live. */
async function onlineInProgress(browser: Browser, device: typeof DESKTOP | typeof MOBILE, name: string, seed: number): Promise<void> {
  const moves = finishedGame(seed).moves.slice(0, 17)
  const red = await browser.newContext(device)
  const blue = await browser.newContext(device)
  const redPage = await red.newPage()
  const bluePage = await blue.newPage()

  await redPage.goto(`${BASE_URL}/online`)
  await redPage.getByRole('button', { name: 'Create game' }).click()
  await redPage.waitForURL(/\/r\/[A-Z0-9]+$/)
  await bluePage.goto(redPage.url())
  await waitForStones(redPage, 0, true)

  let state = newGame({ size: 11, swapRule: true })
  for (const move of moves) {
    const [mover, waiter] = state.toMove === 'red' ? [redPage, bluePage] : [bluePage, redPage]
    await playMove(mover, move)
    state = play(state, move)
    const stones = state.board.filter(stone => stone !== 0).length
    await waitForStones(waiter, stones, true)
    await waitForStones(mover, stones)
  }
  await shot(state.toMove === 'red' ? redPage : bluePage, name)
  await red.close()
  await blue.close()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' })
  console.log(`Capturing ${BASE_URL} into ${OUT}`)
  await computerInProgress(browser, DESKTOP, 'desktop-in-progress', 7)
  await pickers(browser, DESKTOP, 'desktop')
  await pickers(browser, MOBILE, 'mobile')
  await localWon(browser, DESKTOP, 'desktop-won', 8)
  await onlineInProgress(browser, MOBILE, 'mobile-in-progress', 11)
  await localWon(browser, MOBILE, 'mobile-won', 5)
  await onlineInProgress(browser, DESKTOP, 'desktop-online-in-progress', 13)
  await computerInProgress(browser, MOBILE, 'mobile-computer-in-progress', 17)
  await browser.close()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
