import { MessageSquare, Clock, TrendingUp, Star } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'

const WEEKLY_MESSAGES = [
  { day: 'Mon', msgs: 23 },
  { day: 'Tue', msgs: 41 },
  { day: 'Wed', msgs: 38 },
  { day: 'Thu', msgs: 55 },
  { day: 'Fri', msgs: 47 },
  { day: 'Sat', msgs: 29 },
  { day: 'Sun', msgs: 62 },
]

const INTENT_DIST = [
  { intent: 'Shipping',  count: 34 },
  { intent: 'Refund',    count: 28 },
  { intent: 'Tech',      count: 19 },
  { intent: 'Order',     count: 15 },
  { intent: 'Account',   count: 8  },
]

const AGENT_USAGE = [
  { agent: 'Triage',    handled: 89, color: '#3b82f6' },
  { agent: 'Logistics', handled: 34, color: '#10b981' },
  { agent: 'Finance',   handled: 28, color: '#8b5cf6' },
  { agent: 'Order',     handled: 15, color: '#f97316' },
  { agent: 'Tech',      handled: 19, color: '#14b8a6' },
]

const TOP_QUESTIONS = [
  { q: 'Where is my order?',                count: 24 },
  { q: 'How do I get a refund?',             count: 18 },
  { q: 'My package was damaged',             count: 14 },
  { q: 'Setup guide for product',            count: 11 },
  { q: 'Cancel my subscription',             count: 9  },
]

const INTENT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f97316']

const STAT_CARDS = [
  { label: 'Messages Today',   value: '89',    icon: MessageSquare, color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-50 dark:bg-indigo-900/30',  delta: '+14 vs yesterday', trend: 'up' },
  { label: 'Avg Response Time', value: '1.2s',  icon: Clock,         color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', delta: '-0.3s vs avg',     trend: 'up' },
  { label: 'RAG Hit Rate',      value: '91%',   icon: TrendingUp,    color: 'text-purple-600 dark:text-purple-400',  bg: 'bg-purple-50 dark:bg-purple-900/30',  delta: '+4% this week',    trend: 'up' },
  { label: 'Satisfaction',      value: '4.6/5', icon: Star,          color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-50 dark:bg-orange-900/30',  delta: 'Excellent',        trend: 'up' },
]

export function Analytics() {
  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.bg}`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <Badge variant="success" className="text-xs">{s.delta}</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly messages */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Messages — Last 7 Days</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Daily conversation volume</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={WEEKLY_MESSAGES} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMsgs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-gray-500" />
              <YAxis tick={{ fontSize: 11 }} className="text-gray-500" />
              <Tooltip
                contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
              />
              <Area type="monotone" dataKey="msgs" stroke="#6366f1" strokeWidth={2} fill="url(#gradMsgs)" name="Messages" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Intent distribution */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Intent Distribution</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">What customers ask about</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={INTENT_DIST} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="intent" tick={{ fontSize: 11 }} className="text-gray-500" />
              <YAxis tick={{ fontSize: 11 }} className="text-gray-500" />
              <Tooltip
                contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="count" name="Tickets" radius={[4, 4, 0, 0]}>
                {INTENT_DIST.map((_, i) => (
                  <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent usage */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Workload</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Conversations handled per agent</p>
          </div>
          <div className="space-y-3">
            {AGENT_USAGE.map(a => {
              const max = Math.max(...AGENT_USAGE.map(x => x.handled))
              const pct = (a.handled / max) * 100
              return (
                <div key={a.agent}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{a.agent}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{a.handled} conversations</span>
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
        </Card>

        {/* Top questions */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top Questions</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Most frequently asked questions</p>
          </div>
          <div className="space-y-2">
            {TOP_QUESTIONS.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 min-w-0 truncate">{item.q}</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {item.count}x
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
