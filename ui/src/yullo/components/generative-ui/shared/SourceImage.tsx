import { useState } from 'react'
import { safeUrl } from './safeUrl'

export function SourceImage({ src, alt }: { src: string; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const url = safeUrl(src)
  if (!url || failedSrc === src) return <span role="status" className="flex min-h-32 items-center justify-center p-4 text-sm text-[var(--presentation-muted)]">Image unavailable</span>
  return <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} className="w-full max-h-96 object-contain" />
}
