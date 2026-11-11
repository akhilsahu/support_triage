import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { appearanceApi } from '../../../api/appearance'
import type { SpacePresentationConfig } from '../presentation/schema'
import {
  type AppearancePreviewContent,
  type AppearancePreviewSection,
  type AppearancePreviewItem,
  type PreviewStatus,
  type PreviewSectionType,
} from './types'

interface PreviewState {
  status: PreviewStatus | 'idle'
  content: AppearancePreviewContent | null
  lastUpdate: number
  isGenerating: boolean
  explanation?: string
}

const idleState: PreviewState = {
  status: 'idle',
  content: null,
  lastUpdate: 0,
  isGenerating: false,
}

function previewFailureMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Could not rebuild the preview. Your current preview is unchanged.'
  }
  if (error.response?.status === 429) {
    return 'Too many rebuild attempts. Your current preview is unchanged. Try again in one minute.'
  }
  if (error.response?.status === 403) {
    return 'Your secure session could not be refreshed. Reload this page and try again.'
  }
  const detail = error.response?.data?.detail
  return typeof detail === 'string' && detail.length <= 160
    ? detail
    : 'Could not rebuild the preview. Your current preview is unchanged.'
}

export function useAppearancePreview(
  spaceId: string,
  currentConfig: SpacePresentationConfig,
) {
  const [state, setState] = useState<PreviewState>(idleState)
  const contentRef = useRef(state.content)
  contentRef.current = state.content
  const abortRef = useRef<AbortController | null>(null)
  const requestRef = useRef(0)
  const configRef = useRef(currentConfig)
  configRef.current = currentConfig

  const generatePreview = useCallback(async (force = false, sectionType?: PreviewSectionType) => {
    if (!spaceId) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestRef.current
    setState((current) => ({ ...current, isGenerating: true }))

    try {
      const data = await appearanceApi.generatePreview(
        spaceId,
        { currentConfig: configRef.current, force, sectionType, currentContent: contentRef.current || undefined },
        controller.signal,
      )
      if (requestId !== requestRef.current) return
      if (data.status === 'unavailable') {
        setState((current) => ({
          ...current,
          status: 'unavailable',
          explanation: data.explanation || 'Could not rebuild the preview. Your current preview is unchanged.',
          isGenerating: false,
        }))
        return
      }
      const newSections = sectionType && data.content
        ? data.content.sections.filter((section) => section.type === sectionType)
        : data.content?.sections || []
      const sectionMissing = Boolean(sectionType && newSections.length === 0)
      if (sectionMissing || data.status === 'insufficient_context') {
        setState((current) => ({
          ...current,
          status: 'insufficient_context',
          explanation: data.explanation || 'Add or confirm details for this section in Knowledge, then build again.',
          isGenerating: false,
        }))
        return
      }
      setState((current) => {
        let mergedSections: AppearancePreviewSection[]
        if (sectionType) {
          const prevSections = (current.content?.sections || []).filter(
            (section) => section.type !== sectionType,
          )
          mergedSections = [...prevSections, ...newSections]
        } else {
          mergedSections = data.content?.sections || []
        }

        return {
          status: data.status,
          content: {
            schemaVersion: 1,
            sections: mergedSections,
          },
          explanation: data.explanation,
          lastUpdate: Date.now(),
          isGenerating: false,
        }
      })
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestRef.current) return
      setState((current) => ({
        ...current,
        status: 'unavailable',
        explanation: previewFailureMessage(error),
        isGenerating: false,
      }))
    }
  }, [spaceId])

  useEffect(() => {
    setState(idleState)
    return () => {
      abortRef.current?.abort()
      requestRef.current += 1
    }
  }, [spaceId])

  const clearPreview = useCallback(() => {
    abortRef.current?.abort()
    requestRef.current += 1
    setState(idleState)
  }, [])

  const clearSectionDraft = useCallback((sectionType: PreviewSectionType) => {
    setState((current) => {
      if (!current.content) return current
      const remaining = current.content.sections.filter((s) => s.type !== sectionType)
      return {
        ...current,
        content: remaining.length > 0 ? { ...current.content, sections: remaining } : null,
      }
    })
  }, [])

  const updateItemImage = useCallback(
    (
      sectionType: PreviewSectionType,
      itemKey: string,
      imageUrl: string,
      assetId?: string,
      fallbackSection?: AppearancePreviewSection,
    ) => {
      setState((current) => {
        const sections = current.content?.sections ? [...current.content.sections] : []
        const existingIdx = sections.findIndex((s) => s.type === sectionType)
        if (existingIdx >= 0) {
          const hasItem = sections[existingIdx].items.some((item) => item.key === itemKey)
          if (hasItem) {
            sections[existingIdx] = {
              ...sections[existingIdx],
              items: sections[existingIdx].items.map((item) =>
                item.key === itemKey ? { ...item, imageUrl, assetId } : item,
              ),
            }
          } else if (fallbackSection) {
            const fallbackItem = fallbackSection.items.find((item) => item.key === itemKey)
            if (fallbackItem) {
              sections[existingIdx] = {
                ...sections[existingIdx],
                items: [...sections[existingIdx].items, { ...fallbackItem, imageUrl, assetId }],
              }
            }
          }
        } else if (fallbackSection) {
          sections.push({
            ...fallbackSection,
            items: fallbackSection.items.map((item) =>
              item.key === itemKey ? { ...item, imageUrl, assetId } : item,
            ),
          })
        }
        return {
          ...current,
          content: {
            schemaVersion: 1,
            sections,
          },
          lastUpdate: Date.now(),
        }
      })
    },
    [],
  )

  const updateSectionHeading = useCallback(
    (sectionType: PreviewSectionType, newHeading: string, fallbackSection?: AppearancePreviewSection) => {
      setState((current) => {
        const sections = current.content?.sections ? [...current.content.sections] : []
        const existingIdx = sections.findIndex((s) => s.type === sectionType)
        if (existingIdx >= 0) {
          sections[existingIdx] = { ...sections[existingIdx], heading: newHeading }
        } else if (fallbackSection) {
          sections.push({ ...fallbackSection, heading: newHeading })
        }
        return {
          ...current,
          content: {
            schemaVersion: 1,
            sections,
          },
          lastUpdate: Date.now(),
        }
      })
    },
    [],
  )

  const updateSectionItem = useCallback(
    (
      sectionType: PreviewSectionType,
      itemKey: string,
      updates: Partial<Pick<AppearancePreviewItem, 'title' | 'description' | 'meta'>>,
      fallbackSection?: AppearancePreviewSection,
    ) => {
      setState((current) => {
        const sections = current.content?.sections ? [...current.content.sections] : []
        const existingIdx = sections.findIndex((s) => s.type === sectionType)
        if (existingIdx >= 0) {
          sections[existingIdx] = {
            ...sections[existingIdx],
            items: sections[existingIdx].items.map((item) =>
              item.key === itemKey ? { ...item, ...updates } : item,
            ),
          }
        } else if (fallbackSection) {
          sections.push({
            ...fallbackSection,
            items: fallbackSection.items.map((item) =>
              item.key === itemKey ? { ...item, ...updates } : item,
            ),
          })
        }
        return {
          ...current,
          content: {
            schemaVersion: 1,
            sections,
          },
          lastUpdate: Date.now(),
        }
      })
    },
    [],
  )

  const setPreviewContent = useCallback((content: AppearancePreviewContent, explanation?: string) => {
    setState({
      status: 'ready',
      content,
      lastUpdate: Date.now(),
      isGenerating: false,
      explanation,
    })
  }, [])

  return {
    state,
    generatePreview,
    clearPreview,
    clearSectionDraft,
    updateItemImage,
    updateSectionHeading,
    updateSectionItem,
    setPreviewContent,
  }
}

