import { useEffect, useState } from 'react'

// A visual fallback only: explicit Studio colors remain the saved source of truth.
export function useArtworkAccent(url?: string | null) {
  const [result, setResult] = useState<{ url: string; color: string } | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 32
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, 32, 32)
        const pixels = context.getImageData(0, 0, 32, 32).data
        const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))
        for (let i = 0; i < pixels.length; i += 4) {
          const [r, g, b, alpha] = pixels.slice(i, i + 4)
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const delta = max - min
          const saturation = max ? delta / max : 0
          // Ignore transparent margins, black stage backdrops and white lettering.
          if (alpha < 192 || max < 45 || saturation < 0.25) continue
          const hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360
          const bucket = buckets[Math.round(hue / 30) % 12]
          const weight = saturation * saturation * max / 255
          bucket.weight += weight
          bucket.r += r * weight
          bucket.g += g * weight
          bucket.b += b * weight
        }
        const dominant = buckets.reduce((best, bucket) => bucket.weight > best.weight ? bucket : best)
        if (!dominant.weight || cancelled) return
        const color = '#' + [dominant.r, dominant.g, dominant.b].map(channel =>
          Math.round(channel / dominant.weight).toString(16).padStart(2, '0'),
        ).join('')
        setResult({ url, color })
      } catch {
        // Cross-origin images without CORS remain visible, with a neutral fallback.
      }
    }
    image.src = url
    return () => { cancelled = true; image.onload = null }
  }, [url])

  return result && result.url === url ? result.color : undefined
}
