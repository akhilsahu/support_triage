import { yulloApiClient } from './client'
import type { SpacePresentationConfig } from '../screens/appearance/presentation/schema'
import {
  AppearancePreviewResponseSchema,
  type AppearancePreviewRequest,
  type AppearancePreviewResponse,
  AppearancePreviewContentSchema,
  type AppearancePreviewContent,
  type AppearancePreviewSection,
} from '../screens/appearance/preview/types'

export interface AppearanceSpaceSummary {
  id: string
  displayName: string
  slug: string
  status: string
  purpose: 'person' | 'creator' | 'business' | 'organization'
  category?: string | null
  description?: string | null
  logoUrl?: string | null
}

export interface AppearanceAsset {
  id: string
  filename: string
  mimeType: string
  byteSize: number
  url: string
  thumbnailUrl: string
  altText?: string | null
  width: number
  height: number
}

export interface AppearanceCandidate {
  config: SpacePresentationConfig
  explanation: string
  changedPaths: string[]
}

export interface AppearanceRebuildLayoutResponse {
  config: SpacePresentationConfig
  previewContent: AppearancePreviewContent
  explanation: string
  groundedEntityIds: string[]
}

export interface AppearanceResponse {
  space: AppearanceSpaceSummary
  publishedConfig: SpacePresentationConfig
  effectiveConfig: SpacePresentationConfig
  recommendation?: AppearanceCandidate | null
  assets: AppearanceAsset[]
  revision: number
}

export const appearanceApi = {
  get: async (spaceId: string): Promise<AppearanceResponse> => {
    const response = await yulloApiClient.get(`/spaces/${spaceId}/appearance`)
    return response.data
  },
  save: async (spaceId: string, config: SpacePresentationConfig, expectedRevision: number): Promise<AppearanceResponse> => {
    const response = await yulloApiClient.patch(`/spaces/${spaceId}/appearance`, { config, expectedRevision })
    return response.data
  },
  recommend: async (spaceId: string): Promise<AppearanceCandidate> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/appearance/recommendation`)
    return response.data
  },
  command: async (spaceId: string, instruction: string, currentConfig: SpacePresentationConfig): Promise<AppearanceCandidate> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/appearance/command`, { instruction, currentConfig })
    return response.data
  },
  uploadAsset: async (spaceId: string, file: File): Promise<AppearanceAsset> => {
    const body = new FormData()
    body.append('file', file)
    const response = await yulloApiClient.post(`/spaces/${spaceId}/appearance/assets`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
  updateAsset: async (spaceId: string, assetId: string, altText: string | null): Promise<AppearanceAsset> => {
    const response = await yulloApiClient.patch(`/spaces/${spaceId}/appearance/assets/${assetId}`, { altText })
    return response.data
  },
  removeAsset: async (spaceId: string, assetId: string): Promise<void> => {
    await yulloApiClient.delete(`/spaces/${spaceId}/appearance/assets/${assetId}`)
  },
  generatePreview: async (
    spaceId: string,
    request: AppearancePreviewRequest,
    signal?: AbortSignal,
  ): Promise<AppearancePreviewResponse> => {
    // Let the API validate the request. A client-side parse failure here would
    // prevent the retry control from issuing any network request at all.
    const response = await yulloApiClient.post(`/spaces/${spaceId}/appearance/preview`, request, { signal })
    return AppearancePreviewResponseSchema.parse(response.data)
  },
  getLivePreview: async (spaceId: string): Promise<AppearancePreviewContent> => {
    const response = await yulloApiClient.get(`/spaces/${spaceId}/appearance/preview/live`)
    return AppearancePreviewContentSchema.parse(response.data)
  },
  applyPreviewSection: async (spaceId: string, section: AppearancePreviewSection): Promise<AppearancePreviewContent> => {
    const response = await yulloApiClient.put(`/spaces/${spaceId}/appearance/preview/section`, { section })
    return AppearancePreviewContentSchema.parse(response.data)
  },
  rebuildLayout: async (spaceId: string, force = false): Promise<AppearanceRebuildLayoutResponse> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/appearance/rebuild-layout`, { force })
    return response.data
  },
}
