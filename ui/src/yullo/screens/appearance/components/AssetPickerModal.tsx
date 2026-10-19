import { useEffect, useRef, useState, useMemo } from 'react'
import { X, UploadCloud, Image, Check, Loader2, Trash2, Search, ImageIcon } from 'lucide-react'
import type { AppearanceAsset } from '../../../api/appearance'
import type { PreviewSectionType } from '../preview/types'

export interface ImagePickerTarget {
  sectionType: PreviewSectionType
  itemKey: string
  itemTitle?: string
  currentImageUrl?: string | null
}

export interface AssetPickerModalProps {
  isOpen: boolean
  target: ImagePickerTarget | null
  assets: AppearanceAsset[]
  isUploading?: boolean
  onClose: () => void
  onSelectAsset: (asset: AppearanceAsset) => void
  onUploadFile: (file: File) => Promise<void>
  onRemoveImage?: () => void
}

export function AssetPickerModal({
  isOpen,
  target,
  assets,
  isUploading = false,
  onClose,
  onSelectAsset,
  onUploadFile,
  onRemoveImage,
}: AssetPickerModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Default to 'existing' if assets exist, otherwise 'upload'
  const [activeTab, setActiveTab] = useState<'upload' | 'existing'>('upload')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Sync dialog visibility
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
      // If assets exist, default to existing tab, else upload tab
      if (assets.length > 0) {
        setActiveTab('existing')
        // Pre-select if matches target's image
        const match = assets.find((a) => a.url === target?.currentImageUrl)
        setSelectedAssetId(match ? match.id : assets[0].id)
      } else {
        setActiveTab('upload')
        setSelectedAssetId(null)
      }
      setStagedFile(null)
      setPreviewUrl(null)
      setUploadError(null)
      setSearchFilter('')
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen, assets, target])

  // Cleanup staged preview URL on change
  useEffect(() => {
    if (!stagedFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(stagedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [stagedFile])

  // Filtered existing assets
  const filteredAssets = useMemo(() => {
    if (!searchFilter.trim()) return assets
    const q = searchFilter.toLowerCase()
    return assets.filter(
      (a) => a.filename.toLowerCase().includes(q) || (a.altText && a.altText.toLowerCase().includes(q))
    )
  }, [assets, searchFilter])

  const handleFileSelection = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose a valid image file (PNG, JPG, WebP, GIF).')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image file must be under 10MB.')
      return
    }
    setUploadError(null)
    setStagedFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files?.[0]) {
      handleFileSelection(e.dataTransfer.files[0])
    }
  }

  const handleConfirmUpload = async () => {
    if (!stagedFile) return
    try {
      setUploadError(null)
      await onUploadFile(stagedFile)
      onClose()
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload image. Please try again.')
    }
  }

  const handleConfirmSelectExisting = () => {
    const asset = assets.find((a) => a.id === selectedAssetId)
    if (!asset) return
    onSelectAsset(asset)
    onClose()
  }

  if (!isOpen) return null

  const selectedAsset = assets.find((a) => a.id === selectedAssetId)

  return (
    <dialog
      ref={dialogRef}
      className="appearance-confirm asset-picker-dialog yullo-app font-[Instrument_Sans] text-[var(--text-primary)]"
      aria-labelledby="asset-picker-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="appearance-confirm-body asset-picker-body">
        <button
          type="button"
          className="appearance-confirm-close"
          aria-label="Close image picker"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="asset-picker-header">
          <div className="appearance-confirm-symbol">
            <Image size={24} strokeWidth={1.8} />
          </div>
          <div>
            <span className="appearance-confirm-label">
              {target?.sectionType ? `${target.sectionType} image` : 'Space asset'}
            </span>
            <h2 id="asset-picker-title" className="text-xl font-semibold font-[Satoshi] tracking-tight text-[var(--text-primary)]">
              {target?.itemTitle ? `Image for "${target.itemTitle}"` : 'Choose an image'}
            </h2>
            <p className="text-xs text-[var(--text-secondary,var(--presentation-muted))] mt-1">
              Upload from your computer or choose an existing image from your Space.
            </p>
          </div>
        </div>

        {/* Tab switch navigation */}
        <div className="asset-picker-tabs" role="tablist" aria-label="Image source options">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            className={`asset-picker-tab ${activeTab === 'upload' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <UploadCloud size={16} />
            <span>Upload from system</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'existing'}
            className={`asset-picker-tab ${activeTab === 'existing' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('existing')}
          >
            <Image size={16} />
            <span>
              Choose from existing assets {assets.length > 0 && `(${assets.length})`}
            </span>
          </button>
        </div>

        {/* Tab 1: Upload from system */}
        {activeTab === 'upload' && (
          <div className="asset-picker-tab-panel" role="tabpanel">
            {!stagedFile ? (
              <div
                className={`asset-dropzone ${isDragOver ? 'is-drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelection(e.target.files[0])
                  }}
                />
                <div className="asset-dropzone-icon">
                  <UploadCloud size={32} strokeWidth={1.5} />
                </div>
                <div className="asset-dropzone-text">
                  <span className="font-medium text-[var(--text-primary,var(--presentation-text))]">
                    Click to browse
                  </span>{' '}
                  or drag and drop your image here
                </div>
                <div className="asset-dropzone-hint">
                  Supports PNG, JPG, WebP, or GIF up to 10MB
                </div>
              </div>
            ) : (
              <div className="asset-staged-preview">
                <div className="asset-preview-image-box">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Selected upload preview"
                      className="h-full w-full object-cover rounded-lg"
                    />
                  )}
                </div>
                <div className="asset-preview-meta">
                  <div className="font-medium text-sm text-[var(--text-primary,var(--presentation-text))] truncate max-w-[260px]">
                    {stagedFile.name}
                  </div>
                  <div className="text-xs text-[var(--text-secondary,var(--presentation-muted))] mt-0.5">
                    {(stagedFile.size / 1024).toFixed(1)} KB • {stagedFile.type.split('/')[1]?.toUpperCase()}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-[var(--accent-solid,var(--presentation-accent))] hover:underline mt-2 text-left cursor-pointer"
                    onClick={() => {
                      setStagedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Choose a different file
                  </button>
                </div>
              </div>
            )}

            {uploadError && (
              <p className="mt-3 text-xs text-[var(--danger,#ef4444)]" role="alert">
                {uploadError}
              </p>
            )}
          </div>
        )}

        {/* Tab 2: Choose from existing assets */}
        {activeTab === 'existing' && (
          <div className="asset-picker-tab-panel" role="tabpanel">
            {assets.length === 0 ? (
              <div className="asset-picker-empty">
                <div className="asset-picker-empty-icon">
                  <ImageIcon size={30} strokeWidth={1.4} />
                </div>
                <div className="font-medium text-sm text-[var(--text-primary,var(--presentation-text))] mt-2">
                  No assets uploaded yet
                </div>
                <p className="text-xs text-[var(--text-secondary,var(--presentation-muted))] mt-1 max-w-[260px]">
                  You have not uploaded any images to this space yet.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-soft,var(--presentation-accent-soft))] text-[var(--accent-solid,var(--presentation-accent))] hover:opacity-90"
                  onClick={() => setActiveTab('upload')}
                >
                  <UploadCloud size={14} />
                  Upload from system
                </button>
              </div>
            ) : (
              <>
                {assets.length > 4 && (
                  <div className="relative mb-3">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary,var(--presentation-muted))]"
                    />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Search existing assets…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border,var(--presentation-border))] bg-[var(--surface-soft,var(--presentation-surface))] text-[var(--text-primary,var(--presentation-text))] placeholder:text-[var(--text-secondary,var(--presentation-muted))] focus:outline-none focus:border-[var(--accent-solid,var(--presentation-accent))]"
                    />
                  </div>
                )}

                <div className="asset-grid">
                  {filteredAssets.map((asset) => {
                    const isSelected = asset.id === selectedAssetId
                    return (
                      <button
                        type="button"
                        key={asset.id}
                        className={`asset-grid-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedAssetId(asset.id)}
                        onDoubleClick={() => {
                          setSelectedAssetId(asset.id)
                          onSelectAsset(asset)
                          onClose()
                        }}
                        aria-label={`Select ${asset.filename}`}
                        aria-pressed={isSelected}
                      >
                        <div className="asset-card-thumb">
                          <img
                            src={asset.thumbnailUrl || asset.url}
                            alt={asset.altText || asset.filename}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        {isSelected && (
                          <div className="asset-card-badge">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                        <div className="asset-card-caption">
                          <span className="truncate">{asset.filename}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Modal actions footer */}
        <div className="asset-picker-actions">
          <div className="asset-picker-actions-left">
            {target?.currentImageUrl && onRemoveImage && (
              <button
                type="button"
                className="asset-action-remove"
                onClick={() => {
                  onRemoveImage()
                  onClose()
                }}
              >
                <Trash2 size={14} />
                <span>Remove image</span>
              </button>
            )}
          </div>

          <div className="asset-picker-actions-right">
            <button type="button" className="asset-action-cancel" onClick={onClose}>
              Cancel
            </button>

            {activeTab === 'upload' ? (
              <button
                type="button"
                className="asset-action-primary"
                disabled={!stagedFile || isUploading}
                onClick={handleConfirmUpload}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Upload and use</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="asset-action-primary"
                disabled={!selectedAsset}
                onClick={handleConfirmSelectExisting}
              >
                <Check size={14} />
                <span>Use selected asset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}
