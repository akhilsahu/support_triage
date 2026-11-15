import { CalendarDays, ChevronRight, MapPin, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BeaconCard } from '../../api/beacon';
import type { NearbyRequest } from '../../api/nearby';
import { YulloButton } from '../core/YulloButton';

export function Beacons({ items, scope, onScopeChange, loading, failed }: {
  items: BeaconCard[]; scope: NonNullable<NearbyRequest['beacon_scope']>;
  onScopeChange: (scope: NonNullable<NearbyRequest['beacon_scope']>) => void;
  loading: boolean; failed: boolean;
}) {
  return <section aria-labelledby="beacons-title" className="mb-8">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 id="beacons-title" className="flex items-center gap-2 text-lg font-semibold"><Radio size={20} className="text-[var(--accent-ink)]" aria-hidden="true" />Beacons</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Events, posts and services shared with your area—and beyond.</p></div></div>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Beacon reach">{([
      ['all', 'All'], ['nearby', 'Nearby'], ['city', 'City'], ['country', 'Country'], ['worldwide', 'Worldwide'],
    ] as const).map(([value, label]) => <YulloButton key={value} variant={scope === value ? 'primary' : 'outline'} size="sm" aria-pressed={scope === value} onClick={() => onScopeChange(value)}>{label}</YulloButton>)}</div>
    <div aria-live="polite" aria-busy={loading}>
      {failed && <p role="status" className="py-4 text-sm text-[var(--text-secondary)]">Beacons are unavailable right now. You can still browse nearby results below.</p>}
      {loading && !items.length ? <p role="status" className="py-4 text-sm text-[var(--text-secondary)]">Finding Beacons…</p> : !failed && !items.length ? <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text-secondary)]">No active Beacons in this area yet. Try Worldwide or choose another area.</div> : null}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
        {items.map(item => {
          const start = item.starts_at ? new Date(item.starts_at) : null;
          return <Link key={item.space_id} to={item.url} className="group min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--accent-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] motion-reduce:transition-none">
            <div className="relative flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,var(--accent-soft),var(--surface-soft))]">{item.cover_url ? <img src={item.cover_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Radio size={36} strokeWidth={1.5} className="text-[var(--accent-ink)]" aria-hidden="true" />}<span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]"><Radio size={12} aria-hidden="true" />{item.area_label}</span></div>
            <div className="space-y-3 p-4"><p className="text-xs font-semibold text-[var(--accent-ink)]">{item.type_label || (item.space_type === 'posting' ? 'Post' : item.space_type)}</p><h4 className="break-words text-base font-semibold leading-snug">{item.title}</h4>
              {start && !Number.isNaN(start.getTime()) && <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"><CalendarDays size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><time dateTime={item.starts_at!}>{start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>}
              {item.location_label && <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"><MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="line-clamp-2">{item.location_label}</span></p>}
              <span className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-[var(--accent-ink)]">View page<ChevronRight size={15} aria-hidden="true" /></span>
            </div>
          </Link>;
        })}
      </div>
    </div>
  </section>;
}
