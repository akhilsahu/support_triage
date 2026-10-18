import { useYulloEntities } from '../../../hooks/useYulloEntities'

export function ActionsCard({ spaceId, entityIds }: { spaceId: string, entityIds: string[] }) {
  const queryResults = useYulloEntities(spaceId, entityIds)
  
  const isLoading = queryResults.some(q => q.isLoading)
  const entities = queryResults.map(q => q.data).filter(Boolean)

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-3 mt-2 animate-pulse">
        <div className="h-10 w-24 bg-gray-200 rounded-xl" />
        <div className="h-10 w-32 bg-gray-200 rounded-xl" />
      </div>
    )
  }

  if (entities.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-3 mt-2">
      {entities.map((entity, i) => {
        const payload = entity!.payload_json || {}
        if (payload.kind === 'text') {
          return (
            <div key={entity!.id} className="flex items-center gap-3">
              {i > 0 && <span className="text-gray-300">·</span>}
              <a 
                href={payload.url}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors hover:underline underline-offset-4"
                target={payload.url?.startsWith('http') ? '_blank' : undefined}
                rel={payload.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
              >
                {entity!.title}
              </a>
            </div>
          )
        }

        return (
          <a 
            key={entity!.id}
            href={payload.url}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2 ${
              payload.kind === 'primary' 
                ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90' 
                : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
            target={payload.url?.startsWith('http') ? '_blank' : undefined}
            rel={payload.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {entity!.title}
            {payload.kind === 'primary' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            )}
          </a>
        )
      })}
    </div>
  )
}
