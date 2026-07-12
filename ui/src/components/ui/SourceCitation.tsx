import { useState } from 'react'
import { ChevronDown, FileText, BookOpen } from 'lucide-react'
import type { SourceItem } from '../../types'
import { cn } from './cn'

interface SourceCitationProps {
  sources: SourceItem[]
  dark?: boolean   // true for dark/indigo themes in CustomerChat
}

export function SourceCitation({ sources, dark = false }: SourceCitationProps) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 text-[12px] font-medium transition-colors',
          dark
            ? 'text-indigo-300/70 hover:text-indigo-200'
            : 'text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200',
        )}
      >
        <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
        {sources.length} source{sources.length > 1 ? 's' : ''}
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl border p-3',
                dark
                  ? 'bg-white/[0.04] border-white/[0.08]'
                  : 'bg-slate-50 border-slate-200 dark:bg-gray-700/60 dark:border-gray-600',
              )}
            >
              {/* Header row */}
              <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                <FileText className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', dark ? 'text-indigo-300/60' : 'text-indigo-500 dark:text-indigo-400')} />
                <span className={cn('text-[12px] font-semibold truncate max-w-[180px]', dark ? 'text-indigo-200' : 'text-indigo-700 dark:text-indigo-300')}>
                  {s.filename || 'Document'}
                </span>
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                  dark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
                )}>
                  p.{s.page}
                </span>
                {(s as any).kb_name && (
                  <span className={cn('text-[10px] truncate', dark ? 'text-white/30' : 'text-slate-400')}>
                    {(s as any).kb_name}
                  </span>
                )}
                {s.score > 0 && (
                  <span className={cn('ml-auto text-[10px] tabular-nums', dark ? 'text-white/25' : 'text-slate-400')}>
                    {(s.score * 100).toFixed(0)}% match
                  </span>
                )}
              </div>

              {/* Excerpt */}
              {s.excerpt && (
                <p className={cn(
                  'text-[12px] leading-relaxed line-clamp-3',
                  dark ? 'text-white/50' : 'text-slate-600 dark:text-gray-300',
                )}>
                  "{s.excerpt}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
