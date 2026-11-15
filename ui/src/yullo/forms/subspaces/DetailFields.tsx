import { useEffect, useRef } from 'react';
import { currencyForCountry, supportedCurrencies } from '../../config/currencies';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';
import type { SubspaceFields } from '../../api/spaces';

export const subspaceFieldsSchema = z.object({
  price_amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a valid price').nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  details: z.array(z.object({ id: z.string().min(1).max(64), label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(300) })).max(8),
}).refine(value => (value.price_amount === null) === (value.currency === null), 'Enter an amount and currency');

export const emptySubspaceFields = (): SubspaceFields => ({ price_amount: null, currency: null, details: [] });
const currencyNames = new Intl.DisplayNames(undefined, { type: 'currency' });
const templates = ['Duration', 'Age guidance', "What's included", 'Registration deadline', 'Custom detail'];
const input = 'min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function DetailFields({ value, onChange, disabled = false, countryCode }: { value: SubspaceFields; onChange: (value: SubspaceFields) => void; disabled?: boolean; countryCode?: string }) {
  const currencyChosen = useRef(Boolean(value.currency));
  const suggestedCurrency = currencyForCountry(countryCode);
  useEffect(() => {
    if (!disabled && !currencyChosen.current && suggestedCurrency && value.price_amount !== null && value.currency !== suggestedCurrency) {
      onChange({ ...value, currency: suggestedCurrency });
    }
  }, [suggestedCurrency, value, onChange, disabled]);
  const add = (template: string) => {
    if (disabled || value.details.length >= 8 || !templates.includes(template)) return;
    onChange({ ...value, details: [...value.details, { id: crypto.randomUUID(), label: template === 'Custom detail' ? '' : template, value: '' }] });
  };
  return <fieldset disabled={disabled} className="space-y-4 border-t border-[var(--border)] pt-5">
    <legend className="text-sm font-medium">Pricing & additional details</legend>
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" checked={value.price_amount !== null} onChange={event => onChange({ ...value, price_amount: event.target.checked ? '' : null, currency: event.target.checked ? suggestedCurrency || 'INR' : null })} className="h-4 w-4 accent-[var(--accent)]" />
      Include pricing
    </label>
    {value.price_amount !== null && <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
      <label className="space-y-2 text-xs">Amount<input required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" maxLength={13} value={value.price_amount} onChange={event => onChange({ ...value, price_amount: event.target.value })} placeholder="0.00" className={input} /><span className="block text-[var(--text-secondary)]">Enter 0 for free.</span></label>
      <label className="space-y-2 text-xs">Currency<select required value={value.currency || 'INR'} onChange={event => { currencyChosen.current = true; onChange({ ...value, currency: event.target.value }); }} className={input}>{Array.from(new Set([value.currency || 'INR', ...supportedCurrencies])).map(currency => <option key={currency} value={currency}>{currency} — {currencyNames.of(currency)}</option>)}</select></label>
    </div>}
    <div onDragOver={event => { if (event.dataTransfer.types.includes('application/x-yullo-detail')) event.preventDefault(); }} onDrop={event => { const template = event.dataTransfer.getData('application/x-yullo-detail'); if (templates.includes(template)) { event.preventDefault(); add(template); } }} className="space-y-3 rounded-lg border border-dashed border-[var(--border)] p-3">
      <p className="text-xs text-[var(--text-secondary)]">Click or drag a quick field here. Edit or remove it anytime.</p>
      <div className="flex flex-wrap gap-2">{templates.map(template => <button type="button" key={template} draggable={!disabled && value.details.length < 8} disabled={disabled || value.details.length >= 8} onDragStart={event => event.dataTransfer.setData('application/x-yullo-detail', template)} onClick={() => add(template)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"><Plus size={14} aria-hidden="true" />{template}</button>)}</div>
      {value.details.map((detail, index) => <div key={detail.id} className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <input required aria-label={`Detail ${index + 1} label`} placeholder="Label" maxLength={60} value={detail.label} onChange={event => onChange({ ...value, details: value.details.map(row => row.id === detail.id ? { ...row, label: event.target.value } : row) })} className={input} />
          <input required aria-label={`Detail ${index + 1} value`} placeholder="Details" maxLength={300} value={detail.value} onChange={event => onChange({ ...value, details: value.details.map(row => row.id === detail.id ? { ...row, value: event.target.value } : row) })} className={input} />
        </div>
        <button type="button" aria-label={`Remove ${detail.label || 'detail'}`} onClick={() => onChange({ ...value, details: value.details.filter(row => row.id !== detail.id) })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><X size={16} /></button>
      </div>)}
    </div>
    <p className="text-xs text-[var(--text-secondary)]">Up to 8 details. Visible on this item's page when published.</p>
  </fieldset>;
}
