import { createContext, useContext } from 'react'
import type { AppearancePreviewItem, PreviewSectionType } from './types'

export interface ImagePickerTarget {
  sectionType: PreviewSectionType
  itemKey: string
  itemTitle?: string
  currentImageUrl?: string | null
}

export const SectionEditorContext = createContext<{
  bookingPreview?: import('../../../api/appearance').AppearanceSpaceSummary['previewBookingLinks']
  generating: boolean
  toggle: (type: PreviewSectionType) => void
  build: (type: PreviewSectionType) => void
  uploadItemImage?: (sectionType: PreviewSectionType, itemKey: string, file: File) => Promise<void>
  openImagePicker?: (target: ImagePickerTarget) => void
  updateSectionHeading?: (sectionType: PreviewSectionType, newHeading: string) => void
  updateSectionItem?: (
    sectionType: PreviewSectionType,
    itemKey: string,
    updates: Partial<Pick<AppearancePreviewItem, 'title' | 'description' | 'meta'>>,
  ) => void
} | null>(null)

export function useSectionEditor() {
  return useContext(SectionEditorContext)
}

