/**
 * Inbox — human support console for space owners.
 * - Left: session list grouped by status (collapsible)
 * - Right: full chat view with action bar + locked/unlocked reply box
 * - Reply box unlocks only after claiming the session (staff) or stays view-only (owner)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CheckCircle, Clock, Send, RefreshCw, X,
  ArrowRightLeft, Users, Plus, Trash2, Inbox as InboxIcon,
  ChevronRight, MessageCircle, UserCheck,
} from 'lucide-react'
import apiClient from '../api/client'
import { useAppStore } from '../store/useAppStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  id: string
  title: string | null
  status: 'escalated' | 'queued' | 'active' | 'open' | 'closed'
  assigned_staff_id: string | null
  escalated_at: string | null
  escalation_reason: string | null
  message_count: number
  last_message_at: string | null
}

interface HistoryItem { role: string; message: string; timestamp: string | null }
interface StaffMember { id: string; name: string; email: string; presence: string; active_chat_count: number }

// ── Transfer modal ─────────────────────────────────────────────────────────────

function TransferModal({ token, sessionId, onClose, onDone }: {
  token: string; sessionId: string; onClose: () => void; onDone: () => void
}) {
  const [list, setList]     = useState<StaffMember[]>([])
  const [picked, setPicked] = useState('')
  const [busy, setBusy]     = useState(false)

  useEffect(() => { apiClient.listStaffMembers(token).then(setList).catch(() => {}) }, [token])

  const submit = async () => {
    if (!picked) return
    setBusy(true)
    try { await apiClient.transferSession(sessionId, picked, token); onDone() }
    catch { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-80 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transfer to staff</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
          {list.map(s => (
            <button key={s.id} onClick={() => setPicked(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-between
                ${picked === s.id ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <span className="font-medium">{s.name}</span>
              <span className={`text-xs ${picked === s.id ? 'text-indigo-200' : s.presence === 'online' ? 'text-green-500' : 'text-gray-400'}`}>
                {s.presence}
              </span>
            </button>
          ))}
          {list.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No staff members</p>}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-xl">Cancel</button>
          <button onClick={submit} disabled={!picked || busy}
            className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl"
          >
            {busy ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Full chat view ─────────────────────────────────────────────────────────────

function ChatView({ session: initialSession, token, onClose, onResolved, reloadTrigger = 0, registerAppend }: {
  session: Session; token: string; onClose: () => void; onResolved: () => void
  reloadTrigger?: number
  registerAppend?: (fn: ((item: HistoryItem) => void) | null) => void
}) {
  const [session, setSession]           = useState<any>(initialSession)
  const [history, setHistory]           = useState<HistoryItem[]>([])
  const [reply, setReply]               = useState('')
  const [sending, setSending]           = useState(false)
  const [claiming, setClaiming]         = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showNewPill, setShowNewPill]   = useState(false)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const scrollRef       = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)
  // Track whether the user was at the bottom BEFORE new content is added.
  // Checked in the history effect after the DOM has updated.
  const wasAtBottom     = useRef(true)

  const isAtBottom = () => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const load = useCallback(async () => {
    try {
      const d = await apiClient.getInboxSession(session.id, token)
      // Snapshot scroll state before React updates the DOM
      wasAtBottom.current = isAtBottom()
      setSession(d); setHistory(d.history ?? [])
    } catch {}
  }, [session.id, token])

  // Register a callback so the parent can push a new message directly
  // without waiting for an API round-trip.
  useEffect(() => {
    registerAppend?.((item: HistoryItem) => {
      wasAtBottom.current = isAtBottom()
      setHistory(prev => [...prev, item])
    })
    return () => registerAppend?.(null)
  }, [registerAppend])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (reloadTrigger > 0) {
      if (isAtBottom()) {
        load()
      } else {
        setShowNewPill(true)
        load()
      }
    }
  }, [reloadTrigger])

  useEffect(() => {
    if (history.length === 0) return
    if (!initialLoadDone.current) {
      // First open — jump to bottom instantly
      initialLoadDone.current = true
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    } else if (wasAtBottom.current) {
      // User was at the bottom before the new content — follow it down
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [history])

  const claim = async () => {
    setClaiming(true)
    try { await apiClient.claimSession(session.id, token); await load() }
    finally { setClaiming(false); setTimeout(() => inputRef.current?.focus(), 100) }
  }

  const takeControl = async () => {
    setClaiming(true)
    try {
      // If AI session, escalate first then claim
      if (session.status === 'open') {
        await fetch('/api/v1/inbox/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: session.id, reason: 'manual_takeover' }),
        })
      }
      await apiClient.claimSession(session.id, token)
      await load()
    } finally {
      setClaiming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const sendReply = async () => {
    if (!reply.trim() || sending) return
    setSending(true)
    const text = reply.trim(); setReply('')
    wasAtBottom.current = true  // sending = user is at the bottom, always follow
    try {
      await apiClient.replySession(session.id, text, token)
      setHistory(prev => [...prev, { role: 'human_agent', message: text, timestamp: new Date().toISOString() }])
    } finally { setSending(false); setTimeout(() => inputRef.current?.focus(), 50) }
  }

  const resolve = async () => {
    if (!confirm('Mark this session as resolved?')) return
    try { await apiClient.resolveSession(session.id, token); onResolved() } catch {}
  }

  // Determine what actions are available
  const isClaimed   = session.status === 'active'
  const canTakeOver = !isClaimed && session.status !== 'closed'  // any open/queued/escalated session
  const canReply    = isClaimed
  const canResolve  = isClaimed || session.status === 'open'
  const canTransfer = isClaimed

  const statusColor: Record<string, string> = {
    escalated: 'bg-yellow-400', queued: 'bg-blue-400',
    active: 'bg-green-400', open: 'bg-gray-400', closed: 'bg-gray-300',
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {showTransfer && (
        <TransferModal token={token} sessionId={session.id}
          onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); onResolved() }}
        />
      )}

      {/* ── Top action bar ── */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
        {/* Session info row */}
        <div className="flex items-center gap-3 px-5 py-3">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor[session.status] ?? 'bg-gray-400'}`} />
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {session.title || 'Untitled session'}
            </p>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {session.message_count} messages
              {session.escalation_reason && ` · ${session.escalation_reason}`}
            </span>
          </div>
          <button onClick={load} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-2 px-5 pb-3">
          {/* Primary CTA — always visible when not yet claimed */}
          {canTakeOver && (
            <button onClick={takeControl} disabled={claiming}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors shadow-sm"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {claiming ? 'Taking control…' : 'Transfer to Human'}
            </button>
          )}
          {canTransfer && (
            <button onClick={() => setShowTransfer(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Reassign
            </button>
          )}
          {canResolve && (
            <button onClick={resolve}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-green-600 hover:bg-green-500 text-white transition-colors shadow-sm"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Resolve
            </button>
          )}
          {isClaimed && (
            <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
              You have control · reply box unlocked
            </span>
          )}
        </div>
      </div>

      {/* ── Message history ── */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const atBottom = isAtBottom()
          wasAtBottom.current = atBottom
          if (atBottom) setShowNewPill(false)
        }}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gray-50 dark:bg-gray-950 relative"
      >
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-sm">No messages yet</p>
          </div>
        )}
        {history.map((h, i) => {
          const isAgent = h.role === 'human_agent'
          const isUser  = h.role === 'user'
          const isAI    = h.role === 'assistant'
          return (
            <div key={i} className={`flex items-end gap-2 ${isAgent ? 'justify-end' : 'justify-start'}`}>
              {/* Avatar left */}
              {(isUser || isAI) && (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${isUser ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'}`}
                >
                  {isUser ? 'C' : 'AI'}
                </div>
              )}

              <div className="flex flex-col gap-1" style={{ maxWidth: '65%' }}>
                {/* Role label */}
                {!isUser && !isAgent && (
                  <span className="text-xs text-gray-400 px-1">{h.role}</span>
                )}
                {isAgent && (
                  <span className="text-xs text-indigo-400 px-1 text-right">Agent</span>
                )}

                {/* Bubble */}
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isAgent ? 'bg-indigo-600 text-white rounded-br-sm' :
                  isUser  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700' :
                            'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-bl-sm italic'
                }`}>
                  {h.message}
                </div>

                {/* Timestamp */}
                {h.timestamp && (
                  <span className={`text-xs px-1 ${isAgent ? 'text-right text-gray-400' : 'text-gray-400'}`}>
                    {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Avatar right */}
              {isAgent && (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  A
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />

        {/* New message pill — floats when user has scrolled up */}
        {showNewPill && (
          <button
            onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowNewPill(false) }}
            className="sticky bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg transition-colors z-10"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            New message ↓
          </button>
        )}
      </div>

      {/* ── Reply box ── */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {canReply ? (
          <div className="px-4 py-3 flex items-center gap-3">
            <input
              ref={inputRef}
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
              placeholder="Type your reply…"
              className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <div className="px-5 py-3 flex items-center gap-2">
            <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed select-none">
              {session.status === 'closed'
                ? 'Session resolved — no further replies'
                : session.status === 'open'
                ? 'AI is handling this — click "Transfer to Human" to take over'
                : 'Click "Transfer to Human" above to unlock replies'}
            </div>
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 opacity-30">
              <Send className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Staff management panel ─────────────────────────────────────────────────────

function StaffPanel({ token }: { token: string }) {
  const [list, setList]         = useState<StaffMember[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name: '', email: '', password: '' })
  const [adding, setAdding]     = useState(false)
  const [error, setError]       = useState('')

  const load = useCallback(() => {
    apiClient.listStaffMembers(token).then(setList).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setError('')
    try {
      await apiClient.createStaffMember(token, form)
      setForm({ name: '', email: '', password: '' }); setShowForm(false); load()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create')
    } finally { setAdding(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Deactivate this staff member?')) return
    await apiClient.deleteStaffMember(id, token).catch(() => {})
    load()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Staff Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">People who can claim and reply to sessions</p>
          </div>
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Staff
          </button>
        </div>

        {showForm && (
          <form onSubmit={addStaff} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">New Staff Member</h3>
            {[
              { key: 'name', label: 'Full name', type: 'text' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'password', label: 'Password', type: 'password' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} required
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>
            ))}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-xl"
              >Cancel</button>
              <button type="submit" disabled={adding}
                className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl"
              >
                {adding ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {list.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-2xl px-4 py-3.5 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.presence === 'online' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {s.active_chat_count > 0 && (
                  <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                    {s.active_chat_count} active
                  </span>
                )}
                <span className={`text-xs font-medium ${s.presence === 'online' ? 'text-green-500' : 'text-gray-400'}`}>
                  {s.presence}
                </span>
                <button onClick={() => remove(s.id)} className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No staff members yet</p>
              <p className="text-xs mt-1 opacity-70">Add your first staff member above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Session list item ──────────────────────────────────────────────────────────

function SessionItem({ session, selected, isUnread, onClick }: {
  session: Session; selected: boolean; isUnread: boolean; onClick: () => void
}) {
  const dot: Record<string, string> = {
    escalated: 'bg-yellow-400', queued: 'bg-blue-400',
    active: 'bg-green-400', open: 'bg-gray-300 dark:bg-gray-600', closed: 'bg-gray-200',
  }
  const ts  = session.escalated_at || session.last_message_at
  const ago = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 group
        ${selected
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500'
          : isUnread
          ? 'bg-emerald-50 dark:bg-emerald-900/15 border-l-2 border-l-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/25'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
    >
      {/* Status dot — or a pulsing green dot when there are unread messages */}
      {isUnread ? (
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      ) : (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot[session.status] ?? 'bg-gray-300'}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-sm truncate ${isUnread ? 'font-semibold text-emerald-900 dark:text-emerald-200' : 'font-medium text-gray-900 dark:text-white'}`}>
            {session.title || 'Untitled session'}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isUnread && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">New</span>}
            <span className="text-xs text-gray-400">{ago}</span>
          </div>
        </div>
        {session.escalation_reason && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{session.escalation_reason}</p>
        )}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
    </button>
  )
}

