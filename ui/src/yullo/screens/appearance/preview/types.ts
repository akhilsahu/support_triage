import { z } from 'zod';
import { presentationConfigSchema, type SpacePresentationConfig } from '../presentation/schema';

export const PreviewSectionTypeSchema = z.enum([
  'services',
  'portfolio',
  'products',
  'location',
  'featured',
  'prompt_starters',
]);
export type PreviewSectionType = z.infer<typeof PreviewSectionTypeSchema>;

export const PreviewContentSourceSchema = z.enum(['example', 'grounded']);
export type PreviewContentSource = z.infer<typeof PreviewContentSourceSchema>;

export const AppearancePreviewItemSchema = z
  .object({
    key: z.string(),
    title: z.string().min(1).max(120),
    description: z.string().max(240).nullable().optional(),
    meta: z.string().max(100).nullable().optional(),
    source: PreviewContentSourceSchema,
    sourceEntityId: z.string().nullable().optional(),
    sourceFactIds: z.array(z.string().uuid()).max(8).optional(),
    sourceChunks: z.array(z.object({
      sourceItemId: z.string().uuid(),
      sourceVersion: z.number().int().positive(),
      chunkId: z.string().min(1).max(768),
    }).strict()).max(8).optional(),
    imageUrl: z.string().nullable().optional(),
    assetId: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => !(data.source === 'grounded' && !data.sourceEntityId && !data.sourceFactIds?.length && !data.sourceChunks?.length), {
    message: 'Grounded items require entity, fact or chunk references',
    path: ['sourceEntityId'],
  });

export type AppearancePreviewItem = z.infer<typeof AppearancePreviewItemSchema>;

export const AppearancePreviewSectionSchema = z
  .object({
    type: PreviewSectionTypeSchema,
    eyebrow: z.string().max(60).nullable().optional(),
    heading: z.string().min(1).max(100),
    items: z.array(AppearancePreviewItemSchema).max(4),
  })
  .strict();

export type AppearancePreviewSection = z.infer<typeof AppearancePreviewSectionSchema>;

export const AppearancePreviewContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    sections: z.array(AppearancePreviewSectionSchema),
  })
  .strict()
  .refine(
    (data) => {
      const types = data.sections.map((s) => s.type);
      return new Set(types).size === types.length;
    },
    {
      message: 'At most one section of each type',
      path: ['sections'],
    }
  );

export type AppearancePreviewContent = z.infer<typeof AppearancePreviewContentSchema>;

export const AppearancePreviewRequestSchema = z
  .object({
    currentConfig: presentationConfigSchema,
    force: z.boolean(),
    sectionType: PreviewSectionTypeSchema.optional(),
    currentContent: AppearancePreviewContentSchema.optional(),
  })
  .strict();

export type AppearancePreviewRequest = z.infer<typeof AppearancePreviewRequestSchema>;

export const PreviewStatusSchema = z.enum(['ready', 'insufficient_context', 'unavailable']);
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

export const AppearancePreviewResponseSchema = z
  .object({
    status: PreviewStatusSchema,
    content: AppearancePreviewContentSchema.nullable(),
    explanation: z.string(),
    groundedEntityIds: z.array(z.string()),
    groundedFactIds: z.array(z.string().uuid()).default([]),
    inputFingerprint: z.string(),
  })
  .strict();

export type AppearancePreviewResponse = z.infer<typeof AppearancePreviewResponseSchema>;
