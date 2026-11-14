import { YulloButton } from '../../../components/core/YulloButton'
import { ArrowLeft, ExternalLink, Eye, EyeOff, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import type { AppearanceSpaceSummary } from '../../../api/appearance'
import { getBaseDomain } from '../../../config'
import { spaceBranch, useSpaceHierarchy } from '../../../api/spaces'

interface Props {
  dirty: boolean
  draftSaved?: boolean
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  saved: boolean
  space: AppearanceSpaceSummary
  togglingLive: boolean
  onBack: () => void
  onToggleLive: () => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onSave: () => void
}

export function AppearanceHeader(props: Props) {
  const hierarchy = useSpaceHierarchy()
  const branch = spaceBranch(hierarchy.data ?? [], props.space.id)
  const publicPath = branch.length ? branch.map(node => node.slug).join('/') : props.space.isSubspace ? undefined : props.space.slug
  return (
    <header className="appearance-toolbar">
      <div className="appearance-toolbar-title">
        <YulloButton variant="outline" type="button" size="icon" onClick={props.onBack} aria-label="Back to Space"><ArrowLeft size={19} /></YulloButton>
        <div>
        <h1 className="font-[Satoshi] text-[clamp(26px,3vw,34px)] font-medium tracking-tight">Appearance</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]"><span className={`appearance-live-dot ${props.space.status === 'live' ? 'is-live' : ''}`} />{props.space.status === 'live' ? 'Live' : 'Private'} · {publicPath ? <a href={`/${publicPath}`} target="_blank" rel="noreferrer">{getBaseDomain()}/{publicPath} <ExternalLink size={12} /></a> : <span>{hierarchy.isError ? 'Public link unavailable' : 'Loading public link…'}</span>}</p>
        </div>
      </div>
      <div className="appearance-toolbar-actions flex flex-wrap items-center justify-end gap-1 sm:gap-2">
        {props.dirty && <span className="mr-2 text-xs text-[var(--text-secondary)]">{props.draftSaved ? 'Draft saved · not published' : 'Unsaved changes'}</span>}
        <YulloButton variant="outline" size="sm" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Undo appearance change"><Undo2 size={17} /> <span className="hidden sm:inline">Undo</span></YulloButton>
        <YulloButton variant="outline" size="sm" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Redo appearance change"><Redo2 size={17} /> <span className="hidden sm:inline">Redo</span></YulloButton>
        <YulloButton variant="outline" size="sm" onClick={props.onReset} disabled={!props.dirty} aria-label="Reset appearance"><RotateCcw size={17} /> <span className="hidden sm:inline">Reset</span></YulloButton>
        <YulloButton variant="outline" size="sm" onClick={props.onToggleLive} disabled={props.dirty || props.togglingLive} aria-label={props.space.status === 'live' ? 'Hide link' : 'Make live'} title={props.dirty ? 'Save appearance before changing visibility' : undefined}>{props.space.status === 'live' ? <EyeOff size={17} /> : <Eye size={17} />} <span className="hidden sm:inline">{props.space.status === 'live' ? 'Hide link' : 'Make live'}</span></YulloButton>
        <YulloButton variant="primary"  onClick={props.onSave} disabled={!props.dirty || props.saving}>
          {props.saving ? 'Saving…' : props.saved ? 'Saved' : 'Save appearance'}
        </YulloButton>
      </div>
    </header>
  )
}
