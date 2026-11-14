import { IconTooltip } from './IconTooltip';
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';

export function ImageField({ value, onChange, label = 'Logo or photo', disabled = false }: {
  value: string; onChange: (value: string) => void; label?: string; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const select = (file?: File) => {
    if (!file || disabled) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG, JPG, WebP, GIF or SVG image up to 5 MB.'); return;
    }
    const request = ++sequence.current;
    const reader = new FileReader();
    reader.onload = () => { if (request === sequence.current && typeof reader.result === 'string') { onChange(reader.result); setError(''); } };
    reader.onerror = () => setError('Could not read the image. Choose it again.');
    reader.readAsDataURL(file);
  };
  return <div className="space-y-2">
    <p className="text-[13px] font-medium text-[var(--text-primary)]">{label} <span className="font-normal text-[var(--text-secondary)]">(optional)</span></p>
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); select(event.dataTransfer.files[0]); }}>
      {value ? <img src={value} alt="Selected cover" className="h-16 w-20 shrink-0 rounded-lg object-cover" /> : <ImagePlus size={24} className="m-3 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />}
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Upload size={16} aria-hidden="true" />{value ? 'Replace image' : 'Choose image'}</button>
      {value && <IconTooltip label="Remove the selected image" className="ml-auto"><button type="button" disabled={disabled} onClick={() => { sequence.current++; onChange(''); }} aria-label="Remove image" className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><X size={18} aria-hidden="true" /></button></IconTooltip>}
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" disabled={disabled} className="hidden" aria-label={label} onChange={event => { select(event.target.files?.[0]); event.target.value = ''; }} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]"><span>Drop an image here · Up to 5 MB</span><button type="button" disabled={disabled} onClick={() => setShowUrl(!showUrl)} className="min-h-8 underline">{showUrl ? 'Hide image URL' : 'Use an image URL'}</button></div>
    {showUrl && <input type="url" aria-label="Image URL" placeholder="https://example.com/photo.jpg" disabled={disabled} value={value.startsWith('data:') ? '' : value} onChange={event => { sequence.current++; onChange(event.target.value); }} className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />}
    {error && <p role="alert" className="text-xs text-[var(--critical)]">{error}</p>}
  </div>;
}
