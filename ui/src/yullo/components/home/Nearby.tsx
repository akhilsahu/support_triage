import React, { useEffect, useState } from 'react';
import { useYulloAppStore } from '../../store/useYulloAppStore';
import { Beacons } from './Beacons';
import { AreaField } from '../../forms/core/AreaField';
import { YulloButton } from '../core/YulloButton';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, LocateFixed, MapPin } from 'lucide-react';
import { useNearby, type NearbyRequest, type NearbyArea } from '../../api/nearby';
import { useNearbyLocation } from '../../home/useNearbyLocation';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]';

export function Nearby() {
  const ownerId = useYulloAppStore(state => state.user?.id);
  return <NearbyContent key={ownerId || 'guest'} />;
}

function NearbyContent() {
  const [params, setParams] = useSearchParams();
  const expanded = params.get('nearby') === 'open';
  const location = useNearbyLocation();
  const [manualArea, setManualArea] = useState<NearbyArea | null>(null);
  const [draftArea, setDraftArea] = useState<NearbyArea>({});
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaError, setAreaError] = useState('');
  const [resolvingArea, setResolvingArea] = useState(false);
  const [beaconScope, setBeaconScope] = useState<NonNullable<NearbyRequest['beacon_scope']>>('all');
  const area = manualArea ?? location.area ?? {};
  const request: NearbyRequest = { ...area, scope: 'all', beacon_scope: beaconScope };
  const results = useNearby(request, expanded);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const future = (results.data?.beacons || []).map(item => new Date(item.expires_at).getTime()).filter(time => time > now);
    if (!future.length) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(86400000, Math.min(...future) - now + 50));
    return () => window.clearTimeout(timer);
  }, [results.data, now]);
  const activeBeacons = results.isError ? [] : (results.data?.beacons || []).filter(item => new Date(item.expires_at).getTime() > now);
  const beaconPages = new Map(activeBeacons.map(item => [item.space_id, item.title]));
  const organicItems = (results.data?.items || []).filter(item => !beaconPages.has(item.space_id)
    || (item.kind === 'event' && item.title !== beaconPages.get(item.space_id)));
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
          {!location.automaticAvailable && <button type="button" onClick={() => { setManualArea(null); location.requestLocation(); }} disabled={location.locating} className={`mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent)] disabled:opacity-50 ${focus}`}>
            <LocateFixed aria-hidden="true" className="h-4 w-4" />{location.locating ? 'Finding location…' : 'Use my location'}
          </button>}
          {location.message && <p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">{location.message}</p>}
          <div className="mb-5 flex flex-wrap items-center gap-3"><YulloButton variant="outline" size="sm" aria-expanded={areaOpen} onClick={() => { setDraftArea(manualArea || location.area || {}); setAreaOpen(!areaOpen); }}>Choose an area</YulloButton>{manualArea && <YulloButton variant="ghost" size="sm" onClick={() => setManualArea(null)}>Use my saved area</YulloButton>}<span className="text-xs text-[var(--text-secondary)]">{[area.city, area.country_code].filter(Boolean).join(', ') || (area.latitude != null ? 'Using your current location' : 'Worldwide Beacons are available without your location.')}</span></div>
          {areaOpen && <form className="mb-6 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onSubmit={event => {
            event.preventDefault();
            if (!draftArea.country_code || !/^[A-Z]{2}$/.test(draftArea.country_code)) { setAreaError('Choose a city with its country, or enter a two-letter country code.'); return; }
            setAreaError(''); setManualArea(draftArea); setAreaOpen(false);
          }}><AreaField value={draftArea} onChange={setDraftArea} onResolvingChange={setResolvingArea} />{areaError && <p role="alert" className="text-sm text-[var(--attention)]">{areaError}</p>}<YulloButton type="submit" size="sm" disabled={resolvingArea}>Use this area</YulloButton></form>}
          {(beaconScope === 'city' || beaconScope === 'country') && !area.country_code && <p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">Choose a city or country above to find these Beacons.</p>}
          <Beacons items={activeBeacons} scope={beaconScope} onScopeChange={setBeaconScope} loading={results.isFetching} failed={results.isError || results.data?.beacons_available === false} />
          <h3 className="mb-2 text-lg font-semibold">Around you</h3>
          <div aria-live="polite" aria-busy={results.isFetching}>
            {results.isFetching ? <p role="status" className="py-4">Finding Spaces and events…</p> : results.isError ?
              <p role="alert">Could not load nearby results. <button type="button" onClick={() => void results.refetch()} className={`min-h-11 px-2 text-[var(--accent)] ${focus}`}>Try again</button></p> : results.data && <>
              {!organicItems.length ? <p className="py-4 text-[var(--text-secondary)]">{activeBeacons.length ? 'Matching pages are shown in Beacons above.' : 'Nothing here yet. Check back as more Spaces and events are added.'}</p> : <>
                <p className="text-xs text-[var(--text-secondary)]">{organicItems.length} results · up to {results.data.limit}, ordered by proximity</p>
                <ol className="mt-2 divide-y divide-[var(--border)]">
                  {organicItems.map(item => <li key={item.id}>
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
