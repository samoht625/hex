/**
 * Plays real games in a browser and checks that placing stones never moves
 * anything: the header, every HUD control and the board must keep their exact
 * boxes from the first move to the last, on desktop and on a phone, and the
 * browser must report no layout shifts outside the status slot under the board.
 *
 * Start the app first (`npm run build && npm start`), then `npm run check:layout`.
 *
 *   BASE_URL     server to check (default http://localhost:3000)
 *   CHROME_PATH  Chrome binary (default /usr/local/bin/google-chrome)
 */
import { chromium, type Browser, type Page } from 'playwright-core'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'small phone': { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
}
type Device = keyof typeof DEVICES

const failures: string[] = []

/** Records layout shifts, except inside the status slot (its text is meant to change). */
function observeShifts(): void {
  const shifts: string[] = []
  ;(window as unknown as { __shifts: string[] }).__shifts = shifts
  new PerformanceObserver(list => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; sources?: Array<{ node?: Node }> }>) {
      const outside = (entry.sources ?? []).filter(source => !(source.node instanceof Element && source.node.closest('[data-status-slot]')))
      if (outside.length > 0) shifts.push(outside.map(source => (source.node instanceof Element ? source.node.outerHTML.slice(0, 80) : String(source.node))).join(' | '))
    }
  }).observe({ type: 'layout-shift', buffered: false })
}

/** Boxes of everything that must stay put, keyed by what the element is. */
async function boxes(page: Page): Promise<Map<string, string>> {
  const entries = await page.evaluate(() =>
    [...document.querySelectorAll('header a, header button, [data-hud] button, [data-hud] [data-player-tag], [data-hud] [role="radiogroup"], svg.hex-board')].map((element, index) => {
      const r = element.getBoundingClientRect()
      const name = element.matches('svg.hex-board') ? 'board' : element.getAttribute('aria-label') ?? element.getAttribute('data-player-tag') ?? element.textContent?.trim().slice(0, 24) ?? ''
      return [`${element.tagName.toLowerCase()} ${name} #${index}`, [r.x, r.y, r.width, r.height].map(v => v.toFixed(1)).join(',')] as [string, string]
    })
  )
  return new Map(entries)
}

class Watcher {
  private baseline: Map<string, string> | null = null
  constructor(private readonly page: Page, private readonly label: string) {}

  async start(): Promise<void> {
    await this.page.evaluate(observeShifts)
    this.baseline = await boxes(this.page)
  }

  async check(step: string): Promise<void> {
    const now = await boxes(this.page)
    const before = this.baseline!
    for (const [key, box] of before) {
      if (!now.has(key)) failures.push(`${this.label}, ${step}: "${key}" disappeared`)
      else if (now.get(key) !== box) failures.push(`${this.label}, ${step}: "${key}" moved from ${box} to ${now.get(key)}`)
    }
    for (const key of now.keys()) if (!before.has(key)) failures.push(`${this.label}, ${step}: "${key}" appeared`)
    const shifts = await this.page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts.splice(0))
    for (const shift of shifts) failures.push(`${this.label}, ${step}: layout shift of ${shift}`)
  }
}

async function tapCell(page: Page, device: Device, cell: number): Promise<void> {
  const target = page.locator(`[data-cell="${cell}"]`)
  if (device === 'desktop') await target.click()
  else await target.tap()
}

const stones = (page: Page) => page.locator('.hex-cell:not([data-stone="0"])').count()
const waitForMyTurn = (page: Page) => page.locator('svg.hex-board[data-turn]').waitFor({ timeout: 20_000 })

/** First free cell from a fixed preference list, walking outward from the middle. */
async function freeCell(page: Page, size: number): Promise<number> {
  const taken = new Set(await page.locator('.hex-cell:not([data-stone="0"])').evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('data-cell')))))
  const middle = (size - 1) / 2
  const order = Array.from({ length: size * size }, (_, cell) => cell).sort((a, b) => {
    const d = (cell: number) => Math.abs(Math.floor(cell / size) - middle) + Math.abs((cell % size) - middle) + (cell % 3) * 0.01
    return d(a) - d(b)
  })
  return order.find(cell => !taken.has(cell))!
}

