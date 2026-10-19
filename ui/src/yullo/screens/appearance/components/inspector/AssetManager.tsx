import { ImagePlus, Trash2 } from 'lucide-react'
import type { AppearanceAsset } from '../../../../api/appearance'

export function AssetManager({
  assets,
  selectedId,
  uploading,
  error,
  notice,
  onUpload,
  onSelect,
  onRemove,
  onAltText,
  onOpenPicker,
}: {
  assets: AppearanceAsset[]
  selectedId?: string | null
  uploading?: boolean
  error?: string
  notice?: string
  onUpload: (files: File[]) => void
  onSelect: (asset: AppearanceAsset | null) => void
  onRemove: (asset: AppearanceAsset) => void
  onAltText: (asset: AppearanceAsset, altText: string) => void
  onOpenPicker?: () => void
}) {
  const selected = assets.find((asset) => asset.id === selectedId)
  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) onUpload?.(Array.from(event.target.files))
    event.target.value = ''
  }
  return (
    <div>
      <div className="appearance-assets">
        <div className={`appearance-asset ${!selectedId ? 'is-selected' : ''}`}>
          <button type="button" onClick={() => onSelect(null)} aria-label="No image" aria-pressed={!selectedId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            None
          </button>
        </div>
        {assets.map((asset) => (
          <div key={asset.id} className={`appearance-asset ${selectedId === asset.id ? 'is-selected' : ''}`}>
            <button type="button" onClick={() => onSelect(asset)} aria-label={`Use ${asset.filename} as hero image`} aria-pressed={selectedId === asset.id}>
              <img src={asset.thumbnailUrl || asset.url} alt={asset.altText || ''} />
            </button>
            {asset.sourceType !== 'extracted' && (
              <button
                type="button"
                className="appearance-asset-remove"
                onClick={() => onRemove(asset)}
                aria-label={`Remove ${asset.filename}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {onOpenPicker ? (
          <button
            type="button"
            className="appearance-add-asset"
            onClick={onOpenPicker}
            aria-label="Add or select image"
          >
            <ImagePlus size={20} />
            <span>{uploading ? 'Adding…' : 'Add image'}</span>
          </button>
        ) : (
          <label className="appearance-add-asset">
            <ImagePlus size={20} />
            <span>{uploading ? 'Adding…' : 'Add image'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={handleFiles} />
          </label>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-xs text-[var(--text-secondary)]" role="status">{notice}</p>}
      {assets.length === 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">Add an image to use it as a hero or background.</p>}
      {assets.length > 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">Select an image or "None" for the opening.</p>}
      <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">Uploads and image descriptions save immediately. Placement publishes with Save appearance.</p>
      {selected && <label className="appearance-asset-alt"><span>Image description</span><input key={`${selected.id}:${selected.altText || ''}`} defaultValue={selected.altText || ''} maxLength={300} placeholder="Describe this image" onBlur={(event) => onAltText(selected, event.currentTarget.value)} /></label>}
    </div>
  )
}
