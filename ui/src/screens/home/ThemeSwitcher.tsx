import { lazy, Suspense } from 'react'
import { useAppStore } from '../../store/useAppStore'

const Homepage1 = lazy(() => import('./home1/Homepage').then(m => ({ default: m.Homepage1 })))
const Homepage2 = lazy(() => import('./home2/Homepage').then(m => ({ default: m.Homepage2 })))
const Homepage3 = lazy(() => import('./home3/Homepage').then(m => ({ default: m.Homepage3 })))

const Login1 = lazy(() => import('./home1/Login').then(m => ({ default: m.Login1 })))
const Login2 = lazy(() => import('./home2/Login').then(m => ({ default: m.Login2 })))
const Login3 = lazy(() => import('./home3/Login').then(m => ({ default: m.Login3 })))

const HowItWorks1 = lazy(() => import('./home1/HowItWorks').then(m => ({ default: m.HowItWorks1 })))
const HowItWorks2 = lazy(() => import('./home2/HowItWorks').then(m => ({ default: m.HowItWorks2 })))
const HowItWorks3 = lazy(() => import('./home3/HowItWorks').then(m => ({ default: m.HowItWorks3 })))

const Pricing1 = lazy(() => import('./home1/Pricing').then(m => ({ default: m.Pricing1 })))
const Pricing2 = lazy(() => import('./home2/Pricing').then(m => ({ default: m.Pricing2 })))
const Pricing3 = lazy(() => import('./home3/Pricing').then(m => ({ default: m.Pricing3 })))

export function DynamicHome() {
  const { activeHomepage } = useAppStore()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage3' ? <Homepage3 /> : activeHomepage === 'homepage2' ? <Homepage2 /> : <Homepage1 />}
    </Suspense>
  )
}

export function DynamicLogin() {
  const { activeHomepage } = useAppStore()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage3' ? <Login3 /> : activeHomepage === 'homepage2' ? <Login2 /> : <Login1 />}
    </Suspense>
  )
}

export function DynamicHowItWorks() {
  const { activeHomepage } = useAppStore()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage3' ? <HowItWorks3 /> : activeHomepage === 'homepage2' ? <HowItWorks2 /> : <HowItWorks1 />}
    </Suspense>
  )
}

export function DynamicPricing() {
  const { activeHomepage } = useAppStore()
  return (
    <Suspense fallback={null}>
      {activeHomepage === 'homepage3' ? <Pricing3 /> : activeHomepage === 'homepage2' ? <Pricing2 /> : <Pricing1 />}
    </Suspense>
  )
}

