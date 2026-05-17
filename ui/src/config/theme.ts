// Central theme config — all colors, spacing, typography constants in one place.
// Components should import from here rather than hardcoding Tailwind classes.
export const theme = {
  colors: {
    primary: 'indigo',
    agents: {
      triage:       { bg: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',    dot: 'bg-blue-500'    },
      logistics:    { bg: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', dot: 'bg-emerald-500' },
      finance:      { bg: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',  dot: 'bg-purple-500'  },
      order:        { bg: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',  dot: 'bg-orange-500'  },
      support:      { bg: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',    dot: 'bg-teal-500'    },
      custom:       { bg: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',  dot: 'bg-indigo-500'  },
    },
    sentiment: {
      negative: 'bg-red-400',
      neutral:  'bg-yellow-400',
      positive: 'bg-green-400',
    }
  },
  radius: 'rounded-lg',
  shadow: 'shadow-sm',
  transition: 'transition-all duration-200',
} as const

export type AgentType = keyof typeof theme.colors.agents

export function getAgentTheme(agentLabel: string) {
  const lower = agentLabel.toLowerCase()
  if (lower.includes('finance'))  return theme.colors.agents.finance
  if (lower.includes('logistics') || lower.includes('shipping')) return theme.colors.agents.logistics
  if (lower.includes('order'))    return theme.colors.agents.order
  if (lower.includes('support')) return theme.colors.agents.support
  if (lower.includes('triage'))   return theme.colors.agents.triage
  return theme.colors.agents.custom
}

export function getSentimentColor(score: number) {
  if (score < 0.35) return theme.colors.sentiment.negative
  if (score < 0.65) return theme.colors.sentiment.neutral
  return theme.colors.sentiment.positive
}

export function getSentimentLabel(score: number) {
  if (score < 0.35) return '😠 Frustrated'
  if (score < 0.5)  return '😕 Concerned'
  if (score < 0.75) return '🙂 Neutral'
  return '😊 Positive'
}
