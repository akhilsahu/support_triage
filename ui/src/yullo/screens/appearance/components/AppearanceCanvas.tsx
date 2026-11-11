import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { AppearanceAsset, AppearanceSpaceSummary } from '../../../api/appearance'
import type { SpacePresentationConfig } from '../presentation/schema'
import { DeviceSwitcher, type PreviewDevice } from './DeviceSwitcher'
import { PublicLinkPreview } from './PublicLinkPreview'
import { AppearancePreviewContent } from '../preview/types'

export function AppearanceCanvas({ space, config, assets, device, onDeviceChange, previewContent, isGenerating }: { space: AppearanceSpaceSummary; config: SpacePresentationConfig; assets: AppearanceAsset[]; device: PreviewDevice; onDeviceChange: (device: PreviewDevice) => void; previewContent?: AppearancePreviewContent; isGenerating?: boolean }) {
  const [zoom, setZoom] = useState(1)
  return (
    <section className="appearance-canvas" aria-label="Live Yullo Link preview">
      <div className="appearance-canvas-bar">
        <span>Live preview</span>
        <div className="appearance-preview-controls">
          <div className="appearance-preview-zoom" role="group" aria-label="Preview zoom relative to fit">
            <button type="button" aria-label="Zoom out preview" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><Minus size={15} /></button>
            <output aria-live="polite" aria-label="Preview zoom">{Math.round(zoom * 100)}%</output>
            <button type="button" aria-label="Zoom in preview" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus size={15} /></button>
            <button type="button" onClick={() => setZoom(1)} title="Fit preview to available width">Fit</button>
          </div>
          <DeviceSwitcher value={device} onChange={onDeviceChange} />
        </div>
      </div>
      <div className={`appearance-preview-stage ${isGenerating ? 'is-generating' : ''}`}><PublicLinkPreview space={space} config={config} assets={assets} device={device} previewContent={previewContent} zoom={zoom} /></div>
    </section>
  )
}
