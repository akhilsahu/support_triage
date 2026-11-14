import type { CSSProperties } from 'react'
import type { SpacePresentationConfig } from './schema'

const accents: Record<SpacePresentationConfig['accent'], string> = {
  yullo: '#FFFC00',
  blue: '#3F73D8',
  cyan: '#2589A7',
  violet: '#7759C8',
  coral: '#C85F50',
  forest: '#377A58',
  neutral: '#596273',
}

const backgrounds: Record<SpacePresentationConfig['backgroundTreatment'], { canvas: string; surface: string; text: string; muted: string; border: string }> = {
  soft: { canvas: '#F6F7F8', surface: '#FFFFFF', text: '#151B27', muted: '#475467', border: 'rgba(21,27,39,.10)' },
  light: { canvas: '#FFFFFF', surface: '#F8F9FA', text: '#111827', muted: '#475467', border: 'rgba(17,24,39,.10)' },
  dark: { canvas: '#11151C', surface: '#181D25', text: '#F5F7FA', muted: '#CBD2DC', border: 'rgba(245,247,250,.12)' },
  image: { canvas: '#F2F2EF', surface: 'rgba(255,255,255,.88)', text: '#171914', muted: '#4B5146', border: 'rgba(23,25,20,.10)' },
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

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map(value => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

// Keep accent text readable on its actual surface, including very pale artwork colors.
function readableAccent(color: string, surface: string): string {
  const background = luminance(surface)
  for (let step = 0; step <= 20; step++) {
    const amount = step / 20
    const target = background > 0.179 ? 0 : 255
    const mixed = '#' + color.slice(1).match(/../g)!.map(value =>
      Math.round(Number.parseInt(value, 16) * (1 - amount) + target * amount).toString(16).padStart(2, '0'),
    ).join('')
    const foreground = luminance(mixed)
    if ((Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05) >= 4.5) return mixed
  }
  return background > 0.179 ? '#000000' : '#FFFFFF'
}

export function presentationAccent(config: SpacePresentationConfig, dark = config.backgroundTreatment === 'dark') {
  const solid = config.accentColor || accents[config.accent]
  return {
    solid,
    soft: `color-mix(in srgb, ${solid} 12%, transparent)`,
    ink: readableAccent(solid, dark ? '#181D25' : '#FFFFFF'),
    contrast: luminance(solid) > 0.179 ? '#000000' : '#FFFFFF',
  }
}

export function presentationThemeStyle(config: SpacePresentationConfig): PresentationStyle {
  const accent = presentationAccent(config)
  const background = backgrounds[config.backgroundTreatment]
  const preset = presets[config.themePreset]
  const isStretch = config.contentLayout === 'stretch'
  return {
    '--presentation-canvas': config.accentColor && config.presentationSource === 'default'
      ? `color-mix(in srgb, ${accent.solid} 5%, ${background.canvas})` : background.canvas,
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
    '--presentation-content-width': isStretch ? '100%' : `${Math.min(1440, Number.parseFloat(preset.width) * 1.25)}px`,
    '--presentation-section-gap': preset.gap,
    '--presentation-card-shadow': preset.shadow,
    '--presentation-hero-scale': preset.heroScale,
  }
}
