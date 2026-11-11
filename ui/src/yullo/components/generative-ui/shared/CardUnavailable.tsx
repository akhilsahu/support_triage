export function CardUnavailable({ onRetry }: { onRetry?: () => void }) {
  return <div role="status" className="rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] p-4 text-sm text-[var(--presentation-muted)]">
    These details are unavailable right now.
    {onRetry && <button type="button" onClick={onRetry} className="ml-3 underline text-[var(--presentation-accent-ink)]">Try again</button>}
  </div>
}
