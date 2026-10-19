import type { SpacePresentationConfig } from './schema'

export type SpacePurpose = 'business' | 'creator' | 'person' | 'organization'

export const PURPOSE_PRESETS: Record<SpacePurpose, SpacePresentationConfig['themePreset'][]> = {
  business: ['clean', 'professional', 'technical', 'warm'],
  creator: ['editorial', 'visual', 'bold', 'warm'],
  person: ['minimal', 'personal', 'editorial', 'professional'],
  organization: ['community', 'trustworthy', 'editorial', 'bold'],
}

export const PURPOSE_EMPHASIS: Record<SpacePurpose, SpacePresentationConfig['landingEmphasis'][]> = {
  business: ['balanced', 'services', 'visual', 'local', 'minimal'],
  creator: ['balanced', 'visual', 'services', 'minimal'],
  person: ['balanced', 'visual', 'minimal'],
  organization: ['balanced', 'services', 'local', 'minimal'],
}

export const labelize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
