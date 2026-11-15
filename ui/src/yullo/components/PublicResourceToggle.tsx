import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { SourceItem } from './SourceUnderstandingCard';
import { setPublicResource } from '../api/resources';
import { useYulloAppStore } from '../store/useYulloAppStore';

export function PublicResourceToggle({ spaceId, source, onSaved }: { spaceId: string; source: SourceItem; onSaved: () => void }) {
  const ownerId = useYulloAppStore(state => state.user?.id);
  const [error, setError] = useState('');
  const update = useMutation({
    mutationFn: (enabled: boolean) => setPublicResource(spaceId, source.id, enabled, source.source_version || 1, source.resource_revision || 0),
    onSuccess: () => { if (useYulloAppStore.getState().user?.id === ownerId) { setError(''); onSaved(); } },
    onError: failure => {
      if (useYulloAppStore.getState().user?.id !== ownerId) return;
      setError(isAxiosError(failure) && failure.response?.status === 409 ? 'Source changed. Refresh and try again.' : 'Could not update sharing. Try again.');
      onSaved();
    },
  });
  return <div className="mt-2"><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-primary)]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent-solid)] focus-visible:outline-[var(--accent)]" checked={source.public_resource === true} disabled={update.isPending || !ownerId} onChange={event => update.mutate(event.target.checked)} />{update.isPending ? 'Saving sharing…' : 'Show as a public resource'}</label><p className="text-xs text-[var(--text-secondary)]">Anyone can view the entire original when this Space is live.</p>{error && <p role="alert" className="mt-1 text-xs text-[var(--attention)]">{error}</p>}</div>;
}
