import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { PublicSpace } from '../../services/aura/types'
import { useAuraChat } from '../../hooks/useAuraChat'
import { useChatAccount } from '../../hooks/useChatAccount'
import { auraAccountsEnabled } from '../../services/aura'
import { resolvePresentationConfig } from '../appearance/presentation/presentationResolver'
import { presentationThemeStyle } from '../appearance/presentation/themeTokens'
import { useArtworkAccent } from '../appearance/hooks/useArtworkAccent'
import { AuraExperience } from './components/AuraExperience'
import { PublicHeader } from './components/PublicHeader'
import { PublicNetworkBackground } from './components/PublicNetworkBackground'
import { ConversationSidebar } from './components/ConversationSidebar'
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversationViewKey, setConversationViewKey] = useState(0)
  const historyId = useId()
  const accountEnabled = !preview && auraAccountsEnabled
  const account = useChatAccount(accountEnabled)
  const [signingOut, setSigningOut] = useState(false)
  const chat = useAuraChat(space, { persist: !preview, network: !preview, accountId: account.user?.id, authReady: account.ready })
  const signInHref = accountEnabled ? `/yullo/auth?intent=chat&returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}` : undefined
  const accountName = account.user ? account.user.full_name || account.user.email || 'Yullo account' : undefined
  const previousAccount = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!account.ready) return
    const id = account.user?.id || null
    if (previousAccount.current !== undefined && previousAccount.current !== id) {
      setConversationViewKey(key => key + 1)
      setViewState('empty')
      setIdentityVisible(true)
      setHistoryOpen(false)
    }
    previousAccount.current = id
  }, [account.ready, account.user?.id])
  const savedPresentation = resolvePresentationConfig(presentationOverride || space.presentationConfig)
  const artworkColor = useArtworkAccent(space.isSubspace ? space.heroAsset?.url || space.avatarUrl : null)
  const inferredAccent = savedPresentation.presentationSource === 'default' && !savedPresentation.accentColor ? artworkColor : undefined
  const presentation = inferredAccent ? { ...savedPresentation, accentColor: inferredAccent } : savedPresentation
  const assetId = presentation.hero.assetId
  const heroAssetUrl = presentation.hero.visible === false ? undefined : assetId
    ? preview
      ? space.heroAsset?.url || `/api/v1/yullo/spaces/${space.id}/appearance/assets/${assetId}/content`
      : space.heroAsset?.url || `/api/v1/yullo/public/assets/${assetId}`
    : space.isSubspace || presentation.hero.layout !== 'centered' || presentation.backgroundTreatment === 'image' ? space.avatarUrl : undefined
  const usesBackgroundImage = !space.isSubspace && Boolean(heroAssetUrl) && (presentation.backgroundTreatment === 'image' || presentation.hero.layout === 'image_background')
  const themeStyle = presentationThemeStyle(presentation)
  if (space.isSubspace && presentation.backgroundTreatment === 'image') {
    themeStyle['--presentation-canvas'] = `color-mix(in srgb, var(--presentation-artwork-accent) 8%, ${themeStyle['--presentation-canvas']})`
  }

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
      style={{ ...themeStyle, '--presentation-artwork-accent': artworkColor || 'var(--presentation-accent)' } as CSSProperties}
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
        <PublicHeader space={space} identityVisible={identityVisible}
          signInHref={signInHref} accountName={accountName} busy={chat.isSending || signingOut}
          historyOpen={historyOpen} historyId={preview ? undefined : historyId}
          onHistoryToggle={preview ? undefined : () => {
            chat.refreshHistory()
            setHistoryOpen(open => !open)
          }} />
        {account.error && <p role="status" className="px-6 py-2 text-sm text-[var(--presentation-muted)]">{account.error} <button type="button" onClick={account.retry} className="underline">Try again</button></p>}
        {!account.error && (!account.ready || chat.isRestoring) && <p role="status" className="px-6 py-2 text-sm text-[var(--presentation-muted)]">Opening your chat…</p>}
        {chat.historyError && <p role="status" className="px-6 py-2 text-sm text-[var(--presentation-muted)]">{chat.historyError} <button type="button" onClick={() => { void chat.refreshHistory(); setHistoryOpen(true) }} className="underline">View chats</button></p>}
        <AuraExperience
          key={conversationViewKey}
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
      {!preview && <ConversationSidebar
        id={historyId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={chat.history}
        conversationId={chat.conversationId}
        isSending={chat.isSending || signingOut}
        accountName={accountName}
        signInHref={signInHref}
        loading={chat.historyLoading || chat.isRestoring}
        hasMore={Boolean(chat.historyBefore)}
        onLoadMore={() => void chat.loadMoreHistory()}
        onRetry={chat.retryHistory}
        error={chat.historyError}
        onSignOut={async () => {
          if (chat.isSending || signingOut) return
          setSigningOut(true)
          try { await account.signOut() } finally { setSigningOut(false) }
        }}
        onSelect={async id => {
          if (id === chat.conversationId) {
            setHistoryOpen(false)
          } else if (await chat.selectConversation(id)) {
            setViewState('conversation')
            setConversationViewKey(key => key + 1)
            setHistoryOpen(false)
          }
        }}
        onNew={() => {
          if (!chat.newConversation()) return
          setViewState('empty')
          setIdentityVisible(true)
          setConversationViewKey(key => key + 1)
          setHistoryOpen(false)
        }}
      />}
    </div>
  )
}
