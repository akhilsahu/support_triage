import { AuraProvider } from './AuraProvider'
import { HttpAuraProvider } from './HttpAuraProvider'
import { MockAuraProvider } from './MockAuraProvider'

const demoRequested = import.meta.env.VITE_YULLO_AURA_PROVIDER === 'mock'
  || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('aura') === 'demo')

export const auraAccountsEnabled = !demoRequested

export const auraProvider: AuraProvider = demoRequested
  ? new MockAuraProvider()
  : new HttpAuraProvider()
