import { useEffect, useId, useRef, type ReactNode } from 'react'

export const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

interface DialogProps {
  open: boolean
  onClose: () => void
  /** Small uppercase heading; it also names the dialog. */
  label: string
  children: ReactNode
  /** Buttons pinned below the content. */
  actions?: ReactNode
}

/** A small centered modal, closed by its button, Escape, or a click outside. */
export function Dialog({ open, onClose, label, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const labelId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => open && onClose()}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-center justify-center overflow-hidden border-0 bg-transparent p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] text-neutral-900 open:flex backdrop:bg-neutral-900/40 backdrop:backdrop-blur-[2px] sm:p-6 dark:text-neutral-100 dark:backdrop:bg-black/60"
    >
      {open && (
        <div className="animate-dialog-in relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="px-12 pt-4 text-center">
            <h2 id={labelId} className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <CloseIcon />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3">{children}</div>
          {actions && <div className="border-t border-neutral-100 px-5 py-3 dark:border-neutral-800">{actions}</div>}
        </div>
      )}
    </dialog>
  )
}

export function PrimaryButton({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-full px-5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:ring-neutral-700 dark:hover:bg-neutral-800 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A row of mutually exclusive choices, styled like the header's mode switch. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-9 flex-1 rounded-full px-3 text-sm transition-colors ${
              active ? 'bg-white font-medium text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
