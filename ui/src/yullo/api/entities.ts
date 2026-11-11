import { yulloApiClient } from './client';

export interface SpaceEntity {
  id: string;
  space_id: string;
  entity_type: string;
  origin_type?: string;
  payload_json: Record<string, any>;
  field_policies?: Record<string, any> | null;
  is_active?: boolean;
  is_public: boolean;
  review_status: string;
  revision: number;
  created_at?: string;
  updated_at?: string;
}

export interface EntityEvidence {
  id: string;
  source_item_id: string;
  source_version: number;
  source_title?: string | null;
  source_locator?: string | null;
  locator_metadata?: Record<string, any> | null;
}

export interface SourceEntity extends SpaceEntity {
  evidence: EntityEvidence[];
}

export interface EntityCommand {
  identity_key?: string;
  entity_type: string;
  payload_json: Record<string, any>;
  field_policies?: Record<string, any>;
  is_public?: boolean;
}

export interface EntityPatch {
  payload_json?: Record<string, any>;
  field_policies?: Record<string, any>;
  is_active?: boolean;
  is_public?: boolean;
  review_status?: string;
  expected_revision?: number;
}

export interface BulkEntityPatch {
  entity_ids: string[];
  is_active?: boolean;
  is_public?: boolean;
  review_status?: string;
}

export const entitiesApi = {
  listEntities: async (spaceId: string, includeInactive = true): Promise<SpaceEntity[]> => {
    const res = await yulloApiClient.get(`/spaces/${spaceId}/entities`, {
      params: { include_inactive: includeInactive }
    });
    return res.data;
  },

  listSourceEntities: async (spaceId: string, sourceId: string): Promise<SourceEntity[]> => {
    const res = await yulloApiClient.get(`/spaces/${spaceId}/sources/${sourceId}/entities`);
    return res.data;
  },

  createEntity: async (spaceId: string, command: EntityCommand): Promise<SpaceEntity> => {
    const res = await yulloApiClient.post(`/spaces/${spaceId}/entities`, command);
    return res.data;
  },

  updateEntity: async (spaceId: string, entityId: string, patch: EntityPatch): Promise<SpaceEntity> => {
    const res = await yulloApiClient.patch(`/spaces/${spaceId}/entities/${entityId}`, patch);
    return res.data;
  },

  bulkUpdateEntities: async (spaceId: string, patch: BulkEntityPatch): Promise<SpaceEntity[]> => {
    const res = await yulloApiClient.post(`/spaces/${spaceId}/entities/bulk-update`, patch);
    return res.data;
  },

  confirmEntity: async (spaceId: string, entityId: string, expectedRevision: number, isPublic?: boolean): Promise<SpaceEntity> => {
    const res = await yulloApiClient.post(`/spaces/${spaceId}/entities/${entityId}/confirm`, undefined, {
      params: { expected_revision: expectedRevision, is_public: isPublic }
    });
    return res.data;
  },

  rejectEntity: async (spaceId: string, entityId: string, expectedRevision: number): Promise<SpaceEntity> => {
    const res = await yulloApiClient.post(`/spaces/${spaceId}/entities/${entityId}/reject`, undefined, {
      params: { expected_revision: expectedRevision }
    });
    return res.data;
  },

  archiveEntity: async (spaceId: string, entityId: string): Promise<void> => {
    await yulloApiClient.delete(`/spaces/${spaceId}/entities/${entityId}`);
  }
};
