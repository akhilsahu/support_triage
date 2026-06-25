import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, TrendingUp, Bot, Database, Activity, ArrowRight, ExternalLink, Loader2, Bell } from 'lucide-react'
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
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function Dashboard() {
  const navigate = useNavigate()
  const { spaceSlug, token, unreadSessionIds } = useAppStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [waitingCount, setWaitingCount] = useState(0)

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
        setWaitingCount(sessions.filter(s => ['escalated', 'queued'].includes(s.status)).length)
      })
      .catch(() => {})
  }, [token])

  const statCards = stats ? [
    {
      label: 'Total Messages',
      value: stats.total_messages.toLocaleString(),
      icon: MessageSquare,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-900/30',
      delta: `+${stats.messages_24h} today`,
    },
    {
      label: 'RAG Hit Rate',
      value: `${stats.rag_hit_rate}%`,
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
      delta: 'Last 7 days',
    },
    {
      label: 'Active Agents',
      value: stats.active_agents.toString(),
      icon: Bot,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
      delta: stats.active_agents > 0 ? 'Running' : 'None active',
    },
    {
      label: 'Knowledge Base',
      value: stats.kb_doc_count.toString(),
      icon: Database,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/30',
      delta: `${stats.kb_doc_count} document${stats.kb_doc_count !== 1 ? 's' : ''}`,
    },
  ] : []

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold mb-1">Welcome to SUPPORT247.chat</h2>
            <p className="text-indigo-100 text-sm">Your AI-powered multi-agent customer support platform is running.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {spaceSlug && (
              <a
                href={`/${spaceSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Customer Chat
              </a>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/app/chat')}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              Start Chat <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Unread / waiting sessions alert */}
      {(unreadSessionIds.length > 0 || waitingCount > 0) && (
        <button
          onClick={() => navigate('/app/inbox')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <span className="relative flex-shrink-0">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
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
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(s => {
              const Icon = s.icon
              return (
                <Card key={s.label} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.bg}`}>
                      <Icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{s.delta}</p>
                </Card>
              )
            })}
          </div>

          {/* Chart + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Messages This Week</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total conversations per day</p>
                  </div>
                  {stats && stats.total_messages > 0 && (
                    <Badge variant="success">Last 7 days</Badge>
                  )}
                </div>
                {stats && stats.messages_per_day.every(d => d.msgs === 0) ? (
                  <div className="flex items-center justify-center h-[180px] text-sm text-gray-400">
                    No messages yet — start chatting to see data here.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={stats?.messages_per_day || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" />
                      <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Area type="monotone" dataKey="msgs" stroke="#6366f1" strokeWidth={2} fill="url(#colorMsgs)" name="Messages" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            {/* Recent activity */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                {!stats?.recent_activity?.length && (
                  <p className="text-xs text-gray-400 italic">No activity yet.</p>
                )}
                {stats?.recent_activity.map((a, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">🤖</span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed truncate">{a.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{a.agent_slug.replace(/_/g, ' ')}</span>
                        {a.intent && <span className="text-xs text-indigo-400">{a.intent}</span>}
                        <span className="text-xs text-gray-400 ml-auto">{timeAgo(a.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Agent Fleet Status */}
          {stats && stats.fleet.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Fleet Status</h3>
                <button onClick={() => navigate('/app/agents')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                  Manage agents <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.fleet.map(agent => {
                  const t = getAgentTheme(agent.name)
                  return (
                    <Card key={agent.slug} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{agent.icon}</span>
                        <StatusDot status={agent.active ? 'active' : 'idle'} />
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 leading-tight truncate">{agent.name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${t.badge}`}>
                        {agent.active ? 'Active' : 'Standby'}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{agent.description}</p>
                    </Card>
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
