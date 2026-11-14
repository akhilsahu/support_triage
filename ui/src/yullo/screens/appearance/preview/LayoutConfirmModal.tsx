import { YulloButton } from '../../../components/core/YulloButton'
import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, X, LayoutGrid, Palette, AlignCenter, AlertCircle } from 'lucide-react'
import type { SpacePresentationConfig } from '../presentation/schema'
import type { AppearancePreviewContent, PreviewSectionType } from './types'

export interface LayoutConfirmModalProps {
  isOpen: boolean
  isLoading: boolean
  config?: SpacePresentationConfig | null
  previewContent?: AppearancePreviewContent | null
  explanation?: string
  status?: 'idle' | 'ready' | 'insufficient_context' | 'unavailable'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal dialog displaying AI-generated appearance layout and content recommendations.
 * Allows the user to review suggested grid structure, styling, and extracted items before confirming.
 */
export function LayoutConfirmModal({
  isOpen,
  isLoading,
  config,
  previewContent,
  explanation,
  status,
  onConfirm,
  onCancel,
}: LayoutConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<string>('all')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal()
      } else {
        dialog.open = true
      }
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.open = false
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const isFailed = status === 'unavailable' || (!isLoading && !config)
  const sections = previewContent?.sections || []
  const hasSections = sections.length > 0

  return (
    <dialog
      ref={dialogRef}
      className="appearance-confirm appearance-data-modal appearance-layout-confirm-modal"
      aria-labelledby="layout-modal-title"
      aria-describedby="layout-modal-description"
      onCancel={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isLoading) {
          onCancel()
        }
      }}
    >
      <div className="appearance-confirm-body appearance-data-modal-body">
        <YulloButton variant="outline"
          type="button"
          className="appearance-confirm-close"
          aria-label="Close modal"
          disabled={isLoading}
          onClick={onCancel}
        >
          <X size={18} />
        </YulloButton>

        <div className="appearance-confirm-symbol">
          {isLoading ? (
            <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
          ) : isFailed ? (
            <AlertCircle size={24} className="text-[var(--danger, #e11d48)]" />
          ) : (
            <LayoutGrid size={24} strokeWidth={1.7} />
          )}
        </div>

        <span className="appearance-confirm-label">Aura Studio</span>

        <h2 id="layout-modal-title">
          {isLoading
            ? 'Generating tailored layout…'
            : isFailed
            ? 'Could not rebuild layout'
            : 'Review Generated Layout & Content'}
        </h2>

        <p id="layout-modal-description">
          {isLoading
            ? 'Aura is analyzing your Space purpose, facts, and public details to suggest the best presentation and section layout.'
            : isFailed
            ? explanation || 'Could not prepare a new layout recommendation. Your current layout is unchanged.'
            : explanation || 'Aura generated a tailored presentation layout and extracted content items from your Space knowledge.'}
        </p>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="appearance-data-modal-loading">
            <div className="appearance-data-skeleton-card" />
            <div className="appearance-data-skeleton-card" />
            <div className="appearance-data-skeleton-card" />
          </div>
        )}

        {/* Layout details display */}
        {!isLoading && !isFailed && config && (
          <div className="appearance-data-modal-content">
            {/* Visual layout attributes badge bar */}
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-primary)]">
                <Palette size={13} className="text-[var(--accent)]" />
                <span>Theme: <strong className="capitalize">{config.themePreset}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-primary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                <span>Accent: <strong className="capitalize">{config.accent}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-primary)]">
                <AlignCenter size={13} className="text-[var(--text-muted)]" />
                <span>Align: <strong className="capitalize">{config.contentLayout || 'center'}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-primary)]">
                <LayoutGrid size={13} className="text-[var(--text-muted)]" />
                <span>Services Grid: <strong>2-Column Cards</strong></span>
              </div>
            </div>

            {/* Extracted Sections Preview */}
            {hasSections ? (
              <div className="appearance-data-modal-items" role="list" aria-label="Generated section cards">
                {sections.map((section) => (
                  <div key={section.type} className="mb-3 last:mb-0">
                    <div className="appearance-data-modal-section-heading mb-2">
                      <span className="appearance-data-eyebrow">{section.type}</span>
                      <div className="flex items-center justify-between">
                        <h3 className="appearance-data-heading">{section.heading || section.type}</h3>
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">
                          {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {section.items.map((item, index) => (
                        <div key={item.key || index} className="appearance-data-item-card" role="listitem">
                          <div className="appearance-data-item-header">
                            <span className="appearance-data-item-title">{item.title}</span>
                            {item.meta && <span className="appearance-data-item-meta">{item.meta}</span>}
                          </div>
                          {item.description && (
                            <p className="appearance-data-item-desc">{item.description}</p>
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
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[var(--surface-soft)] text-center text-xs text-[var(--text-secondary)]">
                No custom section items found. Default placeholders will be displayed.
              </div>
            )}
          </div>
        )}

        {/* Modal actions */}
        <div className="appearance-data-modal-actions">
          <YulloButton variant="outline"
            type="button"
            className="appearance-btn-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </YulloButton>
          {!isFailed && (
            <YulloButton variant="primary"
              type="button"
              className="appearance-btn-confirm"
              onClick={onConfirm}
              disabled={isLoading}
            >
              <Check size={16} />
              Confirm & Apply to Preview
            </YulloButton>
          )}
        </div>
      </div>
    </dialog>
  )
}
