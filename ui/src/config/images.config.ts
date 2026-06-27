/**
 * Centralised image / asset paths for support247.chat
 * Import this wherever you need a logo or brand asset.
 */

import gemLogo from '../assets/images/logos/gem.jpg'

export const IMAGES = {
  /** Main neon-agent logo mark — use on dark backgrounds */
  logo: gemLogo,

  /** Alias helpers */
  logoMark: gemLogo,
} as const

export type ImageKey = keyof typeof IMAGES
