import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entitiesApi, SpaceEntity, EntityCommand, EntityPatch } from './entities';

export const useSpaceEntities = (spaceId: string) => {
  return useQuery({
    queryKey: ['yullo-entities', spaceId],
    queryFn: () => entitiesApi.listEntities(spaceId),
    enabled: !!spaceId,
  });
};

export const useCreateEntity = (spaceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: EntityCommand) => entitiesApi.createEntity(spaceId, command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
    },
  });
};

export const useUpdateEntity = (spaceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: EntityPatch }) => 
      entitiesApi.updateEntity(spaceId, entityId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
    },
  });
};

export const useConfirmEntity = (spaceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityId, expectedRevision, isPublic }: { entityId: string; expectedRevision: number; isPublic?: boolean }) => 
      entitiesApi.confirmEntity(spaceId, entityId, expectedRevision, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
    },
  });
};

export const useArchiveEntity = (spaceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) => entitiesApi.archiveEntity(spaceId, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
    },
  });
};
