import { API_CONFIG } from '../config/api'

// Signed-in end customer (chatbot user) — separate from the space-owner token in
// the Zustand store. Backend: app/core/chatbot_auth.py, app/api/chatbot_user.py.
// Identity is platform-wide, so one stored token works on every space's chatbot.

const STORAGE_KEY = 'support247-customer'

export interface CustomerUser {
  id: string
  email: string | null
  name: string | null
  avatar_url: string | null
}

export interface CustomerAuth {
  token: string
  user: CustomerUser
}

export function readCustomerAuth(): CustomerAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token && parsed?.user ? parsed as CustomerAuth : null
  } catch {
    return null
  }
}

export function writeCustomerAuth(auth: CustomerAuth) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(auth)) } catch { /* private mode */ }
}

export function clearCustomerAuth() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
}

/** Authorization header for the customer chat endpoints, or {} when signed out. */
export function customerAuthHeader(): Record<string, string> {
  const auth = readCustomerAuth()
  return auth ? { Authorization: `Bearer ${auth.token}` } : {}
}

/** Exchange a Google ID token for our customer token. `sessionId` claims the
 *  anonymous conversation already in progress so the thread carries over. */
export async function loginWithGoogle(
  slug: string, credential: string, sessionId?: string, botQuery = '',
): Promise<CustomerAuth> {
  const res = await fetch(`${API_CONFIG.baseURL}/api/chat/${slug}/auth/google${botQuery}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: credential, session_id: sessionId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Sign-in failed.')
  }
  const auth = await res.json() as CustomerAuth
  writeCustomerAuth(auth)
  return auth
}

/** Validate a stored token against the server (it may have expired). Clears it
 *  and returns null when no longer valid. */
export async function verifyCustomerAuth(): Promise<CustomerAuth | null> {
  const auth = readCustomerAuth()
  if (!auth) return null
  try {
    const res = await fetch(`${API_CONFIG.baseURL}/api/chat/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!res.ok) { clearCustomerAuth(); return null }
    const data = await res.json()
    const refreshed = { token: auth.token, user: data.user as CustomerUser }
    writeCustomerAuth(refreshed)
    return refreshed
  } catch {
    return auth   // network blip — keep the local session rather than logging out
  }
}

export interface CustomerSession {
  id: string
  title: string
  status: string
  message_count: number
  last_message_at: string | null
  space_slug: string
  space_name: string
  space_logo_url: string | null
  chatbot_slug: string | null
  is_current_space: boolean
}

/** The customer's conversations for the history drawer: current space first,
 *  then every other space they've chatted with. */
export async function fetchCustomerSessions(currentSlug: string): Promise<CustomerSession[]> {
  const auth = readCustomerAuth()
  if (!auth) return []
  const res = await fetch(
    `${API_CONFIG.baseURL}/api/chat/me/sessions?current=${encodeURIComponent(currentSlug)}`,
    { headers: { Authorization: `Bearer ${auth.token}` } },
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.sessions ?? []) as CustomerSession[]
}
