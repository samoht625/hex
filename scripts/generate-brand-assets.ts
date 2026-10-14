/**
 * Renders the app icons and the link-preview image into public/.
 * Run with `npm run assets:brand` (needs Chrome; set CHROME_PATH if it is not
 * at /usr/local/bin/google-chrome or on PATH as google-chrome).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { selfPlay } from '../src/shared/bot'
import { newGame, undo } from '../src/shared/hex'
import { boardLayout } from '../src/client/lib/geometry'

const PUBLIC = join(import.meta.dirname, '..', 'public')
const RED = '#e0464e'
const BLUE = '#3b6fd4'

/** A pointy hexagon split down the middle: one half per player. */
function iconSvg({ background, scale, radius }: { background: string; scale: number; radius: number }): string {
  const c = 256
  const r = 150 * scale
  const h = (r * Math.sqrt(3)) / 2
  const gap = 9 * scale
  const left = `${c - gap},${c - r + gap * 0.6} ${c - gap},${c + r - gap * 0.6} ${c - h},${c + r / 2} ${c - h},${c - r / 2}`
  const right = `${c + gap},${c - r + gap * 0.6} ${c + h},${c - r / 2} ${c + h},${c + r / 2} ${c + gap},${c + r - gap * 0.6}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${background}"/><g stroke-linejoin="round" stroke-width="${14 * scale}"><polygon points="${left}" fill="${RED}" stroke="${RED}"/><polygon points="${right}" fill="${BLUE}" stroke="${BLUE}"/></g></svg>`
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function boardSvg(): string {
  // A tense late-middle game: a self-played game, a few moves before the end.
  const finished = selfPlay(newGame({ size: 11, swapRule: true }), { level: 'normal', maxIterations: 6000, random: seededRandom(5) })
  const game = undo(finished, 5)
  const layout = boardLayout(11, 'classic')
  const fill = (cell: number) => (game.board[cell] === 1 ? RED : game.board[cell] === 2 ? BLUE : '#ffffff')
  const edges = layout.edges.map(([owner, points]) => `<polygon points="${points}" fill="${owner === 'red' ? RED : BLUE}" stroke="${owner === 'red' ? RED : BLUE}" stroke-width="0.02" stroke-linejoin="round"/>`).join('')
  const cells = layout.hexes
    .map((points, cell) => `<polygon points="${points}" fill="${fill(cell)}"/>`)
    .join('')
  const [lx, ly] = layout.centers[game.lastCell!]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="100%">${edges}<g stroke="#d9d9d9" stroke-width="0.075" stroke-linejoin="round">${cells}</g><circle cx="${lx}" cy="${ly}" r="0.24" fill="#fff" opacity="0.92"/></svg>`
}

const ogHtml = () => `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #f5f5f5; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #171717; display: flex; align-items: center; padding: 0 72px; gap: 40px; }
  .text { flex: 0 0 360px; }
  h1 { font-size: 112px; font-weight: 650; letter-spacing: -0.04em; line-height: 1; display: flex; align-items: center; gap: 22px; }
  p { margin-top: 22px; font-size: 34px; line-height: 1.25; color: #525252; }
  .url { margin-top: 36px; font-size: 24px; color: #737373; }
  .board { flex: 1; height: 520px; display: flex; align-items: center; justify-content: center; }
</style></head><body>
  <div class="text">
    <h1>Hex <svg width="64" height="36" viewBox="0 0 30 16"><polygon points="7,1 13.06,4.5 13.06,11.5 7,15 0.94,11.5 0.94,4.5" fill="${RED}"/><polygon points="21,1 27.06,4.5 27.06,11.5 21,15 14.94,11.5 14.94,4.5" fill="${BLUE}"/></svg></h1>
    <p>Connect your two sides of the board.</p>
    <div class="url">hex.tido.site</div>
  </div>
  <div class="board">${boardSvg()}</div>
</body></html>`

async function main() {
  const icon = iconSvg({ background: '#ffffff', scale: 1, radius: 116 })
  writeFileSync(join(PUBLIC, 'icon.svg'), icon)
  const maskable = iconSvg({ background: '#ffffff', scale: 0.78, radius: 0 })
  const touch = iconSvg({ background: '#ffffff', scale: 0.92, radius: 0 })

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' })
  const page = await browser.newPage()
  const renderSvg = async (svg: string, size: number, file: string) => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`)
    await page.screenshot({ path: join(PUBLIC, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  await renderSvg(icon, 16, 'icon-16.png')
  await renderSvg(icon, 32, 'icon-32.png')
  await renderSvg(icon, 192, 'icon-192.png')
  await renderSvg(icon, 512, 'icon-512.png')
  await renderSvg(maskable, 512, 'icon-maskable-512.png')
  await renderSvg(touch, 180, 'apple-touch-icon.png')

  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(ogHtml())
  await page.screenshot({ path: join(PUBLIC, 'og-image.png') })
  await browser.close()
  console.log('Wrote icons and og-image.png to public/')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
