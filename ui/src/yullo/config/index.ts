import yulloLogo from '../../assets/images/logos/yullo/yullo.png'
// import yulloLogoTransparent from '../../assets/images/logos/yullo/logo_transparent.png'

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
    logoTransparent: yulloLogo, // Fallback for now
  },
  
  // Palette Tokens
  colors: {
    background: '#F9FBFF',
    yellow: '#FFDA2D',
    yellowDepth: 'linear-gradient(135deg, #F6B91A 0%, #FFDA2D 100%)',
    navy: '#101828',
    slate: '#667085',
    cyan: '#4CD8FF',
    blue: '#6695FF',
    violet: '#A98CFF',
    darkBg: '#0B1020',
  },

  // Nomenclature
  nomenclature: {
    title: 'Yullo — Make your place on the internet feel alive.',
    link: 'Yullo Link',
    aura: 'Aura',
    network: 'Yullo Network',
    tagline: 'Claim your Link. Build your Aura. Join the Network.',
    heroEyebrow: 'THE INTERNET IS CHANGING',
    heroTitle: 'Make your place on the internet feel alive.',
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

