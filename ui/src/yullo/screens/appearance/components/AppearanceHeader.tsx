import { ArrowLeft, ExternalLink, Eye, EyeOff, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import type { AppearanceSpaceSummary } from '../../../api/appearance'

interface Props {
  dirty: boolean
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
  return (
    <header className="appearance-toolbar">
      <div className="appearance-toolbar-title">
        <button type="button" className="appearance-back" onClick={props.onBack} aria-label="Back to Space"><ArrowLeft size={19} /></button>
        <div>
        <h1 className="font-[Satoshi] text-[clamp(26px,3vw,34px)] font-medium tracking-tight">Appearance</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]"><span className={`appearance-live-dot ${props.space.status === 'live' ? 'is-live' : ''}`} />{props.space.status === 'live' ? 'Live' : 'Private'} · <a href={`/${props.space.slug}`} target="_blank" rel="noreferrer">yullo.com/{props.space.slug} <ExternalLink size={12} /></a></p>
        </div>
      </div>
      <div className="appearance-toolbar-actions flex flex-wrap items-center justify-end gap-1 sm:gap-2">
        {props.dirty && <span className="mr-2 text-xs text-[var(--text-secondary)]">Unsaved changes</span>}
        <button className="appearance-quiet-action" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Undo appearance change"><Undo2 size={17} /> <span className="hidden sm:inline">Undo</span></button>
        <button className="appearance-quiet-action" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Redo appearance change"><Redo2 size={17} /> <span className="hidden sm:inline">Redo</span></button>
        <button className="appearance-quiet-action" onClick={props.onReset} disabled={!props.dirty}><RotateCcw size={17} /> <span className="hidden sm:inline">Reset</span></button>
        <button className="appearance-quiet-action" onClick={props.onToggleLive} disabled={props.dirty || props.togglingLive} title={props.dirty ? 'Save appearance before changing visibility' : undefined}>{props.space.status === 'live' ? <EyeOff size={17} /> : <Eye size={17} />} <span className="hidden sm:inline">{props.space.status === 'live' ? 'Hide link' : 'Make live'}</span></button>
        <button className="appearance-save" onClick={props.onSave} disabled={!props.dirty || props.saving}>
          {props.saving ? 'Saving…' : props.saved ? 'Saved' : 'Save appearance'}
        </button>
      </div>
    </header>
  )
}
