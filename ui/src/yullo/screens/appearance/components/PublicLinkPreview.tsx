import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppearanceAsset, AppearanceSpaceSummary } from '../../../api/appearance'
import { PublicSpaceExperience } from '../../public/PublicSpaceExperience'
import type { SpacePresentationConfig } from '../presentation/schema'
import type { PreviewDevice } from './DeviceSwitcher'
import { AppearancePreviewContent } from '../preview/types'

const previewDocument = '<!doctype html><html><head><style>html,body,#public-preview-root{margin:0;width:100%;height:100%;overflow:hidden}body{background:transparent}</style></head><body><div id="public-preview-root"></div></body></html>'

export function PublicLinkPreview({ space, config, assets, device, previewContent, zoom = 1 }: { space: AppearanceSpaceSummary; config: SpacePresentationConfig; assets: AppearanceAsset[]; device: PreviewDevice; previewContent?: AppearancePreviewContent; zoom?: number }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameDocument, setFrameDocument] = useState<Document | null>(null)
  const [desktopViewport, setDesktopViewport] = useState(() => ({ width: Math.max(1280, window.innerWidth), height: window.innerHeight }))
  const viewport = device === 'mobile' ? { width: 390, height: 844 } : desktopViewport
  // Measure the scroll viewport, never the zoomed frame: otherwise zoom feeds
  // its own resized width back into the next scale calculation.
  const fittedWidth = Math.max(0, (device === 'mobile' ? Math.min(frameWidth, 390) : frameWidth) - 2)
  const scaledWidth = fittedWidth * zoom
  const scale = frameWidth ? scaledWidth / viewport.width : 1

  useLayoutEffect(() => {
    const measure = () => {
      setFrameWidth(frameRef.current?.clientWidth || 0)
      setDesktopViewport({ width: Math.max(1280, window.innerWidth), height: window.innerHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (frameRef.current) observer.observe(frameRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useLayoutEffect(() => {
    if (!frameDocument) return
    // An iframe gives media queries and vw/vh the same real viewport as the
    // public page. A React portal retains the editor's controls and draft state.
    const syncStyles = () => {
      frameDocument.head.querySelectorAll('[data-preview-style]').forEach(node => node.remove())
      document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
        const clone = node.cloneNode(true) as HTMLElement
        clone.setAttribute('data-preview-style', '')
        frameDocument.head.appendChild(clone)
      })
    }
    const syncTheme = () => {
      frameDocument.documentElement.className = document.documentElement.className
      frameDocument.documentElement.lang = document.documentElement.lang || 'en'
      for (const name of ['data-theme', 'data-accent', 'style']) {
        const value = document.documentElement.getAttribute(name)
        if (value === null) frameDocument.documentElement.removeAttribute(name)
        else frameDocument.documentElement.setAttribute(name, value)
      }
    }
    syncStyles()
    syncTheme()
    const styles = new MutationObserver(syncStyles)
    styles.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true })
    const theme = new MutationObserver(syncTheme)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-accent', 'style'] })
    return () => { styles.disconnect(); theme.disconnect() }
  }, [frameDocument])

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
    <div ref={frameRef} className="appearance-preview-viewport">
      <div className="appearance-preview-surface">
        <div className={`appearance-preview-frame ${device === 'mobile' ? 'is-mobile' : 'is-desktop'}`}
          style={{ position: 'relative', flexShrink: 0, minHeight: 0, width: frameWidth ? scaledWidth + 2 : undefined, height: frameWidth ? viewport.height * scale + 2 : undefined }}>
          <iframe title={`${device === 'mobile' ? 'Mobile' : 'Desktop'} public page preview`}
            srcDoc={previewDocument}
            sandbox="allow-same-origin allow-modals"
            onLoad={event => setFrameDocument(event.currentTarget.contentDocument)}
            style={{ position: 'absolute', inset: 0, width: viewport.width, height: viewport.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
          {frameDocument?.getElementById('public-preview-root') && createPortal(
            <PublicSpaceExperience space={publicSpace} presentationOverride={config} preview previewContent={previewContent} />,
            frameDocument.getElementById('public-preview-root')!,
          )}
        </div>
      </div>
    </div>
  )
}
