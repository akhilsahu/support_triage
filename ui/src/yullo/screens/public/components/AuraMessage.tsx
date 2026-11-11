import { ChatSourceImage } from '../../../components/generative-ui/cards/SourceImagesCard'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeUrl } from '../../../components/generative-ui/shared/safeUrl'
import { AuraMessage as AuraMessageType } from '../../../services/aura/types'
import { AuraRenderer } from '../../../components/generative-ui/AuraRenderer'

export function AuraMessage({ spaceId, message, onRetry }: { spaceId: string, message: AuraMessageType, onRetry: () => void }) {
  return (
    <div className="flex gap-4 w-full mx-auto py-6">
      <div className="w-8 h-8 rounded-full bg-[var(--presentation-accent-soft)] border border-[var(--presentation-border)] flex-shrink-0 flex items-center justify-center text-[var(--presentation-accent-ink)] font-bold text-xs shadow-sm mt-1">
        Y
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {message.text && (
          <div className="text-[var(--presentation-text)] text-[15px] leading-relaxed break-words max-w-[760px] space-y-3">
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={url => safeUrl(url, true) || ''} components={{
              a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-[var(--presentation-accent-ink)]">{children}</a> : <span>{children}</span>,
              // Images come from authorized cards, never arbitrary model-generated URLs.
              img: () => null,
              p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-6 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1">{children}</ol>,
              h1: ({ children }) => <h3 className="text-xl font-semibold">{children}</h3>,
              h2: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
              h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
              pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-[var(--presentation-surface)] p-3 text-sm">{children}</pre>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--presentation-accent)] pl-3">{children}</blockquote>,
              table: ({ children }) => <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
              th: ({ children }) => <th className="border border-[var(--presentation-border)] p-2 text-left">{children}</th>,
              td: ({ children }) => <td className="border border-[var(--presentation-border)] p-2">{children}</td>,
            }}>{message.text}</ReactMarkdown>
            {message.status === 'streaming' && (
              <span className="inline-block w-2 h-4 ml-1 bg-[var(--presentation-muted)] animate-pulse" />
            )}
          </div>
        )}
        
        {!!message.ui.length && (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {message.ui.flatMap((node, i) => node.type === 'images'
              ? node.imageIds.map(id => (
                <div key={`${i}-${id}`} className="min-w-0 motion-safe:animate-in motion-safe:fade-in duration-300">
                  <ChatSourceImage spaceId={spaceId} imageId={id} />
                </div>
              ))
              : [<div key={i} className={`min-w-0 [&>div]:h-full ${node.type === 'actions' ? 'col-span-full' : ''}`}>
                  <AuraRenderer spaceId={spaceId} node={node} />
                </div>]
            )}
          </div>
        )}

        {message.status === 'complete' && !!message.citations?.length && (
          <details className="text-sm text-[var(--presentation-muted)]">
            <summary className="cursor-pointer">Retrieved references ({message.citations.length})</summary>
            <p className="my-2">Related information retrieved for this reply; individual claims have not been independently verified.</p>
            <ul className="space-y-3">
              {message.citations.map((citation, index) => {
                const href = safeUrl(citation.sourceUrl)
                return <li key={`${citation.id}-${index}`}>
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-[var(--presentation-accent-ink)]">{citation.label}</a> : <strong>{citation.label}</strong>}
                  {citation.snippet && <p className="mt-1 whitespace-pre-wrap break-words">{citation.snippet}</p>}
                </li>
              })}
            </ul>
          </details>
        )}

        {message.status === 'error' && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--presentation-muted)] mt-2">
            <span>{message.text || message.ui.length ? 'This reply was interrupted and may be incomplete.' : 'Aura couldn’t respond.'}</span>
            <button type="button" onClick={onRetry} className="font-medium text-[var(--presentation-accent-ink)] underline decoration-[var(--presentation-accent)] underline-offset-4">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
