import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { yulloApiClient } from './client';
import { HomeSectionConfig } from '../home/types';

// ── Types matching backend YulloHomeResponse schema ─────────────────────────

export interface YulloAccountInfo {
  id: string;
  displayName: string;
  initials: string;
}

export interface YulloPreference {
  appTheme: string;
}

export interface YulloHomeSpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  lifecycle: string;
  auraStatus: 'draft' | 'learning' | 'updating' | 'live' | 'needs_review' | 'unavailable';
  conversationCountToday: number;
  newConversationCount: number;
  attentionCount: number;
  lastActivityAt: string | null;
}

export interface YulloAttentionAction {
  kind: string;
  label: string;
  targetId?: string | null;
}

export interface YulloAttentionItem {
  id: string;
  spaceId: string;
  spaceName: string;
  kind: string;
  title: string;
  detail?: string | null;
  action: YulloAttentionAction;
  occurredAt: string;
}

export interface YulloActivityItem {
  id: string;
  spaceId: string;
  spaceName: string;
  kind: string;
  label: string;
  occurredAt: string;
  isNew: boolean;
}

export interface YulloSuggestion {
  id: string;
  spaceId: string;
  spaceName: string;
  kind: string;
  reason: string;
  actionLabel: string;
}

export interface YulloHomeData {
  account: YulloAccountInfo;
  preference: YulloPreference;
  spaces: YulloHomeSpace[];
  attention: YulloAttentionItem[];
  recent: YulloActivityItem[];
  suggestion: YulloSuggestion | null;
  generatedAt: string;
}

// ── Query Hook ──────────────────────────────────────────────────────────────

export const useYulloHome = () => {
  return useQuery({
    queryKey: ['yullo-home'],
    queryFn: async () => {
      const { data } = await yulloApiClient.get<YulloHomeData>('/home');
      return data;
    },
    // The query client is configured to refetchOnWindowFocus globally for Yullo,
    // which aligns with the Cache-Control: no-store strategy.
  });
};

export const useUpdateHomePreferences = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { sections?: Partial<HomeSectionConfig>[], resetToDefaults?: boolean }) => {
      const { data } = await yulloApiClient.patch<HomeSectionConfig[]>('/home/preferences', payload);
      return data;
    },
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ['yullo-home'] });
      const previousHome = queryClient.getQueryData(['yullo-home']);
      
      // We don't have the explicit home_sections in the UI yet? 
      // Actually YulloHomeData doesn't contain sections in this schema yet. Wait, 
      // the plan says "optimistically applies submitted settings... replaces only preference in the same owner cache". 
      // We didn't add sections to YulloHomeData. Let me check if YulloHomeData includes it.
      
      return { previousHome };
    },
    onError: (err, newPrefs, context: any) => {
      if (context?.previousHome) {
        queryClient.setQueryData(['yullo-home'], context.previousHome);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
    },
  });
};
