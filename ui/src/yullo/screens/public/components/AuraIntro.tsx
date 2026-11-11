import { useInView } from 'react-intersection-observer'
import { PublicSpace } from '../../../services/aura/types'
import { IdentityBlock } from './IdentityBlock'
import { PromptStarters } from './PromptStarters'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { SectionConfirmDialog, type SectionConfirmation } from '../../appearance/preview/SectionConfirmDialog'
import { Eye, EyeOff, RotateCw, ImagePlus, ImageIcon, Loader2 } from 'lucide-react'
import type { SpacePresentationConfig } from '../../appearance/presentation/schema'
import { useSectionEditor } from '../../appearance/preview/SectionEditorContext'
import type { AppearancePreviewContent, AppearancePreviewItem, PreviewSectionType } from '../../appearance/preview/types'
import { InlineEditableText } from '../../appearance/components/InlineEditableText'
import { PreviewSection } from '../../appearance/preview/PreviewSection'

const SectionHeadingControls = createContext<ReactNode>(null)

function PlaceholderSection({
  title,
  sectionType,
  children,
  align = 'center',
}: {
  title: string
  sectionType?: PreviewSectionType
  children: React.ReactNode
  align?: 'left' | 'center' | 'right' | 'stretch'
}) {
  const controls = useContext(SectionHeadingControls)
  const sectionEditor = useSectionEditor()
  const isRight = align === 'right'
  const isLeft = align === 'left'
  const isStretch = align === 'stretch'

  const selfAlign = isLeft
    ? 'self-start mr-auto'
    : isRight
    ? 'self-end ml-auto'
    : isStretch
    ? 'self-stretch w-full'
    : 'self-center mx-auto'

  return (
    <div className={`w-full flex flex-col gap-5 ${selfAlign}`} style={{ maxWidth: 'var(--presentation-content-width)', marginTop: 'var(--presentation-section-gap)' }}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${isRight ? 'justify-end' : 'justify-start'}`}>
        {isRight && controls}
        {sectionType && sectionEditor?.updateSectionHeading ? (
          <InlineEditableText
            as="h3"
            value={title}
            onSave={(newHeading) => sectionEditor.updateSectionHeading?.(sectionType, newHeading)}
            ariaLabel={`${sectionType} section heading`}
            className={`font-[var(--presentation-heading-font)] font-[var(--presentation-heading-weight)] text-xl tracking-[var(--presentation-heading-tracking)] text-[var(--presentation-text)] opacity-90 ${isRight ? 'text-right' : ''}`}
          />
        ) : (
          <h3 className={`font-[var(--presentation-heading-font)] font-[var(--presentation-heading-weight)] text-xl tracking-[var(--presentation-heading-tracking)] text-[var(--presentation-text)] opacity-90 ${isRight ? 'text-right' : ''}`}>{title}</h3>
        )}
        {!isRight && controls}
      </div>
      {children}
    </div>
  )
}

function MockServices({
  title = "Services",
  items,
  sectionType = 'services',
  align,
  variant,
}: {
  title?: string
  items?: AppearancePreviewItem[]
  sectionType?: PreviewSectionType
  align?: 'left' | 'center' | 'right' | 'stretch'
  variant?: string | null
}) {
  const sectionEditor = useSectionEditor()
  if (items && items.length > 0) {
    const isGrid = variant === 'grid_2col' || variant === 'grid_3col'
    return (
      <PlaceholderSection title={title} sectionType={sectionType} align={align}>
        {isGrid ? (
          <div className={`grid gap-4 ${variant === 'grid_3col' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {items.map((item, i) => (
              <div
                key={item.key || i}
                className="group relative flex flex-col justify-between p-5 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)] shadow-xs hover:border-[var(--presentation-accent)] transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="inline-flex items-center justify-center h-6 px-2.5 rounded-full text-xs font-semibold bg-[var(--presentation-accent-soft)] text-[var(--presentation-accent)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {item.meta && (
                    <span className="text-xs text-[var(--presentation-muted)] font-mono">
                      {item.meta}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  {sectionEditor?.updateSectionItem ? (
                    <>
                      <InlineEditableText
                        as="div"
                        value={item.title}
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                        ariaLabel="service title"
                        className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] text-base mb-2"
                      />
                      <InlineEditableText
                        as="div"
                        value={item.description}
                        placeholder="Add description…"
                        multiline
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                        ariaLabel="service description"
                        className="text-[var(--presentation-text)] opacity-80 text-sm leading-relaxed"
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] text-base mb-2">
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="text-[var(--presentation-text)] opacity-80 text-sm leading-relaxed">
                          {item.description}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[var(--presentation-border)] border-y border-[var(--presentation-border)]">
            {items.map((item, i) => (
              <div key={item.key || i} className="grid grid-cols-[32px_1fr] gap-4 py-5">
                <span className="text-xs text-[var(--presentation-accent)]">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  {sectionEditor?.updateSectionItem ? (
                    <>
                      <InlineEditableText
                        as="div"
                        value={item.title}
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                        ariaLabel="service title"
                        className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-2"
                      />
                      <InlineEditableText
                        as="div"
                        value={item.description}
                        placeholder="Add description…"
                        multiline
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                        ariaLabel="service description"
                        className="text-[var(--presentation-text)] opacity-80 text-sm"
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-2">{item.title}</div>
                      {item.description && <div className="text-[var(--presentation-text)] opacity-80 text-sm">{item.description}</div>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PlaceholderSection>
    )
  }
  return (
    <PlaceholderSection title={title} sectionType={sectionType} align={align}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="p-5 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)] shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[var(--presentation-muted)]/10 mb-3" />
            <div className="h-4 w-3/4 bg-[var(--presentation-muted)]/20 rounded mb-2" />
            <div className="h-3 w-1/2 bg-[var(--presentation-muted)]/10 rounded" />
          </div>
        ))}
      </div>
    </PlaceholderSection>
  )
}

function MockPortfolioItem({
  item,
  index,
  sectionType,
}: {
  item: AppearancePreviewItem
  index: number
  sectionType: PreviewSectionType
}) {
  const sectionEditor = useSectionEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isFeatured = index === 0
  const [isUploading, setIsUploading] = useState(false)
  const tooltipText = item.imageUrl
    ? `Change image for ${item.title}`
    : `Add image for ${item.title}`

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sectionEditor?.uploadItemImage) return
    setIsUploading(true)
    try {
      await sectionEditor.uploadItemImage(sectionType, item.key, file)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleTriggerClick = () => {
    if (sectionEditor?.openImagePicker) {
      sectionEditor.openImagePicker({
        sectionType,
        itemKey: item.key,
        itemTitle: item.title,
        currentImageUrl: item.imageUrl,
      })
    } else {
      fileInputRef.current?.click()
    }
  }

  return (
    <div
      key={item.key || index}
      className={`group relative overflow-hidden rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] transition-all duration-200 ${
        isFeatured ? 'col-span-2 row-span-2 min-h-[300px]' : 'min-h-[160px]'
      } aspect-square flex flex-col justify-between p-4 md:p-5`}
      style={{
        boxShadow: 'var(--presentation-card-shadow)',
        backgroundColor: item.imageUrl ? 'var(--presentation-canvas)' : 'var(--presentation-surface, rgba(255,255,255,0.03))',
      }}
    >
      {/* Background Image if set */}
      {item.imageUrl ? (
        <>
          <img
            src={item.imageUrl}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15 pointer-events-none" />
        </>
      ) : (
        /* Subtle modern card gradient when no background image */
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--presentation-accent-soft),transparent_70%)] opacity-50 pointer-events-none" />
      )}

      {/* Top Header: Meta badge & Upload icon button */}
      <div className="relative z-10 flex items-start justify-between gap-2 w-full">
        {sectionEditor?.updateSectionItem ? (
          <InlineEditableText
            as="span"
            value={item.meta}
            placeholder="TAG"
            onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { meta: val })}
            ariaLabel="portfolio tag"
            className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
              item.imageUrl
                ? 'bg-white/20 text-white'
                : 'bg-[var(--presentation-accent-soft)] text-[var(--presentation-accent)]'
            }`}
          />
        ) : item.meta ? (
          <span
            className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
              item.imageUrl
                ? 'bg-white/20 text-white'
                : 'bg-[var(--presentation-accent-soft)] text-[var(--presentation-accent)]'
            }`}
          >
            {item.meta}
          </span>
        ) : (
          <div />
        )}

        {(sectionEditor?.uploadItemImage || sectionEditor?.openImagePicker) && (
          <div className="portfolio-upload-trigger">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              aria-label={tooltipText}
            />
            <button
              type="button"
              onClick={handleTriggerClick}
              disabled={isUploading}
              data-tooltip={tooltipText}
              title={tooltipText}
              aria-label={tooltipText}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all cursor-pointer ${
                item.imageUrl
                  ? 'border-white/30 bg-black/40 text-white hover:bg-black/60 hover:border-white/60'
                  : 'border-[var(--presentation-border)] bg-[var(--presentation-surface)] text-[var(--presentation-muted)] hover:text-[var(--presentation-text)] hover:border-[var(--presentation-accent)] hover:bg-[var(--presentation-accent-soft)] shadow-xs'
              }`}
            >
              {isUploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ImagePlus size={14} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Center Subtle Icon placeholder when no image */}
      {!item.imageUrl && (
        <div className="relative z-0 flex flex-1 items-center justify-center py-2 opacity-20 pointer-events-none">
          <ImageIcon size={isFeatured ? 44 : 28} strokeWidth={1.2} />
        </div>
      )}

      {/* Bottom Content: Title & AI Generated Description / Alt Text */}
      <div className="relative z-10 flex flex-col gap-1.5 pt-2">
        {sectionEditor?.updateSectionItem ? (
          <>
            <InlineEditableText
              as="h4"
              value={item.title}
              onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
              ariaLabel="portfolio title"
              className={`font-[var(--presentation-heading-font)] font-semibold leading-tight ${
                isFeatured ? 'text-lg md:text-xl' : 'text-sm md:text-base'
              } ${item.imageUrl ? 'text-white' : 'text-[var(--presentation-text)]'}`}
            />
            <InlineEditableText
              as="p"
              value={item.description}
              placeholder="Add description…"
              multiline
              onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
              ariaLabel="portfolio description"
              className={`leading-relaxed line-clamp-2 ${
                isFeatured ? 'text-xs md:text-sm max-w-md line-clamp-3' : 'text-xs'
              } ${item.imageUrl ? 'text-white/80' : 'text-[var(--presentation-muted)]'}`}
            />
          </>
        ) : (
          <>
            <h4
              className={`font-[var(--presentation-heading-font)] font-semibold leading-tight ${
                isFeatured ? 'text-lg md:text-xl' : 'text-sm md:text-base'
              } ${item.imageUrl ? 'text-white' : 'text-[var(--presentation-text)]'}`}
            >
              {item.title}
            </h4>

            {item.description && (
              <p
                className={`leading-relaxed line-clamp-2 ${
                  isFeatured ? 'text-xs md:text-sm max-w-md line-clamp-3' : 'text-xs'
                } ${item.imageUrl ? 'text-white/80' : 'text-[var(--presentation-muted)]'}`}
              >
                {item.description}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MockPortfolio({ title = "Portfolio", items, align }: { title?: string; items?: AppearancePreviewItem[]; align?: 'left' | 'center' | 'right' | 'stretch' }) {
  if (items && items.length > 0) {
    return (
      <PlaceholderSection title={title} sectionType="portfolio" align={align}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <MockPortfolioItem key={item.key || i} item={item} index={i} sectionType="portfolio" />
          ))}
        </div>
      </PlaceholderSection>
    )
  }
  return (
    <PlaceholderSection title={title} sectionType="portfolio" align={align}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="aspect-square rounded-[var(--presentation-radius)] bg-[var(--presentation-muted)]/10 border border-[var(--presentation-border)]" />
        ))}
      </div>
    </PlaceholderSection>
  )
}

function MockProducts({
  title = "Products",
  items,
  sectionType = 'products',
  align,
  variant,
}: {
  title?: string
  items?: AppearancePreviewItem[]
  sectionType?: PreviewSectionType
  align?: 'left' | 'center' | 'right' | 'stretch'
  variant?: string | null
}) {
  const sectionEditor = useSectionEditor()
  if (items && items.length > 0) {
    const isGrid = variant === 'grid_2col' || variant === 'grid_3col'
    return (
      <PlaceholderSection title={title} sectionType={sectionType} align={align}>
        {isGrid ? (
          <div className={`grid gap-4 ${variant === 'grid_3col' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {items.map((item, i) => (
              <div
                key={item.key || i}
                className="group relative flex flex-col justify-between p-5 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)] shadow-xs hover:border-[var(--presentation-accent)] transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--presentation-accent)] shrink-0" />
                  {item.meta && (
                    <span className="text-xs text-[var(--presentation-muted)] font-mono">
                      {item.meta}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  {sectionEditor?.updateSectionItem ? (
                    <>
                      <InlineEditableText
                        as="div"
                        value={item.title}
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                        ariaLabel="product title"
                        className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] text-base mb-2"
                      />
                      <InlineEditableText
                        as="div"
                        value={item.description}
                        placeholder="Add description…"
                        multiline
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                        ariaLabel="product description"
                        className="text-[var(--presentation-text)] opacity-80 text-sm leading-relaxed"
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] text-base mb-2">
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="text-[var(--presentation-text)] opacity-80 text-sm leading-relaxed">
                          {item.description}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <div key={item.key || i} className="flex items-start gap-5 py-5 border-t border-[var(--presentation-border)] first:border-t-0">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--presentation-accent)] shrink-0" />
                <div className="flex-1">
                  {sectionEditor?.updateSectionItem ? (
                    <>
                      <InlineEditableText
                        as="div"
                        value={item.title}
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                        ariaLabel="product title"
                        className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-1"
                      />
                      <InlineEditableText
                        as="div"
                        value={item.description}
                        placeholder="Add description…"
                        multiline
                        onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                        ariaLabel="product description"
                        className="text-[var(--presentation-text)] opacity-80 text-sm line-clamp-2"
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-1">{item.title}</div>
                      {item.description && <div className="text-[var(--presentation-text)] opacity-80 text-sm line-clamp-2">{item.description}</div>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PlaceholderSection>
    )
  }
  return (
    <PlaceholderSection title={title} sectionType={sectionType} align={align}>
      <div className="flex flex-col gap-3">
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)] shadow-sm">
            <div className="w-12 h-12 rounded bg-[var(--presentation-muted)]/10 shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-1/3 bg-[var(--presentation-muted)]/20 rounded mb-1.5" />
              <div className="h-3 w-1/4 bg-[var(--presentation-muted)]/10 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PlaceholderSection>
  )
}

function MockLocation({
  title = "Location",
  items,
  sectionType = 'location',
  align,
}: {
  title?: string
  items?: AppearancePreviewItem[]
  sectionType?: PreviewSectionType
  align?: 'left' | 'center' | 'right' | 'stretch'
}) {
  const sectionEditor = useSectionEditor()
  if (items && items.length > 0) {
    return (
      <PlaceholderSection title={title} sectionType={sectionType} align={align}>
        <div className="py-5 border-y border-[var(--presentation-border)]">
          {items.map((item, i) => (
            <div key={item.key || i} className="mb-4 last:mb-0">
              {sectionEditor?.updateSectionItem ? (
                <>
                  <InlineEditableText
                    as="div"
                    value={item.title}
                    onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                    ariaLabel="location title"
                    className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-1"
                  />
                  <InlineEditableText
                    as="div"
                    value={item.description}
                    placeholder="Add address or details…"
                    multiline
                    onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                    ariaLabel="location description"
                    className="text-[var(--presentation-text)] opacity-80 text-sm whitespace-pre-line"
                  />
                </>
              ) : (
                <>
                  <div className="font-[var(--presentation-heading-font)] font-medium text-[var(--presentation-text)] mb-1">{item.title}</div>
                  {item.description && <div className="text-[var(--presentation-text)] opacity-80 text-sm whitespace-pre-line">{item.description}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      </PlaceholderSection>
    )
  }
  return (
    <PlaceholderSection title={title} sectionType={sectionType} align={align}>
      <div className="h-40 rounded-[var(--presentation-radius)] bg-[var(--presentation-muted)]/10 border border-[var(--presentation-border)] flex items-center justify-center text-[var(--presentation-muted)] text-sm font-medium">
        Map view
      </div>
    </PlaceholderSection>
  )
}

function MockFeatured({
  title = "Featured",
  items,
  sectionType = 'featured',
  align,
}: {
  title?: string
  items?: AppearancePreviewItem[]
  sectionType?: PreviewSectionType
  align?: 'left' | 'center' | 'right' | 'stretch'
}) {
  const sectionEditor = useSectionEditor()
  const isRight = align === 'right'
  if (items && items.length > 0) {
    const item = items[0]
    return (
      <PlaceholderSection title={title} sectionType={sectionType} align={align}>
        <div className={`py-6 border-[var(--presentation-accent)] ${
          isRight
            ? 'pr-6 border-r-2 text-right bg-[linear-gradient(270deg,var(--presentation-accent-soft),transparent)]'
            : 'pl-6 border-l-2 text-left bg-[linear-gradient(90deg,var(--presentation-accent-soft),transparent)]'
        }`}>
          {sectionEditor?.updateSectionItem ? (
            <>
              <InlineEditableText
                as="div"
                value={item.title}
                onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { title: val })}
                ariaLabel="featured title"
                className="font-[var(--presentation-heading-font)] font-semibold text-[var(--presentation-text)] text-xl mb-2"
              />
              <InlineEditableText
                as="div"
                value={item.description}
                placeholder="Add description…"
                multiline
                onSave={(val) => sectionEditor.updateSectionItem?.(sectionType, item.key, { description: val })}
                ariaLabel="featured description"
                className={`text-[var(--presentation-text)] opacity-90 text-sm max-w-md ${isRight ? 'ml-auto' : ''}`}
              />
            </>
          ) : (
            <>
              <div className="font-[var(--presentation-heading-font)] font-semibold text-[var(--presentation-text)] text-xl mb-2">{item.title}</div>
              {item.description && <div className={`text-[var(--presentation-text)] opacity-90 text-sm max-w-md ${isRight ? 'ml-auto' : ''}`}>{item.description}</div>}
            </>
          )}
        </div>
      </PlaceholderSection>
    )
  }
  return (
    <PlaceholderSection title={title} sectionType={sectionType} align={align}>
      <div className="p-8 rounded-[var(--presentation-radius)] bg-[var(--presentation-accent-soft)] border border-[var(--presentation-accent)]/20 text-center">
        <div className="h-5 w-1/2 bg-[var(--presentation-accent)]/30 rounded mx-auto mb-3" />
        <div className="h-3 w-3/4 bg-[var(--presentation-accent)]/20 rounded mx-auto" />
      </div>
    </PlaceholderSection>
  )
}

interface AuraIntroProps {
  space: PublicSpace
  presentation: SpacePresentationConfig
  heroAssetUrl?: string
  heroAssetAltText?: string
  onSelectPrompt: (text: string) => void
  onIdentityVisibilityChange: (isVisible: boolean) => void
  previewContent?: AppearancePreviewContent
}

export function AuraIntro({ space, presentation, heroAssetUrl, heroAssetAltText = '', onSelectPrompt, onIdentityVisibilityChange, previewContent }: AuraIntroProps) {
  const sectionEditor = useSectionEditor()
  const [confirmation, setConfirmation] = useState<SectionConfirmation | null>(null)
  const editableTypes = ['services', 'portfolio', 'products', 'location', 'featured']
  const { ref: identityRef, inView: identityVisible } = useInView({
    threshold: 0.05,
    rootMargin: "-56px 0px 0px 0px", // Account for the sticky header height
  })

  useEffect(() => {
    onIdentityVisibilityChange(identityVisible)
  }, [identityVisible, onIdentityVisibilityChange])

  const openingPadding = {
    minimal: 'pt-[20vh]',
    visual: 'pt-[8vh]',
    services: 'pt-[11vh]',
    local: 'pt-[11vh]',
    balanced: 'pt-[13vh]',
  }[presentation.landingEmphasis]

  const priorityByEmphasis: Partial<Record<SpacePresentationConfig['landingEmphasis'], string[]>> = {
    services: ['identity', 'services', 'products'],
    visual: ['identity', 'portfolio', 'featured'],
    local: ['identity', 'location', 'featured'],
  }
  const priority = priorityByEmphasis[presentation.landingEmphasis] || []
  const visibleSections = presentation.sections
    .filter((section) => section.visible || (sectionEditor && editableTypes.includes(section.type)))
    .map((section, originalIndex) => ({ section, originalIndex }))
    .sort((a, b) => {
      const aPriority = priority.indexOf(a.section.type)
      const bPriority = priority.indexOf(b.section.type)
      if (aPriority >= 0 || bPriority >= 0) return (aPriority < 0 ? 99 : aPriority) - (bPriority < 0 ? 99 : bPriority)
      return a.originalIndex - b.originalIndex
    })
    .map(({ section }) => section)

  const sectionSource = (items?: AppearancePreviewItem[]) => items?.some((item) => item.source === 'grounded') ? 'grounded' as const : 'example' as const

  const contentLayout = presentation.contentLayout || 'center'
  const isLeft = contentLayout === 'left'
  const isRight = contentLayout === 'right'
  const isStretch = contentLayout === 'stretch'

  const containerAlignClass = isLeft
    ? 'items-start text-left'
    : isRight
    ? 'items-end text-right'
    : isStretch
    ? 'items-stretch text-left'
    : 'items-center text-center'

  const sectionAlignSelf = isLeft
    ? 'self-start mr-auto'
    : isRight
    ? 'self-end ml-auto'
    : isStretch
    ? 'self-stretch w-full'
    : 'self-center mx-auto'

  return (
    <div className={`w-full flex flex-col ${containerAlignClass} px-[clamp(16px,4vw,48px)] pb-8 ${openingPadding}`}>
      {visibleSections.map((section, index) => {
        const renderSection = () => {
        const previewSection = previewContent?.sections.find(s => s.type === section.type)
        const items = previewSection?.items
        const title = previewSection?.heading

        if (section.type === 'identity') {
          const hasSideImage = heroAssetUrl && presentation.hero.layout !== 'centered'
          const identityAlign = hasSideImage
            ? 'start'
            : (isRight ? 'end' : (isLeft || isStretch ? 'start' : 'center'))

          return (
            <div
              key={section.type}
              ref={identityRef}
              className={`w-full ${sectionAlignSelf} ${
                hasSideImage
                  ? 'grid items-center gap-8 md:grid-cols-2'
                  : `flex flex-col gap-8 ${
                      isRight
                        ? 'items-end text-right'
                        : isLeft || isStretch
                        ? 'items-start text-left'
                        : 'items-center justify-center'
                    }`
              }`}
              style={{ maxWidth: 'var(--presentation-content-width)' }}
            >
              {heroAssetUrl && presentation.hero.layout === 'image_left' && <img src={heroAssetUrl} alt={heroAssetAltText} className="h-[clamp(220px,38vh,440px)] w-full rounded-[var(--presentation-radius)] object-cover" />}
              <IdentityBlock space={space} align={identityAlign} density={presentation.visualDensity} emphasis={presentation.landingEmphasis} />
              {heroAssetUrl && presentation.hero.layout !== 'image_left' && <img src={heroAssetUrl} alt={heroAssetAltText} className="h-[clamp(220px,38vh,440px)] w-full rounded-[var(--presentation-radius)] object-cover" />}
            </div>
          )
        }
        if (section.type === 'services') return previewSection ? <PreviewSection key={section.type} type={section.type} source={sectionSource(items)} index={index}><MockServices title={title} items={items} sectionType="services" align={contentLayout} variant={section.variant} /></PreviewSection> : null
        if (section.type === 'portfolio') return previewSection ? <PreviewSection key={section.type} type={section.type} source={sectionSource(items)} index={index}><MockPortfolio title={title} items={items} align={contentLayout} /></PreviewSection> : null
        if (section.type === 'products') return previewSection ? <PreviewSection key={section.type} type={section.type} source={sectionSource(items)} index={index}><MockProducts title={title} items={items} sectionType="products" align={contentLayout} variant={section.variant} /></PreviewSection> : null
        if (section.type === 'location') return previewSection ? <PreviewSection key={section.type} type={section.type} source={sectionSource(items)} index={index}><MockLocation title={title} items={items} sectionType="location" align={contentLayout} /></PreviewSection> : null
        if (section.type === 'featured') return previewSection ? <PreviewSection key={section.type} type={section.type} source={sectionSource(items)} index={index}><MockFeatured title={title} items={items} sectionType="featured" align={contentLayout} /></PreviewSection> : null
        if (section.type === 'prompt_starters') return <PromptStarters key={section.type} prompts={space.promptStarters} onSelect={onSelectPrompt} align={contentLayout} />
        return null
        }
        if (sectionEditor && editableTypes.includes(section.type)) {
          const type = section.type as PreviewSectionType
          const label = type === 'portfolio' ? 'Selected work' : type
          const visibilityTip = section.visible ? 'Hide this section. You can unhide it later.' : 'Unhide this section to restore its content and build with AI.'
          const buildTip = 'Build or rebuild this section with AI using your approved Space details. Review the draft before applying.'
          const controls = <>
            <div className="appearance-section-icons">
              <button type="button" data-tooltip={visibilityTip} title={visibilityTip} onClick={() => {
                setConfirmation({ action: section.visible ? 'hide' : 'unhide', label, confirm: () => sectionEditor.toggle(type) })
              }} aria-label={`${section.visible ? 'Hide' : 'Unhide'} ${type}`}>{section.visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              {section.visible && <button type="button" data-tooltip={buildTip} title={buildTip} aria-label={`Pull data for ${type} with AI`} disabled={sectionEditor.generating} onClick={() => {
                setConfirmation({ action: 'build', label, confirm: () => sectionEditor.build(type) })
              }}><RotateCw size={16} /></button>}
            </div>
            {section.visible && previewContent?.sections.find((item) => item.type === type)?.items.some((item) => item.source === 'example') && <span className="ml-auto text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--presentation-muted)] opacity-70">Example layout</span>}
          </>
          return <SectionHeadingControls.Provider key={type} value={controls}>
            <div className={`appearance-editable-section ${sectionAlignSelf}`}>
              {section.visible ? renderSection() : <PlaceholderSection title={label} align={contentLayout}><div className="appearance-hidden-section">Hidden · Unhide to restore this section</div></PlaceholderSection>}
            </div>
          </SectionHeadingControls.Provider>
        }
        return renderSection()
      })}
      {sectionEditor && <SectionConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  )
}
