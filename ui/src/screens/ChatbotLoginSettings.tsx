import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { Toggle } from '../components/ui/Toggle'
import { Button } from '../components/ui/Button'

// Per-chatbot customer-login gate (see app/models/chatbot.py login_after_messages,
// enforced server-side in app/core/chatbot_auth.py login_gate_blocks).
//   null -> never required   0 -> before the first message   N -> N free messages
// The UI models this as a toggle plus an optional free-message count.

export function ChatbotLoginSettings({ slug, value, onSaved }: {
  slug: string
  value: number | null
  onSaved: (v: number | null) => void
}) {
  const [enabled, setEnabled] = useState(value !== null)
  const [freeMessages, setFreeMessages] = useState(String(value ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Re-sync when the selected chatbot changes.
  useEffect(() => {
    setEnabled(value !== null)
    setFreeMessages(String(value ?? 0))
    setError(''); setSaved(false)
  }, [slug, value])

  const persist = async (next: number | null) => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await apiClient.updateChatbot(slug, { login_after_messages: next })
      onSaved(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Could not save the login setting.')
      setEnabled(value !== null)      // roll back the optimistic toggle
    } finally {
      setSaving(false)
    }
  }

  const toggle = (on: boolean) => {
    setEnabled(on)
    persist(on ? Math.max(0, parseInt(freeMessages, 10) || 0) : null)
  }

  const saveCount = () => persist(Math.max(0, parseInt(freeMessages, 10) || 0))
  const dirty = enabled && String(value ?? '') !== String(Math.max(0, parseInt(freeMessages, 10) || 0))

  return (
    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Require customer login</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-lg">
            Customers sign in with Google before chatting, so their conversation history is saved
            and they can pick it up again on any device.
          </p>
        </div>
        <Toggle checked={enabled} onChange={toggle} disabled={saving} />
      </div>

      {enabled && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Allow</span>
          <input
            type="number"
            min={0}
            value={freeMessages}
            onChange={e => setFreeMessages(e.target.value)}
            disabled={saving}
            className="w-20 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-400"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            free message(s) before asking them to sign in — 0 asks immediately.
          </span>
          {dirty && (
            <Button size="sm" disabled={saving} onClick={saveCount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
      {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">Saved.</p>}
    </div>
  )
}
