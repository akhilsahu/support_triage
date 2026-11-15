import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Grid3X3, Search, X } from 'lucide-react'
import { browsePublicSpaces, type PublicSpaceIcon } from '../api/directory'
import { YulloPublicLayout } from '../components/YulloPublicLayout'

function SpaceIcon({ space }: { space: PublicSpaceIcon }) {
  const [failed, setFailed] = useState(false)
  return (
    <Link to={space.url} aria-label={`Open ${space.name} chatbot`} className="group flex min-w-0 flex-col items-center gap-3 rounded-2xl px-2 py-5 text-center transition-colors hover:bg-white focus-visible:bg-white">
      <span className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-white text-2xl font-bold text-slate-700 shadow-sm transition-transform group-hover:-translate-y-1 sm:h-20 sm:w-20">
        {space.icon_url && !failed
          ? <img src={space.icon_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
          : space.name.trim().slice(0, 2).toLocaleUpperCase() || <Grid3X3 className="h-7 w-7" />}
      </span>
      <span className="line-clamp-2 max-w-full break-words text-sm font-semibold leading-snug text-slate-800">{space.name}</span>
      <span className="max-w-full truncate text-xs text-slate-500">@{space.handle}</span>
    </Link>
  )
}

export function YulloExplore() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') || ''
  const [query, setQuery] = useState(search)
  const [debounced, setDebounced] = useState(search.trim())

  useEffect(() => { setQuery(search) }, [search])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query.trim())
      if (query !== search) setParams(query ? { q: query } : {}, { replace: true })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, search, setParams])

  const results = useInfiniteQuery({
    queryKey: ['yullo-public-directory', debounced],
    queryFn: ({ pageParam, signal }) => browsePublicSpaces(debounced, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.next_cursor || undefined,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  })
  const spaces = results.data?.pages.flatMap(page => page.items) || []
  const waiting = results.isPending || query.trim() !== debounced

  return (
    <YulloPublicLayout>
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[70dvh] w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">The Yullo network</p>
          <h1 className="mt-4 font-satoshi text-4xl font-bold tracking-tight sm:text-5xl">A world of people, one conversation away.</h1>
          <p className="mt-5 text-base leading-relaxed text-slate-600">Find a Space. Tap its icon. Start a conversation.</p>
          <form role="search" className="relative mt-8" onSubmit={event => { event.preventDefault(); document.querySelector<HTMLAnchorElement>('[data-space-results] a')?.focus() }}>
            <label htmlFor="space-search" className="sr-only">Search apps by name or handle</label>
            <Search className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-400" aria-hidden="true" />
            <input id="space-search" type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Search apps by name or @handle" autoComplete="off" className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-14 text-base text-slate-900 shadow-sm" />
            {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); document.getElementById('space-search')?.focus() }} className="absolute right-1 top-1 flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
          </form>
        </div>
        <div className="mt-10" aria-live="polite" aria-atomic="true">
          {waiting ? <p role="status" className="text-center text-sm text-slate-500">Finding apps…</p>
            : results.isError ? <div role="alert" className="text-center text-slate-600"><p>Apps couldn’t load. Please try again.</p><button type="button" onClick={() => void results.refetch()} className="mt-4 min-h-11 rounded-xl bg-[var(--accent)] px-5 font-semibold text-[var(--accent-on-solid)]">Try again</button></div>
              : <p className="text-center text-sm text-slate-500">{spaces.length ? `${spaces.length} ${spaces.length === 1 ? 'app' : 'apps'}${results.hasNextPage ? ' loaded' : ''}` : results.hasNextPage ? 'No apps in this group. Show more to keep exploring.' : debounced ? 'No apps match your search. Try another name or handle.' : 'No public apps yet. Your Space could be the first.'}</p>}
        </div>
        {!waiting && !results.isError && <div data-space-results className="mt-6 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-6 md:grid-cols-5 lg:grid-cols-6">{spaces.map(space => <SpaceIcon key={space.id} space={space} />)}</div>}
        {!waiting && !results.isError && results.hasNextPage && <div className="mt-8 text-center"><button type="button" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()} className="min-h-11 rounded-xl border border-slate-300 bg-white px-6 font-semibold disabled:opacity-50">{results.isFetchingNextPage ? 'Loading…' : 'Show more apps'}</button></div>}
      </main>
    </YulloPublicLayout>
  )
}
