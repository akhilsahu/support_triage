import { YulloCanvasNetwork } from '../components/YulloCanvasNetwork'
import { YulloPublicLayout } from '../components/YulloPublicLayout'
import { YulloHero } from '../components/YulloHero'
import { YulloOldVsNew } from '../components/YulloOldVsNew'
import { YulloAuraInteractive } from '../components/YulloAuraInteractive'
import { YulloDifferentiator } from '../components/YulloDifferentiator'
import { YulloNextStep } from '../components/YulloNextStep'
import { YulloNetworkGraph } from '../components/YulloNetworkGraph'
import { YulloUseCases } from '../components/YulloUseCases'
import { YulloClaimHandle } from '../components/YulloClaimHandle'
import { YulloFinalCTA } from '../components/YulloFinalCTA'

export function YulloLanding() {
  return (
    <YulloPublicLayout>
      {/* Dynamic Interactive HTML5 Canvas Network Background */}
      <YulloCanvasNetwork />

      {/* Main Content Arc */}
      <main id="main-content" tabIndex={-1} className="relative z-10">
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

    </YulloPublicLayout>
  )
}
