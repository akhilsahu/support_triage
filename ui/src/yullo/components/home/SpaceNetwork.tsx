import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { spaceTypeLabel, useSpaceHierarchy } from '../../api/spaces';
import { AddSubspace } from '../../forms/subspaces/Subspaces';
import type { HomeSpace } from '../../home/types';
import { YulloPulse } from '../YulloPulse';

const linkStyle = 'inline-flex min-h-11 items-center px-2 text-sm text-[var(--accent-ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

export function SpaceNetwork({ spaces, selectedId, onSelect, userName }: {
  spaces: HomeSpace[]; selectedId: string | null; onSelect: (id: string | null) => void; userName: string;
}) {
  const query = useSpaceHierarchy();
  const [params, setParams] = useSearchParams();
  const byId = new Map((query.data ?? []).map(node => [node.id, node]));
  const homeById = new Map(spaces.map(space => [space.id, space]));
  const scopeId = params.get('networkSpace');
  const current = scopeId && byId.has(scopeId) ? homeById.get(scopeId) : undefined;
  const childCounts = new Map<string, number>();
  for (const space of spaces) {
    const parent = byId.get(space.id)?.parent_space_id;
    if (parent && homeById.has(parent)) childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
  }
  const visible = spaces.filter(space => {
    const parent = byId.get(space.id)?.parent_space_id;
    return current ? parent === current.id : !parent || !homeById.has(parent);
  }).map(space => ({ ...space, childCount: childCounts.get(space.id) ?? 0, spaceType: byId.get(space.id)?.space_type }));

  const drill = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('networkSpace', id); else next.delete('networkSpace');
    onSelect(id); setParams(next, { preventScrollReset: true });
  };
  return <div>
    {current && <div className="flex items-center justify-between gap-2">
      <button type="button" className={linkStyle} onClick={() => drill(byId.get(current.id)?.parent_space_id || null)}>← Back</button>
      <Link className={`${linkStyle} min-w-0 break-words`} to={`/yullo/spaces/${current.id}`}>Open {current.name}</Link>
      <AddSubspace key={current.id} spaceId={current.id} />
    </div>}
    <YulloPulse spaces={visible} selectedId={selectedId} onSelect={id => id ? drill(id) : onSelect(null)} userName={current?.name || userName} />
    {query.isError && <p role="alert" className="text-sm text-[var(--text-secondary)]">Could not load subspaces. <button type="button" className={linkStyle} onClick={() => void query.refetch()}>Try again</button></p>}
    {query.isPending && <p role="status" className="text-sm text-[var(--text-secondary)]">Loading subspaces…</p>}
    {scopeId && !current && query.isSuccess && <button className={linkStyle} type="button" onClick={() => drill(null)}>Show all Spaces</button>}
    {!!visible.length && <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 text-[var(--text-secondary)]">List view · {visible.length}</summary>
      <ul className="divide-y divide-[var(--border)]">{visible.map(space => <li key={space.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <button type="button" className={`${linkStyle} min-w-0 break-words text-left`} onClick={() => drill(space.id)}>{space.name}</button>
        {space.spaceType && <span className="text-[var(--text-secondary)]">{spaceTypeLabel(space.spaceType)}</span>}
      </li>)}</ul>
    </details>}
  </div>;
}
