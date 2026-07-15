import { useState, useEffect, useRef } from 'react'

export interface SpaceResult {
  name: string
  slug: string
  logo_url?: string
  theme_color?: string
}

/**
 * Headless space-search logic for the public homepage search box.
 *
 * All homepage themes share this exact behaviour (debounced fetch, keyboard
 * navigation, click-outside close); only the surrounding markup differs, so
 * each themed <SpaceSearch> renders its own JSX around these handlers.
 */
export function useSpaceSearch() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SpaceResult[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive]   = useState(-1)
  const wrapRef               = useRef<HTMLDivElement>(null)
  const debounce              = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const search = (q: string) => {
    setQuery(q); setActive(-1)
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/v1/space/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.results || [])
        setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 220)
  }

  // Open the selected space in a new tab (user-gesture triggered, so not blocked).
  const go = (slug: string) => window.open(`/${slug}`, '_blank', 'noopener,noreferrer')

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { if (active >= 0) go(results[active].slug); else if (results[0]) go(results[0].slug) }
    if (e.key === 'Escape')    { setOpen(false); setActive(-1) }
  }

  const hasDropdown = open && (results.length > 0 || (query.trim() && !loading))

  return { query, results, open, setOpen, loading, active, setActive, wrapRef, search, go, onKey, hasDropdown }
}
