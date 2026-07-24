import { SECTION_REGISTRY } from './registry'
import type { SectionProps } from './types'

interface SectionRendererProps extends SectionProps {
  sections: string[]
}

// Sections that always want the full content width -- the hero (centered
// greeting), the closing question chips, and an admin promo banner. Everything
// else is a self-contained content block that can sit in one column of the
// desktop 2-up grid below.
const FULL_WIDTH = new Set(['hero', 'suggested_questions', 'promo'])

// Composes the pre-chat empty state from a list of section ids. One column on
// mobile; on large screens the content blocks flow into a 2-column grid (hero
// and questions still span full width) so the page uses the horizontal space
// instead of a tall skinny column. Unknown ids (e.g. a newer id an old cached
// frontend build doesn't recognize yet) are skipped instead of crashing.
export function SectionRenderer({ sections, ...rest }: SectionRendererProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 w-full max-w-md lg:max-w-4xl mx-auto">
      {sections.map((id) => {
        const Component = SECTION_REGISTRY[id]
        if (!Component) return null
        return (
          <div
            key={id}
            className={`w-full flex flex-col items-center ${FULL_WIDTH.has(id) ? 'lg:col-span-2' : ''}`}
          >
            <Component {...rest} />
          </div>
        )
      })}
    </div>
  )
}
