import yulloLogo from '../../assets/images/logos/yullo/logo_transparent.png'

/**
 * Yullo Brand System & Configuration
 * 
 * Philosophy: "You’ve built something worth finding. Yullo helps the right people find their way to it."
 * Arc: Yullo Link -> Aura -> Yullo Network
 */

export const yulloConfig = {
  brandName: 'Yullo',
  domain: 'yullo.co',
  siteUrl: 'https://yullo.co',
  
  // Brand Assets
  assets: {
    logo: yulloLogo,
    logoTransparent: yulloLogo,
  },
  
  // Palette Tokens
  colors: {
    background: '#F9FBFF',
    yellow: '#FFFC00',
    yellowDepth: 'linear-gradient(135deg, #FFFC00 0%, #FFFC66 100%)',
    navy: '#101828',
    slate: '#667085',
    cyan: '#4CD8FF',
    blue: '#6695FF',
    violet: '#A98CFF',
    darkBg: '#0B1020',
  },

  // Nomenclature
  nomenclature: {
    title: 'Yullo — Let people connect with what makes you, you.',
    link: 'Yullo Link',
    aura: 'Aura',
    network: 'Yullo Network',
    tagline: 'Claim your Link. Build your Aura. Join the Network.',
    heroEyebrow: 'THE INTERNET IS CHANGING',
    heroTitle: 'Let people connect with what makes you, you.',
    heroSubtitle: 'You’ve built something worth discovering. Give people a place where they can understand what you do, explore what matters, and find their way closer to you.',
  },

  // Typography Tokens
  typography: {
    headingFont: 'Satoshi',
    bodyFont: 'Instrument Sans',
    headingClass: 'font-satoshi',
    bodyClass: 'font-instrument',
  },

  // Home presentation options
  home: {
    sections: [] // Empty implies defaults
  },
}

export function isYulloHostname(): boolean {
  return window.location.hostname === 'yullo.co' || window.location.hostname.endsWith('.yullo.co')
}

export function yulloLandingPath(): string {
  return isYulloHostname() ? '/' : '/yullo'
}

import { API_CONFIG } from '../../config/api'

/**
 * Validates handle availability on-demand against backend API without exposing reserved keywords.
 */
export async function checkHandleAvailability(slug: string): Promise<{ available: boolean; reserved: boolean; reason?: string }> {
  if (!slug || slug.trim().length < 2) {
    return { available: false, reserved: false, reason: 'too_short' }
  }
  try {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloCheckHandle(slug.trim())}`)
    if (!res.ok) return { available: false, reserved: false, reason: 'error' }
    return await res.json()
  } catch {
    return { available: false, reserved: false, reason: 'network_error' }
  }
}

/**
 * Resolves the display domain for Yullo links.
 * In browser environment, defaults to the active host (e.g. localhost:3000 during dev, or yullo.co in prod).
 * Use mode='brand' when you strictly want the canonical brand domain 'yullo.co'.
 */
export function getBaseDomain(mode: 'active' | 'brand' = 'active'): string {
  if (mode === 'active' && typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return yulloConfig.domain || 'yullo.co';
}

