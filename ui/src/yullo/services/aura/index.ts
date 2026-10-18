import { AuraProvider } from './AuraProvider'
import { HttpAuraProvider } from './HttpAuraProvider'

export const auraProvider: AuraProvider = new HttpAuraProvider()
