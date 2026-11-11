import { useQuery } from '@tanstack/react-query'
import { API_CONFIG } from '../../../../config/api'
import { CardUnavailable } from '../shared/CardUnavailable'
import { SourceImage } from '../shared/SourceImage'
import { safeUrl } from '../shared/safeUrl'

export function ChatSourceImage({ spaceId, imageId }: { spaceId: string; imageId: string }) {
  const query = useQuery({
    queryKey: ['yulloChatImage', spaceId, imageId],
    queryFn: async () => {
      const response = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/public/spaces/${spaceId}/aura/images/${imageId}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Image unavailable')
      const data = await response.json()
      if (data.id !== imageId || typeof data.url !== 'string' || typeof data.caption !== 'string' || typeof data.sourceTitle !== 'string') throw new Error('Image unavailable')
      return data as { id: string; url: string; caption: string; sourceTitle: string; title?: string; sourceUrl?: string; destinationUrl?: string; linkKind?: 'item' | 'source' }
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  // Revalidate references on mount rather than showing URLs from saved chat history.
  if (query.isFetching) return <div role="status" className="min-h-32 rounded-lg bg-[var(--presentation-surface)] p-4 text-sm text-[var(--presentation-muted)]">Loading image…</div>
  if (query.isError || !query.data) return <CardUnavailable onRetry={() => { void query.refetch() }} />
  const href = safeUrl(query.data.destinationUrl) || safeUrl(query.data.sourceUrl)
  const host = href ? new URL(href, window.location.origin).hostname.replace(/^www\./, '') : ''
  const label = query.data.linkKind === 'item' ? 'View details' : host ? `Visit ${host}` : 'View source'
  return <figure className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] bg-[var(--presentation-surface)]">
    <div className="aspect-[4/3] w-full overflow-hidden p-2 [&>img]:h-full [&>img]:max-h-full">
      <SourceImage src={query.data.url} alt={query.data.title || query.data.caption} />
    </div>
    <figcaption className="flex flex-1 flex-col p-3 text-sm text-[var(--presentation-muted)]">
      {query.data.title && <h4 className="mb-1 line-clamp-2 font-semibold text-[var(--presentation-text)]">{query.data.title}</h4>}
      {query.data.caption !== query.data.title && <p className="line-clamp-2 leading-relaxed" title={query.data.caption}>{query.data.caption}</p>}
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${query.data.title || query.data.sourceTitle}`} className="mt-auto inline-flex items-center gap-1 pt-3 font-medium underline underline-offset-4 text-[var(--presentation-accent-ink)]">{label} <span aria-hidden="true">↗</span></a>
        : <p className="mt-auto line-clamp-1 pt-3">Source: {query.data.sourceTitle}</p>}
    </figcaption>
  </figure>
}

export function SourceImagesCard({ spaceId, imageIds }: { spaceId: string; imageIds: string[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {imageIds.map(id => <ChatSourceImage key={id} spaceId={spaceId} imageId={id} />)}
  </div>
}
