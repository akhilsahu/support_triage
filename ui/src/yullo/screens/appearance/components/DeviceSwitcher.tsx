import { Monitor, Smartphone } from 'lucide-react'

export type PreviewDevice = 'desktop' | 'mobile'

export function DeviceSwitcher({ value, onChange }: { value: PreviewDevice; onChange: (value: PreviewDevice) => void }) {
  return (
    <div className="appearance-device-switcher" aria-label="Preview device">
      <button aria-pressed={value === 'desktop'} onClick={() => onChange('desktop')}><Monitor size={16} /> Desktop</button>
      <button aria-pressed={value === 'mobile'} onClick={() => onChange('mobile')}><Smartphone size={16} /> Mobile</button>
    </div>
  )
}
