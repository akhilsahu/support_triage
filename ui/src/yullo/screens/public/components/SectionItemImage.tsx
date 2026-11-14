import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useSectionEditor } from '../../appearance/preview/SectionEditorContext'
import type { AppearancePreviewItem, PreviewSectionType } from '../../appearance/preview/types'

export function SectionItemImage({ item, sectionType, compact = false }: {
  item: AppearancePreviewItem
  sectionType: PreviewSectionType
  compact?: boolean
}) {
  const sectionEditor = useSectionEditor()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!item.imageUrl) return null
  const failed = failedUrl === item.imageUrl
  if (failed && !sectionEditor?.openImagePicker) return null

  return (
    <div className={`relative overflow-hidden rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] bg-[var(--presentation-surface)] ${compact ? 'h-20 w-20 shrink-0' : 'mb-4 aspect-[16/10] w-full'}`}>
      {failed ? <span role="status" className="block p-3 text-xs text-[var(--presentation-muted)]">Image unavailable</span> : (
        <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async"
          onError={() => setFailedUrl(item.imageUrl || null)}
          className={`h-full w-full ${sectionType === 'products' ? 'object-contain' : 'object-cover'}`} />
      )}
      {sectionEditor?.openImagePicker && (
        <button type="button" aria-label={`Change image for ${item.title}`}
          onClick={() => sectionEditor.openImagePicker?.({ sectionType, itemKey: item.key, itemTitle: item.title, currentImageUrl: item.imageUrl })}
          className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--presentation-border)] bg-[var(--presentation-surface)] text-[var(--presentation-text)] hover:border-[var(--presentation-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)]">
          <ImagePlus size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
