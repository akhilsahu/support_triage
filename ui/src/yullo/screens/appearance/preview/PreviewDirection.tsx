import { RotateCw } from 'lucide-react'

export function PreviewDirection({
  status,
  isGenerating,
  groundedCount,
  lastUpdate,
  explanation,
  onRebuild
}: {
  status: 'idle' | 'ready' | 'insufficient_context' | 'unavailable'
  isGenerating: boolean
  groundedCount: number
  lastUpdate: number
  explanation?: string
  onRebuild: () => void
}) {
  return (
    <div className="preview-direction-bar">
      <div className="preview-direction-header">
        <h3 className="preview-direction-title">PREVIEW DIRECTION</h3>
      </div>
      <div className="preview-direction-content">
        <div className="preview-direction-message">
          {isGenerating ? (
            <p aria-live="polite">Building a section from this Space…</p>
          ) : status === 'ready' ? (
            <p aria-live="polite">{explanation || `Built from ${groundedCount} confirmed details`}{lastUpdate ? ' · refreshed just now' : ''}</p>
          ) : status === 'unavailable' ? (
            <p aria-live="polite">{explanation || 'Could not rebuild. The current preview is unchanged.'}</p>
          ) : (
            <p aria-live="polite">{explanation || 'Add confirmed Space details for a tailored preview.'}{lastUpdate ? ' · checked just now' : ''}</p>
          )}
        </div>
        <button
          type="button"
          className="preview-direction-rebuild"
          onClick={() => onRebuild()}
          disabled={isGenerating}
          aria-label="Rebuild layout with AI"
        >
          <RotateCw size={14} className="rebuild-icon" />
          Rebuild layout with AI
        </button>
      </div>
    </div>
  )
}

