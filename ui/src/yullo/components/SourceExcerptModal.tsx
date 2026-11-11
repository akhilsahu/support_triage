import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import { yulloOnboardingApi } from '../api/onboarding';

interface SourceExcerptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sourceId: string;
}

export const SourceExcerptModal: React.FC<SourceExcerptModalProps> = ({
  isOpen,
  onClose,
  title,
  sourceId,
}) => {
  const { data: fullContent, isLoading } = useQuery({
    queryKey: ['source-content', sourceId],
    queryFn: () => yulloOnboardingApi.getSourceContent(sourceId),
    enabled: isOpen && !!sourceId,
  });

  const [currentPage, setCurrentPage] = React.useState(0);
  const PAGE_SIZE = 10000;

  React.useEffect(() => {
    if (isOpen) {
      setCurrentPage(0);
    }
  }, [isOpen, sourceId]);

  const pages = React.useMemo(() => {
    if (!fullContent) return [];
    const result = [];
    let current = fullContent;
    while (current.length > PAGE_SIZE) {
      let splitIdx = current.lastIndexOf('\n', PAGE_SIZE);
      if (splitIdx === -1 || splitIdx < PAGE_SIZE / 2) {
        splitIdx = PAGE_SIZE; // fallback if no newline found near end
      }
      result.push(current.substring(0, splitIdx));
      current = current.substring(splitIdx).trimStart();
    }
    if (current.length > 0) result.push(current);
    return result;
  }, [fullContent]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-[Instrument_Sans]">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div 
        className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 p-5 sm:px-6 border-b border-[var(--border)] bg-[var(--surface-soft)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface)] border border-[var(--border)] text-violet-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-[Satoshi] text-[17px] font-semibold text-[var(--text-primary)]">Source Excerpt</h2>
              <p className="mt-0.5 text-[13px] text-[var(--text-secondary)] truncate max-w-xs sm:max-w-md">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-[14px] leading-relaxed text-[var(--text-primary)]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-ink)] mb-3" />
              <p>Loading full text...</p>
            </div>
          ) : (
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown>{pages[currentPage] || '*No content available*'}</ReactMarkdown>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-[var(--border)] bg-[var(--surface-soft)] flex items-center justify-between gap-4 flex-wrap">
          {pages.length > 1 ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)] transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <span className="text-[12px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
                Page {currentPage + 1} of {pages.length}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                disabled={currentPage === pages.length - 1}
                className="flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)] transition-colors"
                title="Next page"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : <div />}
          <button 
            onClick={onClose}
            className="min-h-[40px] px-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors ml-auto"
          >
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};
