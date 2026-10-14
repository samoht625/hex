# Hex

The classic two-player connection game, at [hex.tido.site](https://hex.tido.site).

Red connects top and bottom, Blue connects left and right. Players take turns
placing one stone on any empty cell, and the first to link their two sides wins.
A game of Hex can never end in a draw.

- **Pass & play**: two players, one device.
- **Online**: start a game, send the link (`/r/ABCDE`), and play live on two devices.
- **Computer**: play an MCTS bot (Easy, Normal, Hard) that runs in a web worker.
- 9×9, 11×11 (default) and 13×13 boards. The swap (pie) rule is on by default and can be turned off.
- Winning path highlighted, last-move marker, undo, keyboard play, light/dark theme,
  installable PWA, link previews.

## Quick start

Needs Node 20 or newer.

```sh
npm ci
npm run build      # builds dist/client (static app) and dist/server.mjs (server)
PORT=3000 npm start
```

Then open http://localhost:3000. Health check: `curl localhost:3000/healthz`.

## Development

```sh
npm run dev        # Vite on :5173 with hot reload, game server on :3001 (proxied)
npm test           # rules, swap rule, bot, and online protocol tests (Vitest)
npm run typecheck
```

## Configuration

All settings are environment variables read by `node dist/server.mjs`:

| Variable           | Default                  | Meaning                                                    |
| ------------------ | ------------------------ | ---------------------------------------------------------- |
| `PORT`             | `3000`                   | Port to listen on.                                         |
| `HOST`             | all interfaces           | Interface to bind, e.g. `127.0.0.1` when behind Caddy.     |
| `PUBLIC_URL`       | `https://hex.tido.site`  | Absolute site URL used in canonical and og:image tags.     |
| `UMAMI_SCRIPT_URL` | unset                    | Umami script URL. Set both Umami variables to enable it.   |
| `UMAMI_WEBSITE_ID` | unset                    | Umami website ID.                                          |
| `STATIC_DIR`       | `dist/client`            | Built client files, if you move them.                      |

### Umami

The marked spot is the `<!--UMAMI-->` comment in `index.html`. Either set
`UMAMI_SCRIPT_URL` and `UMAMI_WEBSITE_ID` (the server swaps the marker for
`<script defer src=… data-website-id=…>` at runtime), or paste your script tag
over the marker and rebuild. The app also sends a few custom events
(`new-game`, `game-won`, `online-created`, `invite-copied`) when Umami is present.

## Deployment

It is one long-lived Node process with no database and no external services.
Online rooms live in memory: they survive client disconnects and reloads (players
rejoin their seat automatically), are dropped after 24 hours without activity,
and are lost when the server restarts. Local and vs-computer games are saved in
the browser.

On the server:

```sh
git clone https://github.com/samoht625/hex.git /srv/hex && cd /srv/hex
npm ci && npm run build
sudo cp deploy/hex.service /etc/systemd/system/hex.service   # edit User/paths/PORT if needed
sudo systemctl daemon-reload && sudo systemctl enable --now hex
```

Caddy (WebSockets on `/ws` are proxied with no extra config):

```caddyfile
hex.tido.site {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

To update: `git pull && npm ci && npm run build && sudo systemctl restart hex`.

### HTTP endpoints

- `GET /healthz`: `{"ok":true,"uptimeSeconds":…,"rooms":…}`
- `POST /api/rooms`: `{"size":11,"swapRule":true,"playerId":"…"}` → `{"code":"ABCDE"}`
- `GET /ws`: WebSocket for online play. The server holds the authoritative game,
  validates every move (turn, seat, empty cell, swap legality) and broadcasts the
  room state. Messages are defined in `src/shared/protocol.ts`.
- Everything else serves the app (`/`, `/computer`, `/online`, `/r/:code`) and the
  hashed static assets.

## Project layout

```
src/shared/   game rules (hex.ts), MCTS bot (bot.ts), online protocol types
src/server/   HTTP + WebSocket server and in-memory room manager
src/client/   React UI: board (SVG), modes, dialogs, bot web worker
public/       manifest, service worker, icons, og-image
scripts/      brand asset and screenshot generators
tests/        Vitest suites
deploy/       systemd unit and Caddyfile examples
```

`npm run assets:brand` regenerates the icons and og-image, and
`npm run screenshots` captures screenshots from a running server. Both use a local
Chrome (`CHROME_PATH`, default `/usr/local/bin/google-chrome`).
