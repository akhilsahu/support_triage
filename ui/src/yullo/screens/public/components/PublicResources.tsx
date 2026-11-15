import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, FileText, Image, Link2, X } from 'lucide-react';
import { listResources, resourceHref, type PublicResource } from '../../../api/resources';

export function PublicResources({ spaceId, open, portalContainer }: { spaceId: string; open: boolean; portalContainer?: HTMLElement | null }) {
  const [note, setNote] = useState<PublicResource | null>(null);
  const resources = useQuery({ queryKey: ['yullo-public-resources', spaceId], enabled: open,
    queryFn: ({ signal }) => listResources(spaceId, signal), staleTime: 0, gcTime: 0, retry: false,
    refetchInterval: open ? 30000 : false });
  const content = useQuery({ queryKey: ['yullo-public-resource-note', spaceId, note?.href], enabled: !!note && open,
    queryFn: async ({ signal }) => {
      const response = await fetch(resourceHref(note!), { signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Resource unavailable');
      return response.text();
    }, gcTime: 0, staleTime: 0, retry: false });
  useEffect(() => {
    if (!open || (note && resources.data && !resources.data.some(item => item.href === note.href))) setNote(null);
  }, [open, resources.data, note]);
  if (resources.isError) return <p className="px-6 pb-4 text-xs text-[var(--presentation-muted)]">Resources could not load. <button type="button" className="underline" onClick={() => void resources.refetch()}>Retry</button></p>;
  if (!resources.data?.length) return null;
  return <section aria-label="Resources" className="max-h-[35vh] shrink-0 overflow-y-auto border-b border-[var(--presentation-border)] px-3 pb-4">
    <h3 className="px-3 pb-2 text-xs font-semibold text-[var(--presentation-muted)]">Resources</h3>
    <ul className="space-y-1">{resources.data.map(resource => {
      const Icon = resource.kind === 'image' ? Image : resource.kind === 'link' ? Link2 : FileText;
      const contents = <><Icon size={16} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" /><span className="min-w-0 flex-1 break-words text-start">{resource.title}</span>{resource.kind !== 'note' && <ExternalLink size={12} className="shrink-0" aria-hidden="true" />}</>;
      const style = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--presentation-text)] hover:bg-[var(--presentation-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)]';
      return <li key={resource.id}>{resource.kind === 'note' ? <button type="button" className={style} onClick={() => setNote(resource)}>{contents}</button> : <a href={resourceHref(resource)} target="_blank" rel="noopener noreferrer" className={style}>{contents}<span className="sr-only"> (opens in a new tab)</span></a>}</li>;
    })}</ul>
    <Dialog.Root open={!!note && open} onOpenChange={value => { if (!value) setNote(null); }}><Dialog.Portal container={portalContainer || undefined}>
      <Dialog.Overlay className="fixed inset-0 z-[170] bg-black/50" />
      <Dialog.Content onEscapeKeyDown={event => { event.preventDefault(); setNote(null); }} className="fixed left-1/2 top-1/2 z-[171] flex max-h-[85dvh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[var(--presentation-border)] bg-[var(--presentation-surface)] p-6 text-[var(--presentation-text)] shadow-xl">
        <header className="flex items-start justify-between gap-4"><Dialog.Title className="break-words text-lg font-semibold">{note?.title}</Dialog.Title><Dialog.Close aria-label="Close resource" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--presentation-border)]"><X size={18} /></Dialog.Close></header>
        <Dialog.Description className="mt-1 text-xs text-[var(--presentation-muted)]">Shared resource</Dialog.Description>
        <div className="mt-5 min-h-0 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7">{content.isFetching ? <p role="status">Loading note…</p> : content.isError ? <p role="alert">This resource is no longer available.</p> : content.data}</div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>;
}
