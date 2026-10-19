import { AppearancePreviewContent, AppearancePreviewSection } from './types'

export function mergeAppearancePreview(
  fixture: AppearancePreviewContent,
  grounded: AppearancePreviewContent | null
): AppearancePreviewContent {
  if (!grounded) {
    return fixture
  }

  const groundedSectionsMap = new Map<string, AppearancePreviewSection>()
  for (const section of grounded.sections) {
    if (section.items.length > 0) {
      groundedSectionsMap.set(section.type, section)
    }
  }

  const mergedSections = fixture.sections.map((fixtureSection) => {
    const groundedSection = groundedSectionsMap.get(fixtureSection.type)
    if (groundedSection) {
      return groundedSection
    }
    return fixtureSection
  })

  // Note: We don't append grounded sections that are missing from fixtures, 
  // because fixtures cover all available section types in Yullo. 
  // If there are new section types, they should be added to the fixtures.
  for (const section of grounded.sections) {
    if (section.items.length > 0 && !mergedSections.some(s => s.type === section.type)) {
      mergedSections.push(section)
    }
  }

  return {
    schemaVersion: 1,
    sections: mergedSections
  }
}
