import { FileText, Loader2, AlertCircle, RotateCw } from 'lucide-react'
import { Card } from '../ui/Card'
import type { IngestionJob } from '../../api/client'

// A document still being ingested (or one that failed), shown alongside the
// finished documents in a knowledge base. Backed by app/models/ingestion_job.py
// -- the row disappears once the job completes and the real KB item appears.

const STATUS_LABEL: Record<string, string> = {
  queued:   'Queued',
  parsing:  'Reading document',
  chunking: 'Splitting into chunks',
  indexing: 'Indexing',
}

export function IngestionJobRow({ job, onRetry }: { job: IngestionJob; onRetry?: () => void }) {
  const failed = job.status === 'failed'

  return (
    <Card className={`p-3 ${failed ? 'border-red-200 dark:border-red-900/50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          failed ? 'bg-red-50 dark:bg-red-900/20' : 'bg-indigo-50 dark:bg-indigo-900/20'
        }`}>
          {failed
            ? <AlertCircle className="w-4 h-4 text-red-500" />
            : <FileText className="w-4 h-4 text-indigo-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{job.filename}</p>

          {failed ? (
            <p className="text-xs text-red-500 dark:text-red-400 line-clamp-2" title={job.error || ''}>
              {job.error || 'Processing failed.'}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-500 flex-shrink-0" />
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {job.stage_detail || STATUS_LABEL[job.status] || 'Processing'}
                </p>
              </div>
              {/* Large documents take minutes; the bar is the only signal that
                  anything is still happening. */}
              <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(3, job.progress))}%` }}
                />
              </div>
            </>
          )}
        </div>

        {failed && onRetry && (
          <button onClick={onRetry}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    </Card>
  )
}
