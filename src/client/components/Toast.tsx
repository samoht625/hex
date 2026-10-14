import { useEffect, useState } from 'react'

const EVENT = 'hex:toast'

export function showToast(text: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: text }))
}

export function Toast() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onToast = (event: Event) => {
      setMessage({ text: (event as CustomEvent<string>).detail, id: Date.now() })
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 2200)
    }
    window.addEventListener(EVENT, onToast)
    return () => {
      window.removeEventListener(EVENT, onToast)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      {message && (
        <div
          key={message.id}
          className="animate-fade-in-up absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
