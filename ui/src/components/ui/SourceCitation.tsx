import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import type { SourceItem } from '../../types'
import { cn } from './cn'

interface SourceCitationProps { sources: SourceItem[] }

export function SourceCitation({ sources }: SourceCitationProps) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors font-medium">
        <FileText className="w-3.5 h-3.5" />
        {sources.length} source{sources.length > 1 ? 's' : ''}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {sources.map((s, i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {s.filename && <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{s.filename}</span>}
                <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs rounded font-medium">p.{s.page}</span>
                {s.section && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.section}</span>}
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{(s.score * 100).toFixed(0)}% match</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{s.excerpt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
