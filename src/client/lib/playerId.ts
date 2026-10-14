import { load, save } from './storage'

const KEY = 'hex:player-id'

/** A random id kept on this device, so a reconnecting browser gets its seat back. */
export function playerId(): string {
  let id = load<string | null>(KEY, null)
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    save(KEY, id)
  }
  return id
}
