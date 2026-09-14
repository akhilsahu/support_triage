import { useEffect } from 'react'
import { YulloCanvasNetwork } from '../../components/yullo/YulloCanvasNetwork'
import { YulloHeader } from '../../components/yullo/YulloHeader'
import { YulloHero } from '../../components/yullo/YulloHero'
import { YulloOldVsNew } from '../../components/yullo/YulloOldVsNew'
import { YulloAuraInteractive } from '../../components/yullo/YulloAuraInteractive'
import { YulloDifferentiator } from '../../components/yullo/YulloDifferentiator'
import { YulloNextStep } from '../../components/yullo/YulloNextStep'
import { YulloNetworkGraph } from '../../components/yullo/YulloNetworkGraph'
import { YulloUseCases } from '../../components/yullo/YulloUseCases'
import { YulloClaimHandle } from '../../components/yullo/YulloClaimHandle'
import { YulloFinalCTA } from '../../components/yullo/YulloFinalCTA'
import { YulloFooter } from '../../components/yullo/YulloFooter'
import { yulloConfig } from '../../config/yullo'

export function YulloHome() {
  useEffect(() => {
    document.title = yulloConfig.nomenclature.title

    // Dynamically update Chrome tab Favicon to Yullo logo
    const linkIcon = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
    const originalIconHref = linkIcon ? linkIcon.href : null

    if (linkIcon) {
      linkIcon.href = yulloConfig.assets.logo
    } else {
      const newIcon = document.createElement('link')
      newIcon.rel = 'shortcut icon'
      newIcon.href = yulloConfig.assets.logo
      document.getElementsByTagName('head')[0].appendChild(newIcon)
    }

    return () => {
      if (linkIcon && originalIconHref) {
        linkIcon.href = originalIconHref
      }
    }
  }, [])

  return (
    <div className="scroll-smooth min-h-screen bg-[#F9FBFF] text-[#101828] font-sans antialiased selection:bg-[#FFDA2D] selection:text-[#101828] relative overflow-x-hidden">
      {/* Dynamic Interactive HTML5 Canvas Network Background */}
      <YulloCanvasNetwork />

      {/* Navigation Header */}
      <YulloHeader />

      {/* Main Content Arc */}
      <main className="relative z-10">
        {/* Section 1: Hero */}
        <YulloHero />

        {/* Section 2: Old Internet vs Next Internet Transformation */}
        <YulloOldVsNew />

        {/* Section 3: Meet your Aura (yullo.co/northstarstudio) */}
        <YulloAuraInteractive />

        {/* Section 4: Key Differentiator (You -> Aura -> Network) */}
        <YulloDifferentiator />

        {/* Section 5: Converging Links to Right Next Step */}
        <YulloNextStep />

        {/* Section 6: Network Ecosystem */}
        <YulloNetworkGraph />

        {/* Section 7: Real Scenarios & Use Cases */}
        <YulloUseCases />

        {/* Section 8: Interactive Handle Availability Checker */}
        <YulloClaimHandle />

        {/* Section 9: Cinematic Dark Final CTA */}
        <YulloFinalCTA />
      </main>

      {/* Footer */}
      <YulloFooter />
    </div>
  )
}
