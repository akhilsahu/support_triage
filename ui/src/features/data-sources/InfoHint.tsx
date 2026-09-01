import { Info } from 'lucide-react'

export function InfoHint({ label, children }: { label: string; children: string }) {
  return <details className="group relative inline-flex align-middle">
    <summary aria-label={`About ${label}`} className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">
      <Info className="h-3.5 w-3.5" />
    </summary>
    <div role="note" className="absolute left-0 top-8 z-30 w-72 rounded-xl border border-gray-200 bg-white p-3 text-left text-xs font-normal leading-relaxed text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
      {children}
    </div>
  </details>
}

export function SectionTitle({ title, help, description }: { title: string; help: string; description?: string }) {
  return <div className="border-b border-gray-100 pb-3 dark:border-gray-800">
    <div className="flex items-center gap-1"><h2 className="text-base font-semibold text-gray-950 dark:text-white">{title}</h2><InfoHint label={title}>{help}</InfoHint></div>
    {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">{description}</p>}
  </div>
}
