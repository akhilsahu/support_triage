import { useCallback, useState } from 'react'
import type { SpacePresentationConfig } from '../presentation/schema'

interface HistoryState {
  past: SpacePresentationConfig[]
  present: SpacePresentationConfig
  future: SpacePresentationConfig[]
}

export function useAppearanceHistory(initial: SpacePresentationConfig) {
  const [state, setState] = useState<HistoryState>({ past: [], present: initial, future: [] })

  const apply = useCallback((next: SpacePresentationConfig) => {
    setState((current) => {
      if (JSON.stringify(current.present) === JSON.stringify(next)) return current
      return { past: [...current.past, current.present], present: next, future: [] }
    })
  }, [])

  const undo = useCallback(() => setState((current) => {
    const previous = current.past[current.past.length - 1]
    if (!previous) return current
    return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
  }), [])

  const redo = useCallback(() => setState((current) => {
    const next = current.future[0]
    if (!next) return current
    return { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
  }), [])

  const replace = useCallback((next: SpacePresentationConfig) => {
    setState({ past: [], present: next, future: [] })
  }, [])

  return {
    draft: state.present,
    apply,
    undo,
    redo,
    replace,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
