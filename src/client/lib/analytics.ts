type Umami = { track: (event: string, data?: Record<string, string | number | boolean>) => void }

/** Sends a custom event to Umami when its script is on the page; otherwise does nothing. */
export function track(event: string, data?: Record<string, string | number | boolean>): void {
  try {
    ;(window as Window & { umami?: Umami }).umami?.track(event, data)
  } catch {
    // Analytics must never break the game.
  }
}
