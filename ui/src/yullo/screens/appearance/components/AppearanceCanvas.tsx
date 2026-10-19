import type { AppearanceAsset, AppearanceSpaceSummary } from '../../../api/appearance'
import type { SpacePresentationConfig } from '../presentation/schema'
import { DeviceSwitcher, type PreviewDevice } from './DeviceSwitcher'
import { PublicLinkPreview } from './PublicLinkPreview'
import { AppearancePreviewContent } from '../preview/types'

export function AppearanceCanvas({ space, config, assets, device, onDeviceChange, previewContent, isGenerating }: { space: AppearanceSpaceSummary; config: SpacePresentationConfig; assets: AppearanceAsset[]; device: PreviewDevice; onDeviceChange: (device: PreviewDevice) => void; previewContent?: AppearancePreviewContent; isGenerating?: boolean }) {
  return (
    <section className="appearance-canvas" aria-label="Live Yullo Link preview">
      <div className="appearance-canvas-bar"><span>Live preview</span><DeviceSwitcher value={device} onChange={onDeviceChange} /></div>
      <div className={`appearance-preview-stage ${isGenerating ? 'is-generating' : ''}`}><PublicLinkPreview space={space} config={config} assets={assets} device={device} previewContent={previewContent} /></div>
    </section>
  )
}
