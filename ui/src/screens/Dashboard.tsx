import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, TrendingUp, Bot, Database, Activity,
  ArrowRight, ExternalLink, Loader2, Bell, Zap, Sparkles, ChevronRight
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useDashboardTheme } from '../config/dashboardTheme'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'
import { Badge } from '../components/ui/Badge'
import { motion, AnimatePresence, Variants } from 'framer-motion'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
}

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

const DASHBOARD_THEMES = {
  violet: {
    banner:   'from-indigo-600/90 via-violet-600/90 to-purple-600/90',
    shadow:   'shadow-violet-500/10 dark:shadow-violet-900/20',
    stat0:    ['from-violet-500',  'to-indigo-500'],
    stat1:    ['from-teal-400',    'to-emerald-500'],
    stat2:    ['from-indigo-500',  'to-blue-500'],
    stat3:    ['from-amber-400',   'to-orange-500'],
    chart0:   '#8b5cf6',
    chart1:   '#06b6d4',
    activity: 'from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20',
    actIcon:  'text-violet-600 dark:text-violet-400',
  },
  ocean: {
    banner:   'from-blue-600/90 via-cyan-600/90 to-teal-600/90',
    shadow:   'shadow-blue-500/10 dark:shadow-blue-900/20',
    stat0:    ['from-blue-500',    'to-cyan-500'],
    stat1:    ['from-teal-400',    'to-emerald-500'],
    stat2:    ['from-cyan-500',    'to-sky-500'],
    stat3:    ['from-sky-400',     'to-blue-500'],
    chart0:   '#3b82f6',
    chart1:   '#06b6d4',
    activity: 'from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20',
    actIcon:  'text-blue-600 dark:text-blue-400',
  },
  sunset: {
    banner:   'from-orange-500/90 via-pink-500/90 to-purple-600/90',
    shadow:   'shadow-orange-500/10 dark:shadow-orange-900/20',
    stat0:    ['from-orange-500',  'to-pink-500'],
    stat1:    ['from-pink-500',    'to-rose-500'],
    stat2:    ['from-purple-500',  'to-indigo-500'],
    stat3:    ['from-amber-400',   'to-orange-500'],
    chart0:   '#f97316',
    chart1:   '#ec4899',
    activity: 'from-orange-500/10 to-pink-500/10 dark:from-orange-500/20 dark:to-pink-500/20',
    actIcon:  'text-orange-600 dark:text-orange-400',
  },
  forest: {
    banner:   'from-emerald-600/90 via-teal-600/90 to-cyan-600/90',
    shadow:   'shadow-emerald-500/10 dark:shadow-emerald-900/20',
    stat0:    ['from-emerald-500', 'to-teal-500'],
    stat1:    ['from-teal-400',    'to-cyan-500'],
    stat2:    ['from-green-500',   'to-emerald-500'],
    stat3:    ['from-cyan-400',    'to-teal-500'],
    chart0:   '#10b981',
    chart1:   '#06b6d4',
    activity: 'from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20',
    actIcon:  'text-emerald-600 dark:text-emerald-400',
  },
} as const

