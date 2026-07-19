import { useState, useEffect } from 'react'
import { MessageSquare, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { format, formatDistanceToNow } from 'date-fns'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'

interface AnalyticsData {
  period_days: number
  total_messages: number
  rag_hits: number
  rag_hit_rate: number | null
  avg_response_ms: number | null
  messages_today: number
  messages_yesterday: number
  daily_messages: { date: string; count: number }[]
  intent_distribution: Record<string, number>
  agent_distribution: Record<string, number>
  escalation_rate: number | null
  recent_conversations: { message: string; intent: string | null; timestamp: string }[]
}

const AGENT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#6366f1']
const INTENT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f97316']

export function Analytics() {
  const currentChatbotId = useAppStore(s => s.currentChatbotId)
  const [data, setData]     = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiClient.getAnalytics(7, currentChatbotId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [currentChatbotId])

  if (loading) {
    return <div className="p-6"><p className="text-sm text-gray-400 italic">Loading analytics…</p></div>
  }
  if (!data) {
    return <div className="p-6"><p className="text-sm text-gray-400 italic">Could not load analytics.</p></div>
  }

  const messagesDelta = data.messages_today - data.messages_yesterday
  const deltaLabel = messagesDelta === 0
    ? 'Same as yesterday'
    : `${messagesDelta > 0 ? '+' : ''}${messagesDelta} vs yesterday`

  const messagesDeltaVariant: 'success' | 'danger' = messagesDelta >= 0 ? 'success' : 'danger'

  const statCards: { label: string; value: string; icon: typeof MessageSquare; color: string; bg: string; delta: string; variant: 'success' | 'danger' | 'default' }[] = [
    {
      label: 'Messages Today', value: String(data.messages_today), icon: MessageSquare,
      color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30',
      delta: deltaLabel, variant: messagesDeltaVariant,
    },
    {
      label: 'Avg Response Time', value: data.avg_response_ms != null ? `${(data.avg_response_ms / 1000).toFixed(1)}s` : '—',
      icon: Clock, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30',
      delta: `Last ${data.period_days} days`, variant: 'default',
    },
    {
      label: 'RAG Hit Rate', value: data.rag_hit_rate != null ? `${data.rag_hit_rate}%` : '—',
      icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30',
      delta: `Last ${data.period_days} days`, variant: 'default',
    },
    {
      label: 'Escalation Rate', value: data.escalation_rate != null ? `${data.escalation_rate}%` : '—',
      icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30',
      delta: 'Sessions needing a human', variant: 'default',
    },
  ]

  const dailyChartData = data.daily_messages.map(d => ({ day: format(new Date(d.date), 'EEE'), msgs: d.count }))
  const intentChartData = Object.entries(data.intent_distribution).map(([intent, count]) => ({ intent, count }))
  const agentChartData = Object.entries(data.agent_distribution).map(([agent, handled], i) => ({
    agent, handled, color: AGENT_COLORS[i % AGENT_COLORS.length],
  }))
  const maxAgentHandled = Math.max(1, ...agentChartData.map(a => a.handled))

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.bg}`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <Badge variant={s.variant} className="text-xs">{s.delta}</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily messages */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Messages — Last {data.period_days} Days</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Daily conversation volume</p>
          </div>
          {dailyChartData.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-8 text-center">No messages in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradMsgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-gray-500" />
                <YAxis tick={{ fontSize: 11 }} className="text-gray-500" allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="msgs" stroke="#6366f1" strokeWidth={2} fill="url(#gradMsgs)" name="Messages" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Intent distribution */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Intent Distribution</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">What customers ask about</p>
          </div>
          {intentChartData.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-8 text-center">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={intentChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="intent" tick={{ fontSize: 11 }} className="text-gray-500" />
                <YAxis tick={{ fontSize: 11 }} className="text-gray-500" allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="count" name="Messages" radius={[4, 4, 0, 0]}>
                  {intentChartData.map((_, i) => (
                    <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent usage */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Workload</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Messages handled per agent</p>
          </div>
          {agentChartData.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-8 text-center">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {agentChartData.map(a => {
                const pct = (a.handled / maxAgentHandled) * 100
                return (
                  <div key={a.agent}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{a.agent}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{a.handled} messages</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: a.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Recent conversations — honest substitute for "top questions"; free-text
            rarely repeats exactly, so we show the latest few instead of a fake ranking. */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Questions</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Latest customer messages</p>
          </div>
          {data.recent_conversations.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-8 text-center">No conversations yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recent_conversations.map((c, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 min-w-0 truncate">{c.message}</span>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    {formatDistanceToNow(new Date(c.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
