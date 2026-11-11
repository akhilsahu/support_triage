import { SourceImagesCard } from './cards/SourceImagesCard'
import { AuraUINode } from '../../services/aura/types'
import { ServiceCard } from './cards/ServiceCard'
import { LocationCard } from './cards/LocationCard'
import { PortfolioCard } from './cards/PortfolioCard'
import { ActionsCard } from './cards/ActionsCard'

export function AuraRenderer({ spaceId, node }: { spaceId: string, node: AuraUINode }) {
  switch (node.type) {
    case 'images':
      return <SourceImagesCard spaceId={spaceId} imageIds={node.imageIds} />
    case 'service':
      return <ServiceCard spaceId={spaceId} entityId={node.entityId} entityData={node.entity} />
    case 'location':
      return <LocationCard spaceId={spaceId} entityId={node.entityId} entityData={node.entity} />
    case 'portfolio':
      return <PortfolioCard spaceId={spaceId} entityId={node.entityId} entityData={node.entity} />
    case 'actions':
      return <ActionsCard spaceId={spaceId} entityIds={node.entityIds || []} entityData={node.entities} />
    default:
      // Unknown/unsupported node types fail closed
      console.warn("Unsupported AuraUINode type", node)
      return null
  }
}
