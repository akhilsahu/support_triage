import { SpacePurpose } from '../presentation/presets'
import { AppearancePreviewContent, AppearancePreviewSection } from './types'

export interface AppearanceSpaceSummary {
  name: string
}

export function createAppearancePreviewFixtures(
  purpose: SpacePurpose,
  identity: AppearanceSpaceSummary
): AppearancePreviewContent {
  void purpose
  void identity

  const sections: AppearancePreviewSection[] = [
    {
      type: 'services',
      heading: 'Services',
      items: [
        {
          key: 'services:example-1',
          title: 'Example service',
          description: 'Your confirmed service details will appear here.',
          source: 'example'
        },
        {
          key: 'services:example-2',
          title: 'Another service',
          description: 'Use this layout to preview a second offering.',
          source: 'example'
        }
      ]
    },
    {
      type: 'portfolio',
      heading: 'Selected Work',
      items: [
        {
          key: 'portfolio:example-1',
          title: 'Example project',
          description: 'Your confirmed portfolio work will appear here.',
          source: 'example'
        },
        {
          key: 'portfolio:example-2',
          title: 'Another project',
          description: 'Use this layout to preview another work item.',
          source: 'example'
        }
      ]
    },
    {
      type: 'products',
      heading: 'Products',
      items: [
        {
          key: 'products:example-1',
          title: 'Example product',
          description: 'Your confirmed product information will appear here.',
          source: 'example'
        }
      ]
    },
    {
      type: 'location',
      heading: 'Location',
      items: [
        {
          key: 'location:example-1',
          title: 'Example location',
          description: 'Your confirmed location information will appear here.',
          source: 'example'
        }
      ]
    },
    {
      type: 'featured',
      heading: 'Featured',
      items: [
        {
          key: 'featured:example-1',
          title: 'Example highlight',
          description: 'Your confirmed event or action will appear here.',
          source: 'example'
        }
      ]
    }
  ]

  // We could tweak fixtures per-purpose here, but standardizing provides a safe baseline.

  return {
    schemaVersion: 1,
    sections
  }
}
