import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { isValidSize, type Move } from '../shared/hex'
import { isPlayerId, ROOM_CODE_PATTERN, type ClientMessage, type CreateRoomRequest, type ServerMessage } from '../shared/protocol'
import { RoomError, RoomManager, type Client } from './rooms'

export interface AppOptions {
  /** Built client files (dist/client). Without it only the API and socket are served. */
  staticDir?: string
  /** Canonical origin used in link previews, e.g. https://hex.tido.site */
  publicUrl?: string
  /** Optional Umami analytics tag. */
  umami?: { scriptUrl: string; websiteId: string }
  rooms?: RoomManager
}

export interface App {
  server: Server
  rooms: RoomManager
  close(): Promise<void>
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
}

/** Client-side routes that all render the app shell. */
const APP_ROUTES = /^\/(?:online|computer|r\/[A-Za-z0-9]{1,12})?\/?$/

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

function renderShell(template: string, options: AppOptions, path: string): string {
  const publicUrl = (options.publicUrl ?? 'https://hex.tido.site').replace(/\/$/, '')
  let html = template.replaceAll('__PUBLIC_URL__', escapeHtml(publicUrl)).replaceAll('__PAGE_URL__', escapeHtml(publicUrl + (path === '/' ? '/' : path)))
  if (path.startsWith('/r/')) {
    html = html
      .replace(/(<meta property="og:title" content=")[^"]*/, '$1You’re invited to a game of Hex')
      .replace(/(<meta name="twitter:title" content=")[^"]*/, '$1You’re invited to a game of Hex')
      .replace(/(<meta property="og:description" content=")[^"]*/, '$1Tap to join and play live. Connect your two sides of the board before your friend does.')
  }
  if (options.umami) {
    const tag = `<script defer src="${escapeHtml(options.umami.scriptUrl)}" data-website-id="${escapeHtml(options.umami.websiteId)}"></script>`
    html = html.replace('<!--UMAMI-->', tag)
  }
  return html
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(data) })
  res.end(data)
}

function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const message = data as Record<string, unknown>
  switch (message.t) {
    case 'join':
      return typeof message.room === 'string' && isPlayerId(message.playerId) ? { t: 'join', room: message.room.toUpperCase(), playerId: message.playerId } : null
    case 'move':
      return (message.move === 'swap' || typeof message.move === 'number') && typeof message.ply === 'number'
        ? { t: 'move', move: message.move as Move, ply: message.ply }
        : null
    case 'undo':
    case 'undo-decline':
    case 'rematch':
      return { t: message.t }
    default:
      return null
  }
}

export function createApp(options: AppOptions = {}): App {
  const rooms = options.rooms ?? new RoomManager()
  const startedAt = Date.now()
  const staticDir = options.staticDir && existsSync(options.staticDir) ? resolve(options.staticDir) : null
  const indexPath = staticDir ? join(staticDir, 'index.html') : null
  const shellTemplate = indexPath && existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null

  const serveStatic = (req: IncomingMessage, res: ServerResponse, pathname: string): boolean => {
    if (!staticDir) return false
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return false
    }
    const filePath = normalize(join(staticDir, decoded))
    if (!filePath.startsWith(staticDir + sep)) return false
    let stats
    try {
      stats = statSync(filePath)
    } catch {
      return false
    }
    if (!stats.isFile() || filePath === indexPath) return false
    const immutable = decoded.startsWith('/assets/')
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      ...(decoded === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {})
    })
    if (req.method === 'HEAD') res.end()
    else createReadStream(filePath).pipe(res)
    return true
  }

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url

    if (pathname === '/healthz' || pathname === '/health') {
      return sendJson(res, 200, { ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), rooms: rooms.rooms.size })
    }

    if (pathname === '/api/rooms' && req.method === 'POST') {
      let body: Partial<CreateRoomRequest>
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' })
      }
      if (!isValidSize(body.size) || typeof body.swapRule !== 'boolean') return sendJson(res, 400, { error: 'Invalid game settings' })
      try {
        const room = rooms.create({ size: body.size, swapRule: body.swapRule }, isPlayerId(body.playerId) ? body.playerId : undefined)
        return sendJson(res, 201, { code: room.code })
      } catch (error) {
        return sendJson(res, 503, { error: (error as Error).message })
      }
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' })

    if (serveStatic(req, res, pathname)) return

    if (APP_ROUTES.test(pathname) && shellTemplate) {
      const html = renderShell(shellTemplate, options, pathname.replace(/\/$/, '') || '/')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(html) })
      return res.end(req.method === 'HEAD' ? undefined : html)
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(error => {
      console.error(error)
      if (!res.headersSent) sendJson(res, 500, { error: 'Server error' })
      else res.end()
    })
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
  const alive = new WeakMap<WebSocket, boolean>()

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/ws') return socket.destroy()
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    const send = (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
    }
    let client: Client | null = null

    ws.on('message', raw => {
      const message = parseClientMessage(raw.toString())
      if (!message) return send({ t: 'error', code: 'bad-message', message: 'Unrecognized message' })
      try {
        if (message.t === 'join') {
          if (!ROOM_CODE_PATTERN.test(message.room)) throw new RoomError('no-room', 'That game does not exist (or has expired)')
          if (client && client.playerId !== message.playerId) rooms.leave(client)
          if (!client || client.playerId !== message.playerId) {
            client = { playerId: message.playerId, room: null, send: view => send({ t: 'state', ...view }) }
          }
          rooms.join(client, message.room)
          return
        }
        if (!client) throw new RoomError('not-joined', 'Join a game first')
        if (message.t === 'move') rooms.move(client, message.move, message.ply)
        else if (message.t === 'undo') rooms.undo(client)
        else if (message.t === 'undo-decline') rooms.declineUndo(client)
        else if (message.t === 'rematch') rooms.rematch(client)
      } catch (error) {
        if (error instanceof RoomError) send({ t: 'error', code: error.code, message: error.message })
        else {
          console.error(error)
          send({ t: 'error', code: 'bad-message', message: 'Something went wrong' })
        }
      }
    })

    ws.on('close', () => {
      if (client) rooms.leave(client)
    })
  })

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate()
        continue
      }
      alive.set(ws, false)
      ws.ping()
    }
  }, 30_000)
  const sweeper = setInterval(() => rooms.sweep(), 10 * 60_000)
  heartbeat.unref()
  sweeper.unref()

  return {
    server,
    rooms,
    close: () =>
      new Promise(resolveClose => {
        clearInterval(heartbeat)
        clearInterval(sweeper)
        for (const ws of wss.clients) ws.terminate()
        wss.close()
        server.close(() => resolveClose())
        server.closeAllConnections?.()
      })
  }
}