// ── Collapsible session group ──────────────────────────────────────────────────

const GROUP_HEADER: Record<string, string> = {
  yellow: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/10',
  green:  'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/10',
  blue:   'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10',
  gray:   'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40',
}

function SessionGroup({ label, count, color, sessions, selectedId, unreadIds, onSelect }: {
  label: string; count: number; color: string
  sessions: Session[]; selectedId: string | null; unreadIds: string[]
  onSelect: (s: Session) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const groupUnread = sessions.filter(s => unreadIds.includes(s.id)).length
  return (
    <>
      <button onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold border-b border-gray-100 dark:border-gray-800 ${GROUP_HEADER[color] ?? GROUP_HEADER.gray}`}
      >
        <span className="flex items-center gap-1.5">
          {label} · {count}
          {groupUnread > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full leading-none animate-pulse">
              {groupUnread}
            </span>
          )}
        </span>
        <span className="opacity-40 text-base leading-none">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && sessions.map(s => (
        <SessionItem key={s.id} session={s}
          selected={s.id === selectedId}
          isUnread={unreadIds.includes(s.id)}
          onClick={() => onSelect(s)}
        />
      ))}
    </>
  )
}

// ── Main Inbox ─────────────────────────────────────────────────────────────────

export function Inbox() {
  const token                 = useAppStore(s => s.token)
  const unreadSessionIds      = useAppStore(s => s.unreadSessionIds)
  const clearUnreadSession    = useAppStore(s => s.clearUnreadSession)
  const inboxEvent            = useAppStore(s => s.inboxEvent)
  const setActiveInboxSession = useAppStore(s => s.setActiveInboxSession)

  const [sessions, setSessions]        = useState<Session[]>([])
  const [selectedSession, setSelected] = useState<Session | null>(null)
  const [loading, setLoading]          = useState(false)
  const [view, setView]                = useState<'chat' | 'staff'>('chat')
  const [chatReload, setChatReload]    = useState(0)
  const selectedSessionRef = useRef<Session | null>(null)
  // Callback registered by the open ChatView — lets us push messages instantly
  const chatAppendRef      = useRef<((item: HistoryItem) => void) | null>(null)

  // ── Browser tab title ─────────────────────────────────────────────────────
  useEffect(() => {
    const count = unreadSessionIds.length
    const base  = 'SUPPORT247.chat'
    document.title = count > 0 ? `(${count}) New message${count > 1 ? 's' : ''} — ${base}` : base
    return () => { document.title = base }
  }, [unreadSessionIds])

  const loadSessions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const d = await apiClient.listInboxSessions(token)
      setSessions(Array.isArray(d) ? d : [])
    } catch (err) {
      console.error('Inbox loadSessions:', err)
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadSessions() }, [loadSessions])

  // React to events from the app-level inbox stream (in the Sidebar).
  // The stream itself lives in useInboxStream so notifications keep arriving
  // on every page; here we only handle screen-local reactions.
  useEffect(() => {
    if (!inboxEvent) return
    const { type, data } = inboxEvent
    if (type === 'queue_updated' || type === 'new_session') {
      loadSessions()
    } else if (type === 'customer_message') {
      try {
        const d = JSON.parse(data)
        if (selectedSessionRef.current?.id === d.session_id) {
          // Push into the open chat directly — no API round-trip
          if (chatAppendRef.current) {
            chatAppendRef.current({
              role:      d.role ?? 'user',
              message:   d.message,
              timestamp: d.timestamp ?? new Date().toISOString(),
            })
          } else {
            setChatReload(n => n + 1)
          }
        } else {
          // Unread marking is done centrally in useInboxStream; just refresh the list
          loadSessions()
        }
      } catch { /* ignore malformed event */ }
    }
  }, [inboxEvent?.seq])  // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [
    { key: 'escalated', label: 'Waiting',    color: 'yellow', statuses: ['escalated', 'queued'] },
    { key: 'active',    label: 'Active',      color: 'green',  statuses: ['active'] },
    { key: 'open',      label: 'All Chats',   color: 'gray',   statuses: ['open'] },
    { key: 'closed',    label: 'Resolved',    color: 'gray',   statuses: ['closed'] },
  ]

  // Tell the app-level stream which session is open so it doesn't mark it unread
  useEffect(() => {
    return () => setActiveInboxSession(null)
  }, [setActiveInboxSession])

  const handleSelect = (s: Session) => {
    setSelected(s)
    selectedSessionRef.current = s
    setActiveInboxSession(s.id)
    setView('chat')
    clearUnreadSession(s.id)
  }
  const handleClose  = () => { setSelected(null); selectedSessionRef.current = null; setActiveInboxSession(null) }
  const handleResolved = () => { setSelected(null); selectedSessionRef.current = null; setActiveInboxSession(null); loadSessions() }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left sidebar ── */}
      <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', overflowY: 'auto' }}
        className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
          <button onClick={loadSessions}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Groups */}
        {groups.map(g => {
          const list = sessions.filter(s => g.statuses.includes(s.status))
          if (list.length === 0) return null
          return (
            <SessionGroup key={g.key} label={g.label} count={list.length} color={g.color}
              sessions={list} selectedId={selectedSession?.id ?? null}
              unreadIds={unreadSessionIds}
              onSelect={handleSelect}
            />
          )
        })}

        {sessions.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No sessions yet</p>
          </div>
        )}

        {/* Staff tab */}
        <div className="mt-auto border-t border-gray-100 dark:border-gray-800">
          <button onClick={() => { setView('staff'); setSelected(null) }}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors
              ${view === 'staff' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            <Users className="w-4 h-4" />
            Manage Staff
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {view === 'staff' ? (
          <StaffPanel token={token} />
        ) : selectedSession ? (
          <ChatView
            key={selectedSession.id}
            session={selectedSession}
            token={token}
            onClose={handleClose}
            onResolved={handleResolved}
            reloadTrigger={chatReload}
            registerAppend={(fn) => { chatAppendRef.current = fn }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-400">
            <InboxIcon className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Select a session</p>
            <p className="text-xs mt-1 text-gray-400">Click any session on the left to open it</p>
          </div>
        )}
      </div>
    </div>
  )
}
