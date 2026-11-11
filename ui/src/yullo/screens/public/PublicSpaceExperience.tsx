import { useState } from 'react'
import type { PublicSpace } from '../../services/aura/types'
import { useAuraChat } from '../../hooks/useAuraChat'
import { resolvePresentationConfig } from '../appearance/presentation/presentationResolver'
import { presentationThemeStyle } from '../appearance/presentation/themeTokens'
import { AuraExperience } from './components/AuraExperience'
import { PublicHeader } from './components/PublicHeader'
import { PublicNetworkBackground } from './components/PublicNetworkBackground'
import type { AuraViewState } from './PublicYulloLink'

import { AppearancePreviewContent } from '../appearance/preview/types'

interface PublicSpaceExperienceProps {
  space: PublicSpace
  presentationOverride?: PublicSpace['presentationConfig']
  preview?: boolean
  previewContent?: AppearancePreviewContent
}

export function PublicSpaceExperience({ space, presentationOverride, preview = false, previewContent }: PublicSpaceExperienceProps) {
  const [viewState, setViewState] = useState<AuraViewState>('empty')
  const [networkPulse, setNetworkPulse] = useState(0)
  const [identityVisible, setIdentityVisible] = useState(true)
  const chat = useAuraChat(space, { persist: !preview, network: !preview })
  const presentation = resolvePresentationConfig(presentationOverride || space.presentationConfig)
  const assetId = presentation.hero.assetId
  const heroAssetUrl = assetId
    ? preview
      ? space.heroAsset?.url || `/api/v1/yullo/spaces/${space.id}/appearance/assets/${assetId}/content`
      : space.heroAsset?.url || `/api/v1/yullo/public/assets/${assetId}`
    : undefined
  const usesBackgroundImage = Boolean(heroAssetUrl) && (presentation.backgroundTreatment === 'image' || presentation.hero.layout === 'image_background')

  const handleMessageSent = () => {
    if (viewState === 'empty') {
      setViewState('transitioning')
      window.setTimeout(() => setViewState('conversation'), 220)
    }
    setNetworkPulse((value) => value + 1)
  }

  return (
    <div
      className={`yullo-public relative w-full overflow-hidden bg-[var(--presentation-canvas)] text-[var(--presentation-text)] font-[Instrument_Sans] transition-colors duration-200 ${preview ? 'h-full min-h-0' : 'min-h-[100dvh]'}`}
      style={presentationThemeStyle(presentation)}
      data-theme-preset={presentation.themePreset}
      data-density={presentation.visualDensity}
      data-preview={preview || undefined}
    >
      {usesBackgroundImage && (
        <div className="absolute inset-0 z-0" aria-hidden="true">
          <img src={heroAssetUrl} alt="" className="h-full w-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--presentation-canvas)_0%,transparent_42%,var(--presentation-canvas)_100%)]" />
        </div>
      )}
      <div className={`${preview ? 'absolute' : 'fixed'} inset-0 z-0 pointer-events-none`}>
        <PublicNetworkBackground
          state={viewState === 'conversation' ? 'conversation' : 'empty'}
          pulseKey={networkPulse}
          intensity={presentation.networkIntensity}
        />
      </div>
      <div className={`relative z-10 flex flex-col pb-[env(safe-area-inset-bottom)] ${preview ? 'h-full' : 'h-[100dvh]'}`}>
        <PublicHeader space={space} identityVisible={identityVisible} />
        <AuraExperience
          space={space}
          presentation={presentation}
          heroAssetUrl={usesBackgroundImage ? undefined : heroAssetUrl}
          heroAssetAltText={space.heroAsset?.altText || ''}
          viewState={viewState}
          chat={chat}
          onMessageSent={handleMessageSent}
          onIdentityVisibilityChange={setIdentityVisible}
          previewContent={previewContent || space.landingContent}
        />
      </div>
    </div>
  )
}
