/**
 * SpaceInbox — Brand Owner Support Operations Console.
 * Built with rich dashboard layout alignment, glowing status dots, 
 * micro-animations, and direct Claim, Reply, and Transfer operations.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare, CheckCircle, Clock, Send,
  RefreshCw, ArrowRightLeft, Users, Plus, Trash2, Inbox as InboxIcon,
  AlertCircle, ShieldAlert,
} from 'lucide-react'
import apiClient from '../api/client'
import { useAppStore } from '../store/useAppStore'
import { fetchSSE } from '../lib/fetchSSE'
import { API_CONFIG } from '../config/api'

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

interface HistoryItem {
  role: string
  message: string
  timestamp: string | null
}

interface StaffMember {
  id: string
  name: string
  email: string
  presence: string
  active_chat_count: number
}

// ── Transfer Modal ─────────────────────────────────────────────────────────────

function TransferModal({ token, sessionId, onClose, onDone }: {
  token: string; sessionId: string; onClose: () => void; onDone: () => void
}) {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selected, setSelected]   = useState('')
  const [sending, setSending]     = useState(false)

  useEffect(() => {
    apiClient.listStaffMembers(token).then(setStaffList).catch(() => {})
  }, [token])

  const doTransfer = async () => {
    if (!selected) return
    setSending(true)
    try { 
      await apiClient.transferSession(sessionId, selected, token)
      onDone() 
    } catch { 
      setSending(false) 
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl transform transition-all duration-300 scale-100">
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <ArrowRightLeft className="w-5 h-5" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Transfer Support Session</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Select an online staff member to handle this customer chat.</p>
        
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 min-h-0">
          {staffList.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between transition-all ${
                selected === s.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-indigo-500/20'
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold truncate">{s.name}</p>
                <p className={`text-[10px] ${selected === s.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {s.active_chat_count} active chats
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                s.presence === 'online'
                  ? (selected === s.id ? 'bg-indigo-500 text-white' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400')
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}>
                {s.presence}
              </span>
            </button>
          ))}
          {staffList.length === 0 && (
            <div className="text-center py-6 text-slate-400">
              <Users className="w-8 h-8 mx-auto opacity-30 mb-1" />
              <p className="text-xs">No support staff configured</p>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={doTransfer}
            disabled={!selected || sending}
            className="flex-1 py-2.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            {sending ? 'Transferring…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Chat Panel ─────────────────────────────────────────────────────────────────

function ChatPanel({ sessionId, token, onResolved, displayName }: {
  sessionId: string; token: string; onResolved: () => void; displayName?: string
}) {
  const [session, setSession]           = useState<any>(null)
  const [history, setHistory]           = useState<HistoryItem[]>([])
  const [showTransfer, setShowTransfer] = useState(false)
  const [replyText, setReplyText]       = useState('')
  const [sending, setSending]           = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getInboxSession(sessionId, token)
      setSession(data)
      setHistory(data.history ?? [])
    } catch {}
  }, [sessionId, token])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history])

  const resolve = async () => {
    if (!confirm('Mark this support session as resolved?')) return
    try { 
      await apiClient.resolveSession(sessionId, token)
      onResolved() 
    } catch {}
  }

  const claim = async () => {
    try {
      await apiClient.claimSession(sessionId, token)
      load()
      onResolved()
    } catch {}
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      await apiClient.replySession(sessionId, replyText.trim(), token)
      setReplyText('')
      load()
      onResolved()
    } catch {}
    finally { setSending(false) }
  }

  if (!session) return (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80">
      <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-500" /> Loading chat thread…
    </div>
  )

  const isClaimed = session.status === 'active'

  return (
    <div className="flex flex-col h-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-md flex-1 min-h-0">
      {showTransfer && (
        <TransferModal token={token} sessionId={sessionId}
          onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); onResolved() }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 flex-shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {session.title || 'Support Session'}
          </h2>
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mt-1 text-[11px]">
            <span className="capitalize">{session.status}</span>
            <span>·</span>
            <span>{session.message_count} messages</span>
            {session.escalation_reason && (
              <>
                <span>·</span>
                <span className="text-amber-500 font-semibold">Escalated: {session.escalation_reason}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl font-semibold transition-all cursor-pointer border border-slate-200/40 dark:border-slate-700/60"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-505" />
            Transfer
          </button>
          <button onClick={resolve}
            className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Resolve
          </button>
        </div>
      </div>

      {/* Claim Banner for waiting or open sessions */}
      {(!isClaimed && session.status !== 'closed') && (
        <div className="bg-gradient-to-r from-amber-500/10 to-indigo-500/5 dark:from-amber-500/5 dark:to-indigo-500/5 border-b border-amber-500/20 px-5 py-3 flex items-center justify-between flex-shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500 animate-bounce" />
            <span className="text-xs text-amber-800 dark:text-amber-300 font-semibold">
              {session.status === 'open' ? 'This conversation is currently active with AI Agent.' : 'This escalated session is waiting in the queue.'}
            </span>
          </div>
          <button onClick={claim}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30"
          >
            Claim Session
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0 bg-slate-50/30 dark:bg-slate-950/40">
        {history.map((h, i) => {
          const isAgent = h.role === 'human_agent'
          const isUser  = h.role === 'user'
          return (
            <div key={i} className={`flex ${isAgent ? 'justify-end' : 'justify-start'} animate-slideIn`}>
              <div className="max-w-md flex flex-col items-start gap-1">
                <span className={`text-[10px] text-slate-400 dark:text-slate-500 font-semibold px-1.5 ${isAgent ? 'self-end' : ''}`}>
                  {isAgent ? (displayName || 'Support Owner') : isUser ? 'Customer' : h.role}
                </span>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-all duration-150 ${
                  isAgent
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                    : isUser
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/50 dark:border-slate-800'
                    : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 rounded-tl-none italic'
                }`}>
                  {h.message}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Chat Input or read-only status banner */}
      {isClaimed ? (
        <form onSubmit={sendReply} className="px-5 py-3.5 border-t border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex gap-2.5 items-center flex-shrink-0">
          <input
            type="text"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Type support reply here..."
            className="flex-1 px-4 py-2.5 text-sm bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-all shadow-inner"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!replyText.trim() || sending}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-all cursor-pointer shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : session.status === 'closed' ? (
        <div className="px-5 py-4 bg-slate-100/50 dark:bg-slate-950/40 border-t border-slate-200/60 dark:border-slate-800/60 text-center text-xs text-slate-400 dark:text-slate-500 font-semibold flex-shrink-0 flex items-center justify-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          This support session has been resolved and closed.
        </div>
      ) : (
        <div className="px-5 py-4 bg-slate-100/50 dark:bg-slate-950/40 border-t border-slate-200/60 dark:border-slate-800/60 text-center text-xs text-slate-400 dark:text-slate-500 font-semibold flex-shrink-0 flex items-center justify-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-indigo-500" />
          You must claim this session before typing replies.
        </div>
      )}
    </div>
  )
}

// ── Staff Panel ────────────────────────────────────────────────────────────────

function StaffPanel({ token }: { token: string }) {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [form, setForm]           = useState({ name: '', email: '', password: '' })
  const [showForm, setShowForm]   = useState(false)
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(() => {
    apiClient.listStaffMembers(token).then(setStaffList).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true); setError('')
    try {
      await apiClient.createStaffMember(token, form)
      setForm({ name: '', email: '', password: '' })
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create staff member')
    } finally { setAdding(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Deactivate this staff member?')) return
    await apiClient.deleteStaffMember(id, token).catch(() => {})
    load()
  }

  return (
    <div className="h-full flex flex-col bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-md flex-1 overflow-hidden p-5 min-h-0 animate-fadeIn">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-500" />
            Support Staff
          </h2>
          <p className="text-[10px] text-slate-505 dark:text-slate-400">Configure dedicated inbox agents</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/10"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Member
        </button>
      </div>

      {showForm && (
        <form onSubmit={addStaff} className="bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-4 space-y-3 border border-slate-200/40 dark:border-slate-800/60 mb-4 animate-slideIn flex-shrink-0">
          {[
            { key: 'name', label: 'Display Name', type: 'text' },
            { key: 'email', label: 'Staff Email Address', type: 'email' },
            { key: 'password', label: 'Security Password', type: 'password' },
          ].map(f => (
            <input key={f.key} type={f.type} placeholder={f.label}
              value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              required
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          ))}
          {error && <p className="text-red-505 text-[10px] font-semibold">{error}</p>}
          <button type="submit" disabled={adding}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg py-2.5 shadow-md shadow-indigo-600/15 transition-all cursor-pointer"
          >
            {adding ? 'Creating…' : 'Save Staff Member'}
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {staffList.map(s => (
          <div key={s.id} className="flex items-center justify-between bg-white/40 dark:bg-slate-900/30 rounded-xl px-4 py-3 border border-slate-200/30 dark:border-slate-800/40 hover:border-indigo-500/15 transition-all">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{s.name}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{s.email}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${s.presence === 'online' ? 'text-emerald-500' : 'text-slate-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.presence === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {s.presence}
              </span>
              {s.active_chat_count > 0 && (
                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                  {s.active_chat_count} active
                </span>
              )}
              <button onClick={() => remove(s.id)} className="text-slate-300 dark:text-slate-600 hover:text-red-505 transition-colors cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {staffList.length === 0 && (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
            <Users className="w-10 h-10 opacity-30 mb-2" />
            <p className="text-xs font-semibold">No configured staff members yet</p>
            <p className="text-[10px] text-slate-500 mt-1">Configure staff to scale your operations</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Session Item Card ─────────────────────────────────────────────────────────

function SessionItem({ session, selected, onClick }: {
  session: Session; selected: boolean; onClick: () => void
}) {
  const isEscalated = session.status === 'escalated'
  const isQueued = session.status === 'queued'
  const isClosed = session.status === 'closed'
  
  // High-fidelity glowing colors for dots
  const statusColor = isEscalated 
    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' 
    : isQueued 
    ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
    : isClosed
    ? 'bg-slate-400'
    : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
    
  const dateStr = session.escalated_at
    ? new Date(session.escalated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : session.last_message_at
    ? new Date(session.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
    
  return (
    <button onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 ${
        selected
          ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-500/30 dark:border-indigo-500/20 shadow-md shadow-indigo-100/10'
          : 'bg-white/60 dark:bg-slate-900/60 border-slate-200/40 dark:border-slate-800/60 hover:border-indigo-500/20 hover:bg-white/80 dark:hover:bg-slate-900/80 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor} ${isEscalated || isQueued ? 'animate-pulse' : ''}`} />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{session.title || 'Anonymous Chat'}</p>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex-shrink-0">{dateStr}</span>
      </div>
      
      {session.escalation_reason && (
        <div className="inline-flex items-center gap-1 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 rounded-md px-2 py-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-semibold w-fit animate-fadeIn">
          <AlertCircle className="w-3 h-3 flex-shrink-0 text-amber-500" />
          {session.escalation_reason}
        </div>
      )}
      
      <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
          isEscalated 
            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200/30'
            : isQueued
            ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200/30'
            : isClosed
            ? 'bg-slate-100 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 border border-slate-200/30'
            : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/30'
        }`}>
          {session.status}
        </span>
        <span className="font-medium">{session.message_count} messages</span>
      </div>
    </button>
  )
}

// ── Session Group Component ───────────────────────────────────────────────────

interface SessionGroupProps {
  label: string
  count: number
  color: 'amber' | 'indigo' | 'slate' | 'emerald'
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function SessionGroup({ label, count, color, sessions, selectedId, onSelect }: SessionGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  
  const colors = {
    amber: {
      header: 'bg-amber-500/5 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/10',
      badge: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-200/20',
    },
    indigo: {
      header: 'bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/10',
      badge: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 border-indigo-200/20',
    },
    slate: {
      header: 'bg-slate-500/5 hover:bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/10',
      badge: 'bg-slate-100 dark:bg-slate-800/40 text-slate-800 dark:text-slate-400 border-slate-200/20',
    },
    emerald: {
      header: 'bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/10',
      badge: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-200/20',
    },
  }

  const activeColor = colors[color] || colors.slate

  return (
    <div className="space-y-1.5 transition-all">
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold border rounded-lg transition-all cursor-pointer ${activeColor.header}`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${color === 'amber' ? 'bg-amber-500 animate-pulse' : color === 'indigo' ? 'bg-indigo-500 animate-pulse' : color === 'emerald' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border uppercase tracking-wider ${activeColor.badge}`}>
            {count}
          </span>
          <span className="text-[10px] opacity-60 transform transition-transform duration-200" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
            ▼
          </span>
        </div>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 pl-0.5 animate-fadeIn">
          {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              selected={s.id === selectedId}
              onClick={() => onSelect(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main SpaceInbox ────────────────────────────────────────────────────────────

export function SpaceInbox() {
  const token = useAppStore(s => s.token)
  const displayName = useAppStore(s => s.spaceName)
  const [sessions, setSessions]     = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [rightPanel, setRightPanel] = useState<'session' | 'staff'>('session')
  const sseRef = useRef<AbortController | null>(null)

  const loadSessions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await apiClient.listInboxSessions(token)
      setSessions(data)
    } catch {} finally { setLoading(false) }
  }, [token])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // SSE for real-time updates — token sent in Authorization header, never in URL
  useEffect(() => {
    if (!token) return
    const ctrl = new AbortController()
    sseRef.current = ctrl

    fetchSSE({
      url: `${API_CONFIG.baseURL}/api/v1/inbox/stream`,
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      onEvent: (type) => {
        if (type === 'queue_updated' || type === 'new_session') loadSessions()
      },
      onError: (err) => console.error('[SpaceInbox SSE] error', err),
    })

    return () => { ctrl.abort(); sseRef.current = null }
  }, [token, loadSessions])

  const waiting = sessions.filter(s => s.status === 'queued' || s.status === 'escalated')
  const active  = sessions.filter(s => s.status === 'active')
  const open    = sessions.filter(s => s.status === 'open')
  const closed  = sessions.filter(s => s.status === 'closed')

  return (
    <div className="flex-1 min-h-0 p-6 flex flex-col select-none overflow-hidden h-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Sessions list (Left col) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col h-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden p-4.5 shadow-md min-h-0 animate-fadeIn">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Support Queue
              </h2>
              <p className="text-[10px] text-slate-505 dark:text-slate-400">Manage escalated & customer chats</p>
            </div>
            <button onClick={loadSessions} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
            {waiting.length > 0 && (
              <SessionGroup
                label="Waiting Claim"
                count={waiting.length}
                color="amber"
                sessions={waiting}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setRightPanel('session') }}
              />
            )}

            {active.length > 0 && (
              <SessionGroup
                label="Active Claims"
                count={active.length}
                color="indigo"
                sessions={active}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setRightPanel('session') }}
              />
            )}

            {open.length > 0 && (
              <SessionGroup
                label="Open Customer Chats"
                count={open.length}
                color="emerald"
                sessions={open}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setRightPanel('session') }}
              />
            )}

            {closed.length > 0 && (
              <SessionGroup
                label="Resolved / Closed"
                count={closed.length}
                color="slate"
                sessions={closed}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setRightPanel('session') }}
              />
            )}

            {sessions.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 dark:text-slate-505 py-16 animate-fadeIn">
                <Clock className="w-8 h-8 opacity-40 animate-pulse text-indigo-500" />
                <p className="text-xs font-semibold">Queue is clear</p>
                <p className="text-[10px] text-slate-500 text-center">No escalated or customer chats at the moment</p>
              </div>
            )}
          </div>

          {/* Staff view button */}
          <button
            onClick={() => { setRightPanel('staff'); setSelectedId(null) }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all w-full mt-4 flex-shrink-0 justify-center cursor-pointer border ${
              rightPanel === 'staff'
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 border-indigo-600'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 border-slate-200/50 dark:border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Inbox Agent Configuration
          </button>
        </div>

        {/* Main chat window (Right col) */}
        <div className="lg:col-span-8 xl:col-span-9 h-full overflow-hidden flex flex-col min-h-0">
          {rightPanel === 'staff' ? (
            <StaffPanel token={token} />
          ) : selectedId ? (
            <ChatPanel
              key={selectedId}
              sessionId={selectedId}
              token={token}
              displayName={displayName}
              onResolved={() => { setSelectedId(null); loadSessions() }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-8 shadow-lg text-center animate-fadeIn">
              <div className="relative w-20 h-20 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-indigo-500/10 dark:border-indigo-500/5">
                <div className="absolute inset-0 rounded-2xl bg-indigo-500/5 blur-md animate-pulse" />
                <InboxIcon className="w-10 h-10 text-indigo-600 dark:text-indigo-400 relative z-10" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Support Operations Workspace</h3>
              <p className="text-xs text-slate-505 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
                Select any customer conversation thread from the queue list to monitor status, claim, type replies, or delegate to staff.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
