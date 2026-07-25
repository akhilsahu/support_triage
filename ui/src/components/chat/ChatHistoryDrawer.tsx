import { useEffect, useState } from 'react'
import { X, MessageSquare, Plus } from 'lucide-react'
import { fetchCustomerSessions, type CustomerSession } from '../../lib/customerAuth'

// Past-conversation drawer for a signed-in customer.
//
// Identity is platform-wide (see app/models/chatbot_user.py), so this lists the
// customer's chats everywhere they've been: the space they're currently in on
// top, then every other space, grouped by brand. Picking one resumes it —
// same-space via ?chat=, another space by navigating to that brand's chat page.

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function ChatHistoryDrawer({
  open, onClose, currentSlug, currentSessionId, isDark, onResume, onNewChat,
}: {
  open: boolean
  onClose: () => void
  currentSlug: string
  currentSessionId?: string
  isDark: boolean
  onResume: (session: CustomerSession) => void
  onNewChat: () => void
}) {
  const [sessions, setSessions] = useState<CustomerSession[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchCustomerSessions(currentSlug)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [open, currentSlug])

  if (!open) return null

  const mine   = sessions.filter(s => s.is_current_space)
  const others = sessions.filter(s => !s.is_current_space)

  // Group the other spaces so the list reads as "brand -> conversations".
  const otherGroups: { slug: string; name: string; logo: string | null; items: CustomerSession[] }[] = []
  for (const s of others) {
    let g = otherGroups.find(x => x.slug === s.space_slug)
    if (!g) {
      g = { slug: s.space_slug, name: s.space_name, logo: s.space_logo_url, items: [] }
      otherGroups.push(g)
    }
    g.items.push(s)
  }

  const panelCls = isDark
    ? 'bg-[#0f0f1a] border-white/10 text-white'
    : 'bg-white border-slate-200 text-slate-900'
  const mutedCls  = isDark ? 'text-indigo-200/50' : 'text-slate-400'
  const rowCls    = isDark ? 'hover:bg-white/[0.06] border-white/[0.06]' : 'hover:bg-slate-50 border-slate-100'
  const activeCls = isDark ? 'bg-white/[0.08]' : 'bg-indigo-50'

  const Row = ({ s }: { s: CustomerSession }) => (
    <button
      onClick={() => { onResume(s); onClose() }}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors
                  ${rowCls} ${s.id === currentSessionId ? activeCls : ''}`}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${mutedCls}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium truncate">{s.title}</p>
          <p className={`text-[11px] mt-0.5 ${mutedCls}`}>
            {timeAgo(s.last_message_at)}
            {s.message_count ? ` · ${s.message_count} message${s.message_count === 1 ? '' : 's'}` : ''}
          </p>
        </div>
      </div>
    </button>
  )

  return (
    <>
      {/* Scrim */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <aside className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm border-r shadow-2xl
                         flex flex-col ${panelCls}`}>
        <header className={`flex items-center justify-between px-4 py-3.5 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <h2 className="text-[14px] font-semibold">Your conversations</h2>
          <button onClick={onClose} aria-label="Close history"
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <button
            onClick={() => { onNewChat(); onClose() }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium ${rowCls}`}
          >
            <Plus className="w-3.5 h-3.5" /> New conversation
          </button>

          {loading && <p className={`text-[12px] px-1 ${mutedCls}`}>Loading…</p>}

          {!loading && sessions.length === 0 && (
            <p className={`text-[12px] px-1 ${mutedCls}`}>
              No saved conversations yet. Ones you have while signed in show up here.
            </p>
          )}

          {mine.length > 0 && (
            <section className="space-y-1.5">
              <p className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] px-1 ${mutedCls}`}>
                This chatbot
              </p>
              {mine.map(s => <Row key={s.id} s={s} />)}
            </section>
          )}

          {otherGroups.map(g => (
            <section key={g.slug} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                {g.logo
                  ? <img src={g.logo} alt="" className="w-3.5 h-3.5 rounded object-cover" />
                  : <span className={`w-3.5 h-3.5 rounded ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />}
                <p className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] truncate ${mutedCls}`}>
                  {g.name}
                </p>
              </div>
              {g.items.map(s => <Row key={s.id} s={s} />)}
            </section>
          ))}
        </div>
      </aside>
    </>
  )
}