export function Dashboard() {
  const navigate = useNavigate()
  const { spaceSlug, token, unreadSessionIds, dashboardTheme } = useAppStore()
  const dt = DASHBOARD_THEMES[dashboardTheme ?? 'violet']
  const theme = useDashboardTheme()
  const [stats, setStats]           = useState<DashboardStats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [waitingCount, setWaiting]  = useState(0)
  const [usage, setUsage]           = useState<{ total_tokens: number; total_calls: number } | null>(null)

  useEffect(() => {
    apiClient.getUsageSummary()
      .then(setUsage)
      .catch(() => {})
  }, [])

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
    { label: 'Total Messages',  value: stats.total_messages.toLocaleString(), icon: MessageSquare, from: dt.stat0[0], to: dt.stat0[1], delta: `+${stats.messages_24h} today` },
    { label: 'RAG Hit Rate',    value: `${stats.rag_hit_rate}%`,              icon: TrendingUp,   from: dt.stat1[0], to: dt.stat1[1], delta: 'Last 7 days' },
    { label: 'Active Agents',   value: stats.active_agents.toString(),        icon: Bot,          from: dt.stat2[0], to: dt.stat2[1], delta: stats.active_agents > 0 ? 'Running now' : 'None active' },
    { label: 'Knowledge Docs',  value: stats.kb_doc_count.toString(),         icon: Database,     from: dt.stat3[0], to: dt.stat3[1], delta: `${stats.kb_doc_count} document${stats.kb_doc_count !== 1 ? 's' : ''}` },
    ...(usage && usage.total_calls > 0 ? [{
      label: 'AI Tokens (30d)',
      value: usage.total_tokens.toLocaleString(),
      icon: Zap,
      from: dt.stat0[1], to: dt.stat1[0],
      delta: `${usage.total_calls} call${usage.total_calls !== 1 ? 's' : ''}`,
    }] : []),
  ] : []

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-6 text-gray-900 dark:text-gray-100 antialiased font-sans">

      {/* ── Apple-style Glass Banner ───────────────────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${dt.banner} backdrop-blur-xl p-7 text-white shadow-2xl ${dt.shadow} border border-white/25 dark:border-white/10 transition-all duration-300`}
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 20px 40px -10px rgba(0,0,0,0.15)' }}
      >
        {/* Ambient background light spot */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-6 flex-wrap z-10">
          <div className="space-y-1.5 max-w-lg">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-semibold tracking-wide text-white/90 shadow-sm">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>OVERVIEW & INTELLIGENCE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
              Welcome to SUPPORT247
            </h1>
            <p className="text-white/80 text-sm leading-relaxed font-normal">
              Real-time multi-agent support orchestrator, knowledge base retrieval, and live customer inbox.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {spaceSlug && (
              <motion.a
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                href={`/${spaceSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-xl transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                <ExternalLink className="w-4 h-4" /> Customer Chat
              </motion.a>
            )}
            <motion.div whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/app/chat')}
                className="bg-white text-gray-900 hover:bg-white/90 border-none shadow-md font-semibold px-4 py-2.5 text-xs sm:text-sm rounded-2xl transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                Test Chat <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ── Inbox Banner Alert ────────────────────────────────────────────── */}
      <AnimatePresence>
        {(unreadSessionIds.length > 0 || waitingCount > 0) && (
          <motion.button
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={() => navigate('/app/inbox')}
            className="w-full overflow-hidden flex items-center justify-between gap-4 px-5 py-4 bg-amber-500/10 dark:bg-amber-400/10 backdrop-blur-xl border border-amber-500/30 dark:border-amber-400/25 rounded-2xl text-left hover:bg-amber-500/15 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none transition-colors shadow-sm group"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="relative flex-shrink-0 p-2.5 rounded-xl bg-amber-500/20 dark:bg-amber-400/20 text-amber-600 dark:text-amber-300">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200 tracking-tight">
                  {unreadSessionIds.length > 0
                    ? `${unreadSessionIds.length} unread session${unreadSessionIds.length > 1 ? 's' : ''} in Inbox`
                    : `${waitingCount} session${waitingCount > 1 ? 's' : ''} waiting for human response`}
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/70 font-medium">Click to open customer support inbox</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-sm font-medium tracking-wide">Syncing metrics…</span>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* ── Stat Cards Grid (Translucent Apple Glass Cards) ─────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
            {statCards.map(s => {
              const Icon = s.icon
              return (
                <motion.div
                  variants={itemVariants}
                  whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                  whileTap={{ scale: 0.96 }}
                  key={s.label}
                  className="group relative overflow-hidden bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/70 dark:border-gray-700/60 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors duration-300"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}
                >
                  <div className="flex items-center justify-between mb-3.5">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${s.from} ${s.to} flex items-center justify-center shadow-md shadow-indigo-500/10 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 tracking-tight">
                      {s.delta}
                    </span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                    {s.value}
                  </p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 tracking-normal">
                    {s.label}
                  </p>
                </motion.div>
              )
            })}
          </div>

          {/* ── Analytics & Activity Section ────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Chart Card */}
            <motion.div variants={itemVariants} className="lg:col-span-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/70 dark:border-gray-700/60 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    Weekly Message Volume
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-normal">Daily total customer messages across all bots</p>
                </div>
                {stats && stats.total_messages > 0 && (
                  <Badge variant="success">Last 7 Days</Badge>
                )}
              </div>

              {stats && stats.messages_per_day.every(d => d.msgs === 0) ? (
                <div className="flex flex-col items-center justify-center h-[200px] gap-2 text-center p-4">
                  <MessageSquare className="w-9 h-9 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm font-medium text-gray-400">No activity logged yet this week.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={stats?.messages_per_day || []} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="appleChartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={dt.chart0} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={dt.chart1} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="appleStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor={dt.chart0} />
                        <stop offset="100%" stopColor={dt.chart1} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      cursor={{ stroke: 'rgba(99, 102, 241, 0.2)', strokeWidth: 2, strokeDasharray: '4 4' }}
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(229, 231, 235, 0.8)',
                        borderRadius: '16px',
                        fontSize: '13px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                      }}
                      labelStyle={{ fontWeight: 700, color: '#0f172a' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="msgs"
                      stroke="url(#appleStrokeGrad)"
                      strokeWidth={3}
                      fill="url(#appleChartGradient)"
                      name="Messages"
                      activeDot={{ r: 6, fill: dt.chart0, stroke: '#fff', strokeWidth: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            {/* Recent Activity Card (Law of Common Region applied) */}
            <motion.div variants={itemVariants} className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/70 dark:border-gray-700/60 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2 tracking-tight">
                <Activity className={`w-4 h-4 ${theme.textAccent}`} />
                Live Agent Telemetry
              </h2>
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                {!stats?.recent_activity?.length && (
                  <p className="text-xs text-gray-400 italic py-8 text-center">No recent activity logged.</p>
                )}
                {stats?.recent_activity.map((a, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={i} 
                    className="flex items-start gap-3 group p-2.5 -mx-2 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${dt.activity} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                      <Bot className={`w-4 h-4 ${dt.actIcon}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-800 dark:text-gray-200 font-medium leading-tight line-clamp-2">
                        {a.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {a.agent_slug.replace(/_/g, ' ')}
                        </span>
                        {a.intent && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 ${theme.textAccent}`}>
                            {a.intent}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-medium ml-auto whitespace-nowrap">
                          {timeAgo(a.timestamp)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

          </div>

          {/* ── Agent Fleet Grid ────────────────────────────────────────────── */}
          {stats && stats.fleet.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h2 className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">Active Agent Fleet</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">Specialized AI agents ready to handle customer inquiries</p>
                </div>
                <button
                  onClick={() => navigate('/app/agents')}
                  className={`text-xs font-bold ${theme.textAccent} ${theme.hoverAccent} flex items-center gap-1 transition-colors px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none`}
                >
                  Manage fleet <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {stats.fleet.map((agent, i) => {
                  const t = getAgentTheme(agent.name)
                  return (
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                      whileTap={{ scale: 0.96 }}
                      key={agent.slug}
                      onClick={() => navigate('/app/agents')}
                      className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/70 dark:border-gray-700/60 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:border-indigo-400/50 dark:hover:border-indigo-500/50 transition-colors duration-300 cursor-pointer flex flex-col justify-between focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}
                      tabIndex={0}
                      role="button"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{agent.icon}</span>
                          <StatusDot status={agent.active ? 'active' : 'idle'} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-snug truncate">
                          {agent.name}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${t.badge}`}>
                          {agent.active ? 'Active' : 'Standby'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-2 leading-relaxed font-normal">
                        {agent.description}
                      </p>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}
