import type { AppearanceAsset, AppearanceSpaceSummary } from '../../../api/appearance'
import { PublicSpaceExperience } from '../../public/PublicSpaceExperience'
import type { SpacePresentationConfig } from '../presentation/schema'
import type { PreviewDevice } from './DeviceSwitcher'
import { AppearancePreviewContent } from '../preview/types'

export function PublicLinkPreview({ space, config, assets, device, previewContent }: { space: AppearanceSpaceSummary; config: SpacePresentationConfig; assets: AppearanceAsset[]; device: PreviewDevice; previewContent?: AppearancePreviewContent }) {
  const selectedAsset = assets.find((asset) => asset.id === config.hero.assetId)
  const publicSpace = {
    id: space.id,
    handle: space.slug,
    displayName: space.displayName,
    description: space.description || '',
    avatarUrl: space.logoUrl || undefined,
    promptStarters: ['What do you offer?', 'Tell me about this Space'],
    auraEnabled: true,
    presentationConfig: config,
    heroAsset: selectedAsset ? { id: selectedAsset.id, url: selectedAsset.url, altText: selectedAsset.altText } : null,
    landingContent: previewContent,
  }
  return (
    <div className={`appearance-preview-frame ${device === 'mobile' ? 'is-mobile' : 'is-desktop'}`}>
      <PublicSpaceExperience space={publicSpace} presentationOverride={config} preview previewContent={previewContent} />
    </div>
  )
}
