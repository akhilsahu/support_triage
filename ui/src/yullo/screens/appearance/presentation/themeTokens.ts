import type { CSSProperties } from 'react'
import type { SpacePresentationConfig } from './schema'

const accents: Record<SpacePresentationConfig['accent'], { solid: string; soft: string; ink: string; contrast: string }> = {
  yullo: { solid: '#E4CC32', soft: 'rgba(228,204,50,.10)', ink: '#514600', contrast: '#151B27' },
  blue: { solid: '#3F73D8', soft: 'rgba(63,115,216,.09)', ink: '#17376F', contrast: '#FFFFFF' },
  cyan: { solid: '#2589A7', soft: 'rgba(37,137,167,.09)', ink: '#104A5C', contrast: '#FFFFFF' },
  violet: { solid: '#7759C8', soft: 'rgba(119,89,200,.09)', ink: '#3B286F', contrast: '#FFFFFF' },
  coral: { solid: '#C85F50', soft: 'rgba(200,95,80,.09)', ink: '#6C2C24', contrast: '#FFFFFF' },
  forest: { solid: '#377A58', soft: 'rgba(55,122,88,.09)', ink: '#19452F', contrast: '#FFFFFF' },
  neutral: { solid: '#596273', soft: 'rgba(89,98,115,.08)', ink: '#252B36', contrast: '#FFFFFF' },
}

const backgrounds: Record<SpacePresentationConfig['backgroundTreatment'], { canvas: string; surface: string; text: string; muted: string; border: string }> = {
  soft: { canvas: '#F6F7F8', surface: '#FFFFFF', text: '#151B27', muted: '#667085', border: 'rgba(21,27,39,.10)' },
  light: { canvas: '#FFFFFF', surface: '#F8F9FA', text: '#111827', muted: '#626B79', border: 'rgba(17,24,39,.10)' },
  dark: { canvas: '#11151C', surface: '#181D25', text: '#F5F7FA', muted: '#A7B0BD', border: 'rgba(245,247,250,.12)' },
  image: { canvas: '#F2F2EF', surface: 'rgba(255,255,255,.88)', text: '#171914', muted: '#6D7167', border: 'rgba(23,25,20,.10)' },
}

const presets: Record<SpacePresentationConfig['themePreset'], { heading: string; radius: string; weight: string; tracking: string; width: string; gap: string; shadow: string; heroScale: string }> = {
  clean: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '18px', weight: '500', tracking: '-0.025em', width: '960px', gap: '64px', shadow: '0 12px 34px rgba(15,23,42,.06)', heroScale: '1' },
  professional: { heading: 'Instrument Sans, sans-serif', radius: '10px', weight: '650', tracking: '-0.018em', width: '900px', gap: '48px', shadow: 'none', heroScale: '.94' },
  technical: { heading: 'Instrument Sans, sans-serif', radius: '5px', weight: '600', tracking: '-0.012em', width: '1040px', gap: '40px', shadow: 'none', heroScale: '.92' },
  warm: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '26px', weight: '500', tracking: '-0.028em', width: '920px', gap: '72px', shadow: '0 18px 48px rgba(65,45,20,.08)', heroScale: '1.04' },
  editorial: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '3px', weight: '500', tracking: '-0.035em', width: '860px', gap: '80px', shadow: 'none', heroScale: '1.08' },
  visual: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '28px', weight: '700', tracking: '-0.04em', width: '1120px', gap: '88px', shadow: '0 26px 70px rgba(15,23,42,.12)', heroScale: '1.14' },
  bold: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '8px', weight: '700', tracking: '-0.045em', width: '1080px', gap: '72px', shadow: '8px 8px 0 var(--presentation-accent)', heroScale: '1.1' },
  minimal: { heading: 'Instrument Sans, sans-serif', radius: '2px', weight: '500', tracking: '-0.02em', width: '760px', gap: '56px', shadow: 'none', heroScale: '.9' },
  personal: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '24px', weight: '500', tracking: '-0.03em', width: '820px', gap: '70px', shadow: '0 16px 44px rgba(15,23,42,.06)', heroScale: '1.02' },
  community: { heading: 'Satoshi, Instrument Sans, sans-serif', radius: '20px', weight: '650', tracking: '-0.025em', width: '1020px', gap: '64px', shadow: '0 14px 42px rgba(15,23,42,.07)', heroScale: '1.05' },
  trustworthy: { heading: 'Instrument Sans, sans-serif', radius: '10px', weight: '650', tracking: '-0.015em', width: '920px', gap: '52px', shadow: 'none', heroScale: '.96' },
}

export type PresentationStyle = CSSProperties & Record<`--presentation-${string}`, string>

export function presentationThemeStyle(config: SpacePresentationConfig): PresentationStyle {
  const accent = accents[config.accent]
  const background = backgrounds[config.backgroundTreatment]
  const preset = presets[config.themePreset]
  const isStretch = config.contentLayout === 'stretch'
  return {
    '--presentation-canvas': background.canvas,
    '--presentation-surface': background.surface,
    '--presentation-text': background.text,
    '--presentation-muted': background.muted,
    '--presentation-border': background.border,
    '--presentation-accent': accent.solid,
    '--presentation-accent-soft': accent.soft,
    '--presentation-accent-ink': accent.ink,
    '--presentation-accent-contrast': accent.contrast,
    '--presentation-heading-font': preset.heading,
    '--presentation-radius': preset.radius,
    '--presentation-heading-weight': preset.weight,
    '--presentation-heading-tracking': preset.tracking,
    '--presentation-content-width': isStretch ? '100%' : preset.width,
    '--presentation-section-gap': preset.gap,
    '--presentation-card-shadow': preset.shadow,
    '--presentation-hero-scale': preset.heroScale,
  }
}