async function newPage(browser: Browser, device: Device, path: string, board = true): Promise<Page> {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(BASE_URL + path)
  if (board) await page.locator('svg.hex-board').waitFor()
  await page.waitForTimeout(300)
  return page
}

async function vsComputer(browser: Browser, device: Device, color: 'red' | 'blue'): Promise<void> {
  const page = await newPage(browser, device, '/')
  const watch = new Watcher(page, `${device}, vs computer as ${color}`)
  await watch.start()
  if (color === 'blue') {
    await page.getByRole('radio', { name: /Blue/ }).click()
    await waitForMyTurn(page)
    await watch.check('computer opened')
    await page.getByRole('button', { name: 'Swap', exact: true }).click()
    await page.waitForTimeout(100)
    await watch.check('swap')
  }
  for (let move = 0; move < 8; move++) {
    await waitForMyTurn(page)
    const count = await stones(page)
    await tapCell(page, device, await freeCell(page, 11))
    await page.waitForTimeout(60)
    await watch.check(`stone ${count + 1}, at once`)
    await page.waitForTimeout(300)
    await watch.check(`stone ${count + 1}, while the computer thinks`)
    await waitForMyTurn(page)
    await watch.check(`reply to stone ${count + 1}`)
  }
  await page.context().close()
}

async function passAndPlay(browser: Browser, device: Device): Promise<void> {
  const page = await newPage(browser, device, '/local')
  const watch = new Watcher(page, `${device}, pass & play`)
  await watch.start()
  // Red marches down column 5 while Blue plays along column 0: Red wins on move 21.
  for (let row = 0; row < 11; row++) {
    await tapCell(page, device, row * 11 + 5)
    await page.waitForTimeout(60)
    await watch.check(`red stone ${row + 1}`)
    if (row === 10) break
    await tapCell(page, device, row * 11)
    await page.waitForTimeout(60)
    await watch.check(`blue stone ${row + 1}`)
  }
  await page.waitForTimeout(1200)
  await watch.check('red wins')
  if (!(await page.getByText('Red wins').isVisible())) failures.push(`${device}, pass & play: no result shown`)
  await page.context().close()
}

async function online(browser: Browser, hostDevice: Device, guestDevice: Device): Promise<void> {
  const host = await newPage(browser, hostDevice, '/online', false)
  await host.getByRole('button', { name: 'Create game' }).click()
  await host.waitForURL(/\/r\//)
  await host.locator('[data-player-tag]').first().waitFor()
  const hostWatch = new Watcher(host, `${hostDevice}, online host`)
  await hostWatch.start()
  const guest = await newPage(browser, guestDevice, new URL(host.url()).pathname)
  await guest.locator('[data-player-tag]').first().waitFor()
  await waitForMyTurn(host)
  await hostWatch.check('friend joined')
  const guestWatch = new Watcher(guest, `${guestDevice}, online guest`)
  await guestWatch.start()
  for (let move = 0; move < 6; move++) {
    const [mover, moverDevice] = move % 2 === 0 ? [host, hostDevice] : [guest, guestDevice]
    await waitForMyTurn(mover)
    await tapCell(mover, moverDevice, await freeCell(mover, 11))
    await Promise.all([host, guest].map(page => page.waitForFunction(n => document.querySelectorAll('.hex-cell:not([data-stone="0"])').length === n, move + 1)))
    await host.waitForTimeout(150)
    await hostWatch.check(`stone ${move + 1}`)
    await guestWatch.check(`stone ${move + 1}`)
  }
  await host.context().close()
  await guest.context().close()
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' })
try {
  for (const device of Object.keys(DEVICES) as Device[]) {
    console.log(`${device}…`)
    await vsComputer(browser, device, 'red')
    await vsComputer(browser, device, 'blue')
    await passAndPlay(browser, device)
  }
  console.log('online…')
  await online(browser, 'desktop', 'phone')
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n${failures.map(f => `  ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('\nNothing moved.')
