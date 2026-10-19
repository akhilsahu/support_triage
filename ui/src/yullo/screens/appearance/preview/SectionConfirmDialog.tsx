import { useEffect, useRef } from 'react'
import { Eye, EyeOff, Sparkles, X } from 'lucide-react'

export interface SectionConfirmation {
  action: 'hide' | 'unhide' | 'build'
  label: string
  confirm: () => void
}

export function SectionConfirmDialog({ request, onClose }: { request: SectionConfirmation | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal()
    if (!request && dialog.current?.open) dialog.current.close()
  }, [request])
  const action = request?.action || 'build'
  const Icon = action === 'build' ? Sparkles : action === 'hide' ? EyeOff : Eye
  const verb = action === 'build' ? 'Build with AI' : action === 'hide' ? 'Hide section' : 'Unhide section'
  return <dialog ref={dialog} className="appearance-confirm" aria-labelledby="section-confirm-title" aria-describedby="section-confirm-description" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="appearance-confirm-body">
      <button type="button" className="appearance-confirm-close" aria-label="Close confirmation" onClick={onClose}><X size={18} /></button>
      <div className="appearance-confirm-symbol"><Icon size={25} strokeWidth={1.6} /></div>
      <span className="appearance-confirm-label">{request?.label}</span>
      <h2 id="section-confirm-title">{action === 'build' ? 'Give this section a fresh draft.' : action === 'hide' ? 'Set this section aside?' : 'Bring this section back?'}</h2>
      <p id="section-confirm-description">{action === 'build' ? 'Aura will use your approved Space details to fill this section. Review the result and choose Apply when it feels right.' : action === 'hide' ? 'Its content stays saved. A quiet placeholder keeps its place, ready for you to unhide anytime.' : 'Restore the content in this space. You can then refine it or build a new draft with AI.'}</p>
      <div className="appearance-confirm-note">{action === 'build' ? 'You decide what goes live.' : 'You can change this anytime.'}</div>
      <div className="appearance-confirm-actions">
        <button type="button" autoFocus onClick={onClose}>Cancel</button>
        <button type="button" className="appearance-confirm-primary" onClick={() => { request?.confirm(); onClose() }}><Icon size={16} />{verb}</button>
      </div>
    </div>
  </dialog>
}
