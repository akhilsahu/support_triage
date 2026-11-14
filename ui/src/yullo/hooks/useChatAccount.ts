import { useCallback, useEffect, useRef, useState } from 'react'
import { yulloApiClient } from '../api/client'
import { useYulloAppStore } from '../store/useYulloAppStore'

export function useChatAccount(enabled: boolean) {
  const user = useYulloAppStore(state => state.user)
  const setAuth = useYulloAppStore(state => state.setAuth)
  const clearAuth = useYulloAppStore(state => state.clearAuth)
  const [ready, setReady] = useState(!enabled)
  const [error, setError] = useState('')
  const retryRef = useRef<() => void>(() => {})
  const verificationRef = useRef(0)
  useEffect(() => {
    if (!enabled) return
    let active = true
    let checking = false
    const verify = async () => {
      if (checking) return
      checking = true
      const version = ++verificationRef.current
      let resolved = false
      try {
        const { data } = await yulloApiClient.get('/auth/me')
        if (active && version === verificationRef.current) { setAuth(data.user, data.csrf_token, data.preference?.appTheme); setError(''); resolved = true }
      } catch (reason: any) {
        if (!active || version !== verificationRef.current) return
        if (reason?.response?.status === 401) { clearAuth(); setError(''); resolved = true }
        else setError('Could not connect to your account. Try again shortly.')
      } finally {
        checking = false
        if (active && resolved && version === verificationRef.current) setReady(true)
      }
    }
    void verify()
    retryRef.current = verify
    window.addEventListener('focus', verify)
    window.addEventListener('yullo-session-refresh', verify)
    return () => { active = false; window.removeEventListener('focus', verify); window.removeEventListener('yullo-session-refresh', verify) }
  }, [enabled, setAuth, clearAuth])

  const signOut = useCallback(async () => {
    verificationRef.current += 1
    try {
      await yulloApiClient.post('/auth/logout', undefined, { headers: { 'X-Yullo-Chat-Account': user?.id || 'guest' } })
      clearAuth(); setError('')
    }
    catch (reason: any) {
      if (reason?.response?.status === 401) { clearAuth(); setError(''); retryRef.current() }
      else setError('Could not sign out. Please try again.')
    }
  }, [clearAuth, user?.id])
  return { user: enabled && ready ? user : null, ready: !enabled || ready, error, signOut, retry: () => retryRef.current() }
}
