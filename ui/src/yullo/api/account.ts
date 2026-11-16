import { yulloApiClient } from './client';
import type { YulloUser } from '../store/useYulloAppStore';

export type AccountProfile = YulloUser & { updated_at: string };

export const accountApi = {
  async getProfile(): Promise<AccountProfile> {
    const { data } = await yulloApiClient.get<{ user: AccountProfile }>('/auth/profile');
    return data.user;
  },
  async updateProfile(fullName: string, expectedUpdatedAt: string): Promise<AccountProfile> {
    const { data } = await yulloApiClient.patch<{ user: AccountProfile }>('/auth/profile', {
      full_name: fullName,
      expected_updated_at: expectedUpdatedAt,
    });
    return data.user;
  },
  async resetOnboarding(): Promise<void> {
    await yulloApiClient.post('/auth/onboarding/reset');
  },
};
