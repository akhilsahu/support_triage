import { YulloButton } from '../../../components/core/YulloButton'
import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Layers, X, AlertCircle, ImagePlus } from 'lucide-react'
import type { AppearancePreviewItem, AppearancePreviewSection, PreviewSectionType } from './types'
import type { AppearanceAsset } from '../../../api/appearance'

export interface SectionDataModalProps {
  isOpen: boolean
  sectionType: PreviewSectionType | null
  sectionLabel: string
  isLoading: boolean
  isApplying: boolean
  sectionData?: AppearancePreviewSection | null
  explanation?: string
  status?: 'idle' | 'ready' | 'insufficient_context' | 'unavailable'
  onConfirm: () => void
  onCancel: () => void
  onChooseImage?: (item: AppearancePreviewItem) => void
  onRemoveImage?: (item: AppearancePreviewItem) => void
  assets?: AppearanceAsset[]
}

/**
 * Modal dialog displaying data pulled for a specific appearance section.
 * Allows the user to review the pulled items and either "Add to section" or "Cancel".
 */
export function SectionDataModal({
  isOpen,
  sectionType,
  sectionLabel,
  isLoading,
  isApplying,
  sectionData,
  explanation,
  status,
  onConfirm,
  onCancel,
  onChooseImage,
  onRemoveImage,
  assets = [],
}: SectionDataModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      setFailedImages({})
      dialog.showModal()
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  if (!isOpen) return null

  const items = sectionData?.items || []
  const hasItems = items.length > 0
  const isFailed = status === 'unavailable' || status === 'insufficient_context' || (!isLoading && !hasItems)

  return (
    <dialog
      ref={dialogRef}
      className="appearance-confirm appearance-data-modal"
      aria-labelledby="section-data-modal-title"
      aria-describedby="section-data-modal-description"
      onCancel={(event) => { event.preventDefault(); if (!isApplying) onCancel() }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isApplying) {
          onCancel()
        }
      }}
    >
      <div className="appearance-confirm-body appearance-data-modal-body">
        <button
          type="button"
          className="appearance-confirm-close"
          aria-label="Close modal"
          disabled={isApplying}
          onClick={onCancel}
        >
          <X size={18} />
        </button>

        <div className="appearance-confirm-symbol">
          {isLoading ? (
            <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
          ) : isFailed ? (
            <AlertCircle size={24} className="text-[var(--danger, #e11d48)]" />
          ) : (
            <Layers size={24} strokeWidth={1.7} />
          )}
        </div>

        <span className="appearance-confirm-label">{sectionLabel}</span>

        <h2 id="section-data-modal-title">
          {isLoading
            ? `Pulling ${sectionLabel} data…`
            : isFailed
            ? `No data found for ${sectionLabel}`
            : `Review pulled ${sectionLabel} data`}
        </h2>

        <p id="section-data-modal-description">
          {isLoading
            ? 'Aura is retrieving grounded details from your Space knowledge to draft this section.'
            : isFailed
            ? explanation || 'No approved items could be gathered for this section. Add or approve details in Space knowledge, then pull again.'
            : 'Review the text and images. Change or remove any image, then choose "Add to section" to apply.'}
        </p>

        {/* Loading state skeleton */}
        {isLoading && (
          <div className="appearance-data-modal-loading">
            <div className="appearance-data-skeleton-card" />
            <div className="appearance-data-skeleton-card" />
          </div>
        )}

        {/* Pulled data items display */}
        {!isLoading && hasItems && sectionData && (
          <div className="appearance-data-modal-content">
            {sectionData.heading && (
              <div className="appearance-data-modal-section-heading">
                {sectionData.eyebrow && (
                  <span className="appearance-data-eyebrow">{sectionData.eyebrow}</span>
                )}
                <h3 className="appearance-data-heading">{sectionData.heading}</h3>
              </div>
            )}

            <div className="appearance-data-modal-items" role="list" aria-label={`Pulled items for ${sectionLabel}`}>
              {items.map((item, index) => (
                <div key={item.key || index} className="appearance-data-item-card" role="listitem">
                  {item.imageUrl && !failedImages[item.imageUrl] && (
                    <img
                      className="appearance-data-item-image"
                      src={item.imageUrl}
                      alt={`Image for ${item.title}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages((current) => ({ ...current, [item.imageUrl!]: true }))}
                    />
                  )}
                  {item.imageUrl && failedImages[item.imageUrl] && <p role="status">Image unavailable. Choose another image or remove it.</p>}
                  {item.imageUrl && <span className="appearance-data-image-label">{assets.find((asset) => asset.id === item.assetId)?.altText || 'Existing Space image'}</span>}
                  <div className="appearance-data-item-header">
                    <span className="appearance-data-item-title">{item.title}</span>
                    {item.meta && <span className="appearance-data-item-meta">{item.meta}</span>}
                  </div>
                  {item.description && (
                    <p className="appearance-data-item-desc">{item.description}</p>
                  )}
                  {onChooseImage && (
                    <div className="appearance-data-image-controls">
                      <button type="button" disabled={isApplying} onClick={() => onChooseImage(item)} aria-label={`${item.imageUrl ? 'Change' : 'Choose'} image for ${item.title}`}>
                        <ImagePlus size={16} aria-hidden="true" />
                        {item.imageUrl ? 'Change image' : 'Choose image'}
                      </button>
                      {item.imageUrl && onRemoveImage && (
                        <button type="button" disabled={isApplying} onClick={() => onRemoveImage(item)} aria-label={`Remove image for ${item.title}`}>Remove</button>
                      )}
                      {!item.imageUrl && <span>No image selected</span>}
                    </div>
                  )}
                  <div className="appearance-data-item-footer">
                    <span className={`appearance-data-source-badge is-${item.source}`}>
                      {item.source === 'grounded' ? '✓ Grounded in Space knowledge' : 'Example draft'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal actions */}
        <div className="appearance-confirm-actions appearance-data-modal-actions">
          <YulloButton variant="outline"
            type="button"
            autoFocus
            disabled={isApplying}
            onClick={onCancel}
            className="appearance-btn-cancel"
          >
            Cancel
          </YulloButton>
          {!isFailed && hasItems && (
            <YulloButton variant="outline"
              type="button"
              className="appearance-confirm-primary appearance-btn-confirm"
              disabled={isLoading || isApplying}
              onClick={onConfirm}
            >
              {isApplying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Adding to section…
                </>
              ) : (
                <>
                  <Check size={16} />
                  Add to section
                </>
              )}
            </YulloButton>
          )}
        </div>
      </div>
    </dialog>
  )
}
