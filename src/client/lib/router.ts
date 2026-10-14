import { useEffect, useState } from 'react'
import { normalizeRoomCode } from '../../shared/protocol'

export type Route = { mode: 'local' } | { mode: 'computer' } | { mode: 'online'; code: string | null }
export type Mode = Route['mode']

export function parseRoute(pathname: string): Route {
  const room = pathname.match(/^\/r\/([^/]+)\/?$/)
  if (room) return { mode: 'online', code: normalizeRoomCode(room[1]) }
  if (/^\/online\/?$/.test(pathname)) return { mode: 'online', code: null }
  if (/^\/computer\/?$/.test(pathname)) return { mode: 'computer' }
  return { mode: 'local' }
}

export const pathFor = (route: Route): string =>
  route.mode === 'local' ? '/' : route.mode === 'computer' ? '/computer' : route.code ? `/r/${route.code}` : '/online'

const listeners = new Set<() => void>()

export function navigate(route: Route, replace = false): void {
  const path = pathFor(route)
  if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', path)
  listeners.forEach(listener => listener())
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname))
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname))
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return route
}
