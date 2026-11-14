import { YulloButton } from '../../../../components/core/YulloButton'
import { BookingLinks } from '../../../../forms/BookingLinks'
import { motion } from 'motion/react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { AppearanceAsset, AppearanceCandidate } from '../../../../api/appearance'
import type { SpacePurpose } from '../../presentation/presets'
import type { SpacePresentationConfig } from '../../presentation/schema'
import { AccentPicker } from './AccentPicker'
import { AssetManager } from './AssetManager'
import { BackgroundPicker } from './BackgroundPicker'
import { LandingEmphasisPicker } from './LandingEmphasisPicker'
import { ThemePresetPicker } from './ThemePresetPicker'
import { ContentLayoutPicker } from './ContentLayoutPicker'
import { AppearanceAuraDesigner } from '../aura/AppearanceAuraDesigner'
import { PreviewDirection } from '../../preview/PreviewDirection'
import type { AppearancePreviewContent, PreviewSectionType } from '../../preview/types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="appearance-inspector-section"><h2>{title}</h2>{children}</section>
}

import { useState } from 'react'

const editablePreviewTypes: PreviewSectionType[] = ['services', 'portfolio', 'products', 'location', 'featured']

function SectionRow({ section, index, config, update, moveSection, previewContent, hasDraft, generating, applying, exampleVisible, onToggleExample, onBuild, onApply, onDiscard, onReviewDraft }: {
  section: any; index: number; config: any; update: any; moveSection: any; previewContent?: AppearancePreviewContent;
  hasDraft: boolean; generating: boolean; applying: boolean; exampleVisible: boolean;
  onToggleExample: () => void; onBuild: () => void; onApply: () => void; onDiscard: () => void; onReviewDraft: () => void;
}) {
  const [expanded, setExpanded] = useState(false)
  const previewSection = previewContent?.sections.find((s: any) => s.type === section.type)
  const items = (previewSection?.items || []).filter((i: any) => i.source !== 'example')
  const hasData = items.length > 0
  const editable = editablePreviewTypes.includes(section.type as PreviewSectionType)

  return (
    <div className="appearance-section-container">
      <div className="appearance-section-row" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: '8px', alignItems: 'center' }}>
        {hasData ? (
          <div role="button" tabIndex={0} onClick={() => setExpanded(!expanded)} onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)} aria-label="Toggle data" style={{ color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        ) : (
          <div style={{ width: 23 }} />
        )}
        <YulloButton variant="outline" size="sm" type="button" aria-pressed={section.visible} onClick={() => update('sections', config.sections.map((item: any) => item.type === section.type ? { ...item, visible: !item.visible } : item))}>
          <span>{section.type.replace(/_/g, ' ')}</span><i />
        </YulloButton>
        <span className="appearance-order-actions">
          {editable && section.visible && (
            <YulloButton variant="outline" size="sm"
              type="button"
              className="appearance-section-pull-btn"
              onClick={onBuild}
              disabled={generating}
              title={`Pull data for ${section.type}`}
              aria-label={`Pull data for ${section.type}`}
            >
              <RefreshCw size={13} />
            </YulloButton>
          )}
          <YulloButton variant="outline" size="sm" type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Move ${section.type} up`}><ChevronUp size={15} /></YulloButton>
          <YulloButton variant="outline" size="sm" type="button" onClick={() => moveSection(index, 1)} disabled={index === config.sections.length - 1} aria-label={`Move ${section.type} down`}><ChevronDown size={15} /></YulloButton>
        </span>
      </div>
      {expanded && hasData && (
        <div className="appearance-section-data" style={{ padding: '0 12px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {items.map((item: any) => (
            <div key={item.key} style={{ marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              • {item.title}
            </div>
          ))}
        </div>
      )}
      {editable && section.visible && hasDraft && (
        <div className="appearance-section-controls">
          <YulloButton variant="outline" size="sm" type="button" onClick={onReviewDraft || onBuild}>Review pulled data</YulloButton>
          <YulloButton variant="primary" size="sm" type="button" className="is-primary" onClick={onApply} disabled={applying}>{applying ? 'Adding…' : 'Add to section'}</YulloButton>
          <YulloButton variant="outline" size="sm" type="button" onClick={onDiscard} disabled={applying}>Cancel</YulloButton>
        </div>
      )}
    </div>
  )
}

function Group({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details className="appearance-inspector-group" open={open}><summary>{title}<ChevronDown size={16} /></summary><div className="appearance-inspector-group-body">{children}</div></details>
}

export function AppearanceInspector({ 
  spaceId, purpose, config, assets, coverUrl, isSubspace, assetUploading, assetError, assetNotice,
  previewStatus, previewGenerating, previewGroundedCount, previewLastUpdate, previewExplanation, previewContent, onPreviewRebuild,
  previewDraftType, previewDraftTypes, previewApplying, exampleSections, onToggleExample, onBuildSection, onApplySection, onDiscardSection, onReviewDraftSection,
  onChange, onAuraApply, onUpload, onRemoveAsset, onAssetAltText, onOpenAssetPicker
}: { 
  spaceId: string; purpose: SpacePurpose; config: SpacePresentationConfig; assets: AppearanceAsset[]; coverUrl?: string | null; isSubspace?: boolean; assetUploading?: boolean; assetError?: string; assetNotice?: string;
  previewStatus: 'idle' | 'ready' | 'insufficient_context' | 'unavailable'; previewGenerating: boolean; previewGroundedCount: number; previewLastUpdate: number; previewExplanation?: string; previewContent?: AppearancePreviewContent; onPreviewRebuild: () => void;
  previewDraftType?: PreviewSectionType; previewDraftTypes?: PreviewSectionType[]; previewApplying: boolean; exampleSections: PreviewSectionType[]; onToggleExample: (type: PreviewSectionType) => void; onBuildSection: (type: PreviewSectionType) => void; onApplySection: (type?: PreviewSectionType) => void; onDiscardSection: (type?: PreviewSectionType) => void; onReviewDraftSection?: (type: PreviewSectionType) => void;
  onChange: (next: SpacePresentationConfig) => void; onAuraApply: (candidate: AppearanceCandidate) => void; onUpload: (files: File[]) => void; onRemoveAsset: (asset: AppearanceAsset) => void; onAssetAltText: (asset: AppearanceAsset, altText: string) => void;
  onOpenAssetPicker?: () => void
}) {
  const update = <K extends keyof SpacePresentationConfig>(key: K, value: SpacePresentationConfig[K]) => onChange({ ...config, [key]: value })
  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= config.sections.length) return
    const sections = [...config.sections]
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    update('sections', sections)
  }
  const draftTypes = previewDraftTypes || (previewDraftType ? [previewDraftType] : [])
  return (
    <motion.aside className="appearance-inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>
      <div className="appearance-inspector-inner">
        <PreviewDirection status={previewStatus} isGenerating={previewGenerating} groundedCount={previewGroundedCount} lastUpdate={previewLastUpdate} explanation={previewExplanation} onRebuild={onPreviewRebuild} />
        <Section title="Theme"><ThemePresetPicker purpose={purpose} value={config.themePreset} onChange={(value) => update('themePreset', value)} /></Section>
        <Section title="Content layout"><ContentLayoutPicker value={config.contentLayout || 'center'} onChange={(value) => update('contentLayout', value)} /></Section>
        <Section title="Landing emphasis"><LandingEmphasisPicker purpose={purpose} value={config.landingEmphasis} onChange={(value) => update('landingEmphasis', value)} /></Section>
        <Section title="Accent"><AccentPicker value={config.accent} customColor={config.accentColor} onChange={(value) => onChange({ ...config, accent: value, accentColor: null })} onCustomColor={value => update('accentColor', value)} /></Section>
        <Section title="Background"><BackgroundPicker value={config.backgroundTreatment} imageEnabled={Boolean(config.hero.assetId) || Boolean(coverUrl)} imageLabel={isSubspace ? 'Artwork tint' : undefined} onChange={(value) => update('backgroundTreatment', value)} /></Section>
        {isSubspace && <Section title="Booking button"><p className="mb-2 text-xs leading-relaxed text-[var(--text-secondary)]">Enable a booking link for visitors to show its button on this page.</p><BookingLinks spaceId={spaceId} spaceName="this page" itemLabel="item" compact /></Section>}
        <Group title="Content and order" open>
        <Section title="Opening sections">
          <div className="appearance-section-list">
            {config.sections.map((section, index) => (
              <SectionRow 
                key={section.type}
                section={section}
                index={index}
                config={config}
                update={update}
                moveSection={moveSection}
                previewContent={previewContent}
                hasDraft={draftTypes.includes(section.type as PreviewSectionType)}
                generating={previewGenerating}
                applying={previewApplying}
                exampleVisible={exampleSections.includes(section.type as PreviewSectionType)}
                onToggleExample={() => onToggleExample(section.type as PreviewSectionType)}
                onBuild={() => onBuildSection(section.type as PreviewSectionType)}
                onApply={() => onApplySection(section.type as PreviewSectionType)}
                onDiscard={() => onDiscardSection(section.type as PreviewSectionType)}
                onReviewDraft={() => onReviewDraftSection?.(section.type as PreviewSectionType)}
              />
            ))}
          </div>
        </Section>
        </Group>
        <Group title="Images and layout">
        <Section title="Assets"><AssetManager assets={assets} coverUrl={isSubspace ? coverUrl : undefined} imageVisible={config.hero.visible !== false} onUseCover={() => onChange({ ...config, hero: { ...config.hero, assetId: null, visible: true } })} selectedId={config.hero.assetId} uploading={assetUploading} error={assetError} notice={assetNotice} onUpload={onUpload} onSelect={(asset) => onChange({ ...config, hero: { ...config.hero, assetId: asset ? asset.id : null, visible: Boolean(asset) }, backgroundTreatment: config.backgroundTreatment === 'image' && !asset ? 'soft' : config.backgroundTreatment })} onRemove={onRemoveAsset} onAltText={onAssetAltText} onOpenPicker={onOpenAssetPicker} /></Section>
        {(config.hero.assetId || coverUrl) && <Section title="Opening image"><div className="appearance-choice-row" role="radiogroup" aria-label="Opening image layout">{(isSubspace ? ['centered', 'image_left', 'image_right'] as const : ['centered', 'image_left', 'image_right', 'image_background'] as const).map((value) => <button type="button" key={value} role="radio" aria-checked={config.hero.layout === value || (isSubspace && value === 'centered' && config.hero.layout === 'image_background')} onClick={() => onChange({ ...config, hero: { ...config.hero, layout: value } })}>{isSubspace ? ({ centered: 'Artwork above', image_left: 'Artwork left', image_right: 'Artwork right', image_background: 'Artwork tint' })[value] : value.replace(/_/g, ' ')}</button>)}</div></Section>}
        </Group>
        <Group title="Advanced">
        <Section title="Layout details">
          <p className="appearance-field-label">Visual density</p><div className="appearance-choice-row mb-4" role="radiogroup" aria-label="Visual density">{(['minimal', 'balanced', 'expressive'] as const).map((value) => <button type="button" key={value} role="radio" aria-checked={config.visualDensity === value} onClick={() => update('visualDensity', value)}>{value}</button>)}</div>
          <p className="appearance-field-label">Network field</p><div className="appearance-choice-row" role="radiogroup" aria-label="Network intensity">{(['none', 'very_low', 'low'] as const).map((value) => <button type="button" key={value} role="radio" aria-checked={config.networkIntensity === value} onClick={() => update('networkIntensity', value)}>{value.replace(/_/g, ' ')}</button>)}</div>
        </Section>
        </Group>
        <section className="appearance-inspector-section appearance-aura-section"><h2>Aura designer</h2><AppearanceAuraDesigner spaceId={spaceId} config={config} onApply={onAuraApply} /></section>
      </div>
    </motion.aside>
  )
}
