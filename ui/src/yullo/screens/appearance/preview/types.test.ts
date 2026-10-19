import { describe, it, expect } from 'vitest';
import {
  AppearancePreviewContentSchema,
  AppearancePreviewItemSchema,
  AppearancePreviewSectionSchema,
} from './types';

describe('Appearance Preview Schemas', () => {
  it('accepts fact-backed items and rejects invalid fact references', () => {
    const item = { key: 'service', title: 'Cargo transport', source: 'grounded', sourceFactIds: ['bc62ea40-a84e-4dce-81ba-7e13dd0c4f11'] };
    expect(AppearancePreviewItemSchema.safeParse(item).success).toBe(true);
    expect(AppearancePreviewItemSchema.safeParse({ ...item, sourceFactIds: ['invalid'] }).success).toBe(false);
  });
  it('validates a correct preview content', () => {
    const result = AppearancePreviewContentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        {
          type: 'services',
          heading: 'Our Services',
          items: [
            {
              key: 'services:123',
              title: 'Web Dev',
              source: 'grounded',
              sourceEntityId: '123',
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = AppearancePreviewItemSchema.safeParse({
      key: '1',
      title: 'Title',
      source: 'example',
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate section types', () => {
    const result = AppearancePreviewContentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        { type: 'services', heading: '1', items: [] },
        { type: 'services', heading: '2', items: [] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized items (max 4)', () => {
    const result = AppearancePreviewSectionSchema.safeParse({
      type: 'services',
      heading: 'Services',
      items: [
        { key: '1', title: '1', source: 'example' },
        { key: '2', title: '2', source: 'example' },
        { key: '3', title: '3', source: 'example' },
        { key: '4', title: '4', source: 'example' },
        { key: '5', title: '5', source: 'example' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects grounded items without sourceEntityId', () => {
    const result = AppearancePreviewItemSchema.safeParse({
      key: '1',
      title: 'Title',
      source: 'grounded',
    });
    expect(result.success).toBe(false);
  });

  it('validates string limits', () => {
    const result = AppearancePreviewItemSchema.safeParse({
      key: '1',
      title: 'A'.repeat(121), // max 120
      source: 'example',
    });
    expect(result.success).toBe(false);
  });
});
