import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

const API = '/api/v1'
export type Tab = 'login' | 'register'

export function useAuthForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAppStore()

  const [tab, setTab] = useState<Tab>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('tab')
    setTab(p === 'register' || p === 'signup' ? 'register' : 'login')
  }, [location.search])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Login failed')
      setAuth(data.token, data.space?.id || '', data.space?.slug || '', data.space?.display_name || '')
      navigate('/app/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!slug || !displayName || !regEmail || !regPassword) {
      setError('All fields are required.')
      return
    }
    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          display_name: displayName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Registration failed')
      // Pass email via navigate state (not URL) — stays in memory, not logged anywhere
      navigate('/app/verify-email', { state: { email: regEmail.trim() } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return {
    tab, setTab, loading, error, setError,
    email, setEmail, password, setPassword,
    slug, setSlug, displayName, setDisplayName,
    regEmail, setRegEmail, regPassword, setRegPassword,
    handleLogin, handleRegister,
  }
}
