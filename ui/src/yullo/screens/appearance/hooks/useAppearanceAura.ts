import { useMutation } from '@tanstack/react-query'
import { appearanceApi } from '../../../api/appearance'
import type { SpacePresentationConfig } from '../presentation/schema'

export function useAppearanceAura(spaceId: string, currentConfig: SpacePresentationConfig) {
  const command = useMutation({
    mutationFn: (instruction: string) => appearanceApi.command(spaceId, instruction, currentConfig),
  })
  const recommendation = useMutation({
    mutationFn: () => appearanceApi.recommend(spaceId),
  })
  return { command, recommendation }
}
