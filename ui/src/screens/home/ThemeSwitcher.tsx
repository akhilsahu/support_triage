import { lazy, Suspense } from 'react'
import { useHomepageVariant } from './useHomepageVariant'

const Homepage5 = lazy(() => import('./home5/Homepage').then(m => ({ default: m.Homepage5 })))
const AuthPage5 = lazy(() => import('./home5/AuthPage').then(m => ({ default: m.AuthPage5 })))
const Pricing5 = lazy(() => import('./home5/Pricing').then(m => ({ default: m.Pricing5 })))
const HowItWorks5 = lazy(() => import('./home5/HowItWorks').then(m => ({ default: m.HowItWorks5 })))

const Homepage1 = lazy(() => import('./home1/Homepage').then(m => ({ default: m.Homepage1 })))
const Homepage2 = lazy(() => import('./home2/Homepage').then(m => ({ default: m.Homepage2 })))
const Homepage3 = lazy(() => import('./home3/Homepage').then(m => ({ default: m.Homepage3 })))
const Homepage4 = lazy(() => import('./home4/Homepage').then(m => ({ default: m.Homepage4 })))

const AuthPage1 = lazy(() => import('./home1/AuthPage').then(m => ({ default: m.AuthPage1 })))
const AuthPage2 = lazy(() => import('./home2/AuthPage').then(m => ({ default: m.AuthPage2 })))
const AuthPage3 = lazy(() => import('./home3/AuthPage').then(m => ({ default: m.AuthPage3 })))

const HowItWorks1 = lazy(() => import('./home1/HowItWorks').then(m => ({ default: m.HowItWorks1 })))
const HowItWorks2 = lazy(() => import('./home2/HowItWorks').then(m => ({ default: m.HowItWorks2 })))
const HowItWorks3 = lazy(() => import('./home3/HowItWorks').then(m => ({ default: m.HowItWorks3 })))

const Pricing1 = lazy(() => import('./home1/Pricing').then(m => ({ default: m.Pricing1 })))
const Pricing2 = lazy(() => import('./home2/Pricing').then(m => ({ default: m.Pricing2 })))
const Pricing3 = lazy(() => import('./home3/Pricing').then(m => ({ default: m.Pricing3 })))

export function DynamicHome() {
  const activeHomepage = useHomepageVariant()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage5' ? <Homepage5 /> :
       activeHomepage === 'homepage4' ? <Homepage4 /> :
       activeHomepage === 'homepage3' ? <Homepage3 /> :
       activeHomepage === 'homepage2' ? <Homepage2 /> :
       <Homepage1 />}
    </Suspense>
  )
}

export function DynamicLogin() {
  const activeHomepage = useHomepageVariant()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage5' ? <AuthPage5 /> : activeHomepage === 'homepage3' ? <AuthPage3 /> : activeHomepage === 'homepage2' ? <AuthPage2 /> : <AuthPage1 />}
    </Suspense>
  )
}

export function DynamicHowItWorks() {
  const activeHomepage = useHomepageVariant()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage5' ? <HowItWorks5 /> : activeHomepage === 'homepage3' ? <HowItWorks3 /> : activeHomepage === 'homepage2' ? <HowItWorks2 /> : <HowItWorks1 />}
    </Suspense>
  )
}

export function DynamicPricing() {
  const activeHomepage = useHomepageVariant()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage5' ? <Pricing5 /> : activeHomepage === 'homepage3' ? <Pricing3 /> : activeHomepage === 'homepage2' ? <Pricing2 /> : <Pricing1 />}
    </Suspense>
  )
}
