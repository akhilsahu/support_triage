import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, TrendingUp, Bot, Database, Activity,
  ArrowRight, ExternalLink, Loader2, Bell, Zap,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatusDot } from '../components/ui/StatusDot'
import { Button } from '../components/ui/Button'
import { getAgentTheme } from '../config/theme'
import { apiClient } from '../api/client'

interface DashboardStats {
  total_messages: number
  messages_24h: number
  rag_hit_rate: number
  active_agents: number
  kb_doc_count: number
  messages_per_day: { day: string; date: string; msgs: number }[]
  recent_activity: { agent_slug: string; message: string; intent: string | null; timestamp: string | null }[]
  fleet: { slug: string; name: string; icon: string; active: boolean; is_builtin: boolean; agent_type: string; description: string }[]
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function Dashboard() {
  const navigate = useNavigate()
  const { spaceSlug, token, unreadSessionIds } = useAppStore()
  const [stats, setStats]           = useState<DashboardStats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [waitingCount, setWaiting]  = useState(0)

  useEffect(() => {
    apiClient.getDashboardStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!token) return
    apiClient.listInboxSessions(token)
      .then((sessions: any[]) => {
        setWaiting(sessions.filter(s => ['escalated', 'queued'].includes(s.status)).length)
      })
      .catch(() => {})
  }, [token])

  const statCards = stats ? [
    {
      label: 'Total Messages',
      value: stats.total_messages.toLocaleString(),
      icon: MessageSquare,
      from: 'from-violet-500',
      to:   'to-indigo-500',
      bg:   'bg-violet-50 dark:bg-violet-900/20',
      text: 'text-violet-700 dark:text-violet-300',
      delta: `+${stats.messages_24h} today`,
      deltaColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'RAG Hit Rate',
      value: `${stats.rag_hit_rate}%`,
      icon: TrendingUp,
      from: 'from-teal-500',
      to:   'to-emerald-500',
      bg:   'bg-teal-50 dark:bg-teal-900/20',
      text: 'text-teal-700 dark:text-teal-300',
      delta: 'Last 7 days',
      deltaColor: 'text-teal-600 dark:text-teal-400',
    },
    {
      label: 'Active Agents',
      value: stats.active_agents.toString(),
      icon: Bot,
      from: 'from-indigo-500',
      to:   'to-blue-500',
      bg:   'bg-indigo-50 dark:bg-indigo-900/20',
      text: 'text-indigo-700 dark:text-indigo-300',
      delta: stats.active_agents > 0 ? 'Running now' : 'None active',
      deltaColor: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: 'Knowledge Docs',
      value: stats.kb_doc_count.toString(),
      icon: Database,
      from: 'from-orange-400',
      to:   'to-pink-500',
      bg:   'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-700 dark:text-orange-300',
      delta: `${stats.kb_doc_count} document${stats.kb_doc_count !== 1 ? 's' : ''}`,
      deltaColor: 'text-orange-600 dark:text-orange-400',
    },
  ] : []

  return (
    <div className="p-5 sm:p-7 space-y-6">

      {/* ── Welcome banner ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-teal-500 p-6 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
        {/* Soft inner glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)] pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-yellow-300" />
              <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Dashboard</p>
            </div>
            <h2 className="text-xl font-extrabold text-white mb-1 tracking-tight">
              Welcome to SUPPORT247.chat
            </h2>
            <p className="text-indigo-100 text-sm leading-relaxed max-w-md">
              Your AI-powered multi-agent support platform is live and running.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {spaceSlug && (
              <a
                href={`/${spaceSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Customer Chat
              </a>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/app/chat')}
              className="bg-white/15 hover:bg-white/25 text-white border-white/20 backdrop-blur-sm"
            >
              Test Chat <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Inbox alert ─────────────────────────────────────────────────────── */}
      {(unreadSessionIds.length > 0 || waitingCount > 0) && (
        <button
          onClick={() => navigate('/app/inbox')}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors shadow-sm"
        >
          <span className="relative flex-shrink-0">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              {unreadSessionIds.length > 0
                ? `${unreadSessionIds.length} unread message${unreadSessionIds.length > 1 ? 's' : ''} in Inbox`
                : `${waitingCount} session${waitingCount > 1 ? 's' : ''} waiting for human support`}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Click to open Inbox</p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
        </button>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading dashboard…</span>
        </div>
      ) : (
        <>
          {/* ── Stat cards ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.from} ${s.to} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">{s.value}</p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  <p className={`text-xs mt-1.5 font-bold ${s.deltaColor}`}>{s.delta}</p>
                </div>
              )
            })}
          </div>

          {/* ── Chart + Activity ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Area chart */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Messages This Week</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total conversations per day</p>
                </div>
                {stats && stats.total_messages > 0 && (
                  <Badge variant="success">Last 7 days</Badge>
                )}
              </div>

              {stats && stats.messages_per_day.every(d => d.msgs === 0) ? (
                <div className="flex flex-col items-center justify-center h-[180px] gap-2">
                  <MessageSquare className="w-8 h-8 text-gray-200 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">No messages yet — start chatting to see data.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={stats?.messages_per_day || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="chatGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-700" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-400 dark:text-gray-500" />
                    <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-400 dark:text-gray-500" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                      }}
                      labelStyle={{ fontWeight: 700, color: '#1e293b' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="msgs"
                      stroke="url(#strokeGrad)"
                      strokeWidth={2.5}
                      fill="url(#chatGradient)"
                      name="Messages"
                    />
                    <defs>
                      <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#14b8a6" />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-500" />
                Recent Activity
              </h3>
              <div className="space-y-3.5">
                {!stats?.recent_activity?.length && (
                  <p className="text-xs text-gray-400 italic">No activity yet.</p>
                )}
                {stats?.recent_activity.map((a, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-100 to-teal-100 border border-violet-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed truncate font-medium">{a.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400 font-medium">{a.agent_slug.replace(/_/g, ' ')}</span>
                        {a.intent && <span className="text-[11px] text-violet-400 font-semibold">{a.intent}</span>}
                        <span className="text-[11px] text-gray-400 ml-auto">{timeAgo(a.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Agent Fleet ──────────────────────────────────────────────────── */}
          {stats && stats.fleet.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Agent Fleet</h3>
                <button
                  onClick={() => navigate('/app/agents')}
                  className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-800 flex items-center gap-1 transition-colors"
                >
                  Manage agents <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.fleet.map(agent => {
                  const t = getAgentTheme(agent.name)
                  return (
                    <div key={agent.slug}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm hover:shadow-md hover:border-violet-100 transition-all">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-xl">{agent.icon}</span>
                        <StatusDot status={agent.active ? 'active' : 'idle'} />
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-tight truncate">{agent.name}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${t.badge}`}>
                        {agent.active ? 'Active' : 'Standby'}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed">{agent.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
