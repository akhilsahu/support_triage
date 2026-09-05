import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

const PREVIEW_KEY = 'support247-homepage-preview'
export function readHomepagePreview(search: string): 'homepage5' | null {
  const value = new URLSearchParams(search).get('homepage')
  if (value === 'homepage5') return 'homepage5'
  if (value === 'default') return null
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === 'homepage5'
      ? 'homepage5'
      : null
  } catch {
    return null
  }
}

/** Tab-local preview; never changes the platform's public homepage setting. */
export function useHomepageVariant() {
  const activeHomepage = useAppStore((s) => s.activeHomepage)
  const { search } = useLocation()
  const [preview, setPreview] = useState(() => readHomepagePreview(search))
  const requested = new URLSearchParams(search).get('homepage')
  useEffect(() => {
    if (requested !== 'homepage5' && requested !== 'default') return
    const next = requested === 'homepage5' ? 'homepage5' : null
    setPreview(next)
    try {
      if (next) sessionStorage.setItem(PREVIEW_KEY, next)
      else sessionStorage.removeItem(PREVIEW_KEY)
    } catch {
      /* Preview still works without storage. */
    }
  }, [requested])
  return requested === 'homepage5'
    ? 'homepage5'
    : requested === 'default'
      ? activeHomepage
      : (preview ?? activeHomepage)
}
