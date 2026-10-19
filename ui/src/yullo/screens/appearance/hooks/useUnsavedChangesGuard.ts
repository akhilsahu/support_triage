import { useCallback, useEffect } from 'react'

const message = 'You have unsaved appearance changes. Leave without saving?'

export function useUnsavedChangesGuard(dirty: boolean) {
  const confirmLeave = useCallback(() => !dirty || window.confirm(message), [dirty])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    const captureLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.origin !== window.location.origin) return
      if (!window.confirm(message)) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', captureLink, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', captureLink, true)
    }
  }, [dirty])

  return confirmLeave
}
