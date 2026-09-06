import { useEffect, useState } from 'react'

export interface PricingPackage {
  name: string
  subhead: string
  features: string[]
  price?: string | number
}

const DEFAULT_PACKAGES: PricingPackage[] = [
  {
    name: 'FREE',
    price: '$0',
    subhead: 'Get started with basic support features.',
    features: [
      'Your own support workspace',
      'Answers grounded in your guides',
      'Website chat and a branded page',
    ],
  },
  {
    name: 'STARTER',
    price: '$29',
    subhead: 'A place to start helping your customers.',
    features: [
      'Your own support workspace',
      'Answers grounded in your guides',
      'Website chat and a branded page',
    ],
  },
  {
    name: 'GROWTH',
    price: '$99',
    subhead: 'For people sharing the work of support.',
    features: [
      'A shared space for conversations',
      'Connect to your store & tools',
      'Human handoff when it matters',
    ],
  },
  {
    name: 'SCALE',
    price: '$249',
    subhead: 'For growing teams and high-volume support.',
    features: [
      'Unlimited automated responses',
      'Dedicated account manager',
      'Custom integrations & SLAs',
    ],
  },
]

export function usePricingTiers() {
  const [packages, setPackages] = useState<PricingPackage[]>(DEFAULT_PACKAGES)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const endpoint =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/api/v1/super-admin/pricing-tiers/public`
        : '/api/v1/super-admin/pricing-tiers/public'

    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.packages) && data.packages.length > 0) {
          const parsed: PricingPackage[] = data.packages.map((pkg: any) => ({
            name: pkg.name || 'STARTER',
            price: pkg.price !== undefined ? pkg.price : '$29',
            subhead: typeof pkg.subhead === 'string' ? pkg.subhead : '',
            features: Array.isArray(pkg.features) ? pkg.features : [],
          }))
          setPackages(parsed)
        }
      })

      .catch((err) => {
        console.warn('Failed to load super-admin pricing config:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  return { packages, loading }
}
