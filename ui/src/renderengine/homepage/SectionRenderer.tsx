import { SECTION_REGISTRY } from './registry'
import type { SectionProps } from './types'

interface SectionRendererProps extends SectionProps {
  sections: string[]
}

// Composes the pre-chat empty state from a list of section ids. Unknown ids
// (e.g. a newer id an old cached frontend build doesn't recognize yet) are
// skipped defensively instead of crashing the page.
export function SectionRenderer({ sections, ...rest }: SectionRendererProps) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {sections.map((id) => {
        const Component = SECTION_REGISTRY[id]
        if (!Component) return null
        return (
          <div key={id} className="w-full flex flex-col items-center">
            <Component {...rest} />
          </div>
        )
      })}
    </div>
  )
}
