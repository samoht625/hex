import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST || undefined
const staticDir = process.env.STATIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'client')
const umami =
  process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_WEBSITE_ID
    ? { scriptUrl: process.env.UMAMI_SCRIPT_URL, websiteId: process.env.UMAMI_WEBSITE_ID }
    : undefined

const app = createApp({ staticDir, publicUrl: process.env.PUBLIC_URL, umami })

app.server.listen(port, host, () => {
  console.log(`Hex listening on http://${host ?? 'localhost'}:${port} (static: ${staticDir})`)
})

const shutdown = (signal: string) => {
  console.log(`${signal}: shutting down`)
  app.close().then(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
