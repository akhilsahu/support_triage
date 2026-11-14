import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, LocateFixed, MapPin } from 'lucide-react';
import { useNearby, type NearbyRequest } from '../../api/nearby';
import { useNearbyLocation } from '../../home/useNearbyLocation';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]';

export function Nearby() {
  const [params, setParams] = useSearchParams();
  const expanded = params.get('nearby') === 'open';
  const location = useNearbyLocation();
  const area = location.area;
  const request: NearbyRequest = { ...area, scope: 'all' };
  const results = useNearby(request, expanded && area !== null);
  const updateParams = (key: string, value: string | null) => {
    setParams(current => {
      const next = new URLSearchParams(current);
      next.delete('nearbyScope');
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  return <section aria-labelledby="nearby-title" className="[--accent:var(--accent-ink)] border-t border-[var(--border)] bg-[var(--surface-soft)]">
    <div className="mx-auto w-full max-w-[1080px] px-[clamp(24px,5vw,72px)] py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MapPin aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
          <div><h2 id="nearby-title" className="font-[Satoshi] text-xl font-medium text-[var(--text-primary)]">Discover what’s around you</h2>
            <p className="mt-1 max-w-lg text-sm text-[var(--text-secondary)]">Explore local Spaces and find your next event. Start nearby, look across your city, or discover something online.</p></div>
        </div>
        <button type="button" aria-expanded={expanded} aria-controls="nearby-browser" onClick={() => updateParams('nearby', expanded ? null : 'open')} className={`inline-flex min-h-11 items-center gap-2 px-2 text-sm font-medium text-[var(--accent-ink)] ${focus}`}>
          {expanded ? 'Close nearby' : 'Explore nearby'}<ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && <div id="nearby-browser" className="mt-6 border-t border-[var(--border)] pt-6">
          {!location.automaticAvailable && area !== null && <button type="button" onClick={location.requestLocation} disabled={location.locating} className={`mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent)] disabled:opacity-50 ${focus}`}>
            <LocateFixed aria-hidden="true" className="h-4 w-4" />{location.locating ? 'Finding location…' : 'Use my location'}
          </button>}
          {location.message && <p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">{location.message}</p>}
          <div aria-live="polite" aria-busy={area === null || results.isFetching}>
            {area === null || results.isFetching ? <p role="status" className="py-4">Finding Spaces and events…</p> : results.isError ?
              <p role="alert">Could not load nearby results. <button type="button" onClick={() => void results.refetch()} className={`min-h-11 px-2 text-[var(--accent)] ${focus}`}>Try again</button></p> : results.data && <>
              {!results.data.items.length ? <p className="py-4 text-[var(--text-secondary)]">Nothing here yet. Check back as more Spaces and events are added.</p> : <>
                <p className="text-xs text-[var(--text-secondary)]">{results.data.items.length} results · up to {results.data.limit}, ordered by proximity</p>
                <ol className="mt-2 divide-y divide-[var(--border)]">
                  {results.data.items.map(item => <li key={item.id}>
                    <Link to={`/yullo/${encodeURIComponent(item.slug)}`} className={`group flex min-w-0 items-center justify-between gap-4 py-4 ${focus}`}>
                      <div className="min-w-0"><p className="break-words font-[Satoshi] font-medium text-[var(--text-primary)]">{item.title}</p>
                        <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">{item.kind === 'event' ? `Event · ${item.space_name}` : 'Space'} · {item.distance_km != null ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(item.distance_km)} km · ` : ''}{item.area_label}</p>
                        {item.starts_at && <time dateTime={item.starts_at} className="mt-1 block text-sm text-[var(--text-secondary)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.starts_at))}</time>}
                      </div>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)] opacity-60 group-hover:opacity-100" />
                    </Link>
                  </li>)}
                </ol>
              </>}
            </>}
          </div>
      </div>}
    </div>
  </section>;
}
