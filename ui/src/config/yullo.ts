import yulloLogo from '../assets/images/logos/yullo/yullo__cyan_network.png'

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
    link: 'Yullo Link',
    aura: 'Aura',
    network: 'Yullo Network',
    tagline: 'Claim your Link. Build your Aura. Join the Network.',
    heroEyebrow: 'THE INTERNET IS CHANGING',
    heroTitle: 'Make your place on the internet feel alive.',
    heroSubtitle: 'You’ve built something worth discovering. Give people a place where they can understand what you do, explore what matters, and find their way closer to you.',
  },
}
