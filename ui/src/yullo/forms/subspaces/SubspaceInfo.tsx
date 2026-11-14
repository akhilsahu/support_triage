import { formatSubspacePrice, type SubspaceFields } from '../../api/spaces';

export function SubspaceInfo({ fields }: { fields?: SubspaceFields | null }) {
  const price = formatSubspacePrice(fields);
  if (!price && !fields?.details.length) return null;
  return <div className="w-full space-y-4">
    {price && <p className="text-xl font-semibold">{price}</p>}
    {!!fields?.details.length && <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {fields.details.map(detail => <div key={detail.id} className="min-w-0"><dt className="font-medium text-[var(--presentation-muted,var(--text-secondary))]">{detail.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{detail.value}</dd></div>)}
    </dl>}
  </div>;
}
