import { HomeSectionConfig, HomeSectionId } from './types';

export const defaultHomeSections: HomeSectionConfig[] = [
  { id: 'pulse', enabled: true, order: 10 },
  { id: 'rightNow', enabled: true, order: 20 },
  { id: 'attention', enabled: true, order: 30 },
  { id: 'forYou', enabled: true, order: 40 },
  { id: 'spaces', enabled: true, order: 50 },
  { id: 'quickInsight', enabled: true, order: 60 },
  { id: 'orbit', enabled: true, order: 70 },
  { id: 'recent', enabled: true, order: 80 },
  { id: 'suggestion', enabled: true, order: 85 },
  { id: 'pattern', enabled: true, order: 90 },
];

const VALID_SECTION_IDS = new Set<HomeSectionId>([
  'pulse', 'rightNow', 'attention', 'forYou', 'spaces', 'quickInsight', 'orbit', 'recent', 'suggestion', 'pattern'
]);

export function validateHomeSections(configuredSections?: Partial<HomeSectionConfig>[]): HomeSectionConfig[] {
  if (!configuredSections || !Array.isArray(configuredSections)) {
    return [...defaultHomeSections];
  }

  const result = new Map<HomeSectionId, HomeSectionConfig>();

  // Use configured settings, ignoring invalid IDs and duplicates
  configuredSections.forEach((section) => {
    if (section.id && VALID_SECTION_IDS.has(section.id) && !result.has(section.id)) {
      const defaultMatch = defaultHomeSections.find(d => d.id === section.id);
      result.set(section.id, {
        id: section.id,
        enabled: section.enabled ?? true,
        order: section.order ?? defaultMatch?.order ?? 999
      });
    }
  });

  // Fill in any missing valid IDs with their defaults
  defaultHomeSections.forEach(defaultSection => {
    if (!result.has(defaultSection.id)) {
      result.set(defaultSection.id, { ...defaultSection });
    }
  });

  // Sort by order
  return Array.from(result.values()).sort((a, b) => a.order - b.order);
}

export function getVisibleSections(sections: HomeSectionConfig[]): Set<HomeSectionId> {
  return new Set(sections.filter(s => s.enabled).map(s => s.id));
}
