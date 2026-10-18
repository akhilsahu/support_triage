import { AuraUINode } from '../../services/aura/types'
import { ServiceCard } from './cards/ServiceCard'
import { LocationCard } from './cards/LocationCard'
import { PortfolioCard } from './cards/PortfolioCard'
import { ActionsCard } from './cards/ActionsCard'

export function AuraRenderer({ spaceId, node }: { spaceId: string, node: AuraUINode }) {
  switch (node.type) {
    case 'service':
      return <ServiceCard spaceId={spaceId} entityId={node.entityId} />
    case 'location':
      return <LocationCard spaceId={spaceId} entityId={node.entityId} />
    case 'portfolio':
      return <PortfolioCard spaceId={spaceId} entityId={node.entityId} />
    case 'actions':
      return <ActionsCard spaceId={spaceId} entityIds={node.entityIds} />
    default:
      // Unknown/unsupported node types fail closed
      console.warn("Unsupported AuraUINode type", node)
      return null
  }
}
