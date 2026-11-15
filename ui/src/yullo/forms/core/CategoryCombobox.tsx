import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Plus, X, Loader2 } from 'lucide-react';
import { formsApi, CategorySuggestionItem } from '../../api/forms';

/**
 * Fallback dictionary of categories organized by Space Purpose in case of network issues.
 */
export const CATEGORY_WORD_STORE: Record<'business' | 'creator' | 'person' | 'organization', string[]> = {
  business: [
    'E-commerce & Retail',
    'E-commerce',
    'SaaS & Software',
    'Technology & IT Services',
    'Healthcare & Medical',
    'Consulting & Professional Services',
    'Finance & Fintech',
    'Food, Dining & Beverage',
    'Hospitality & Travel',
    'Real Estate & Architecture',
    'Marketing, PR & Advertising',
    'Manufacturing & Industrial',
    'Legal & Regulatory Services',
    'Logistics & Supply Chain',
    'Fitness, Sports & Wellness',
    'Education & EdTech',
    'Media, Film & Entertainment',
    'CleanTech & Energy',
    'Aerospace & Space Technology',
    'Automotive & Mobility',
    'Design & Creative Agency',
    'Cybersecurity & Privacy',
    'AI & Machine Learning',
    'Fashion & Apparel',
    'Beauty & Cosmetics',
    'Biotechnology & Life Sciences',
    'Telecommunications',
    'Agriculture & AgriTech',
    'Construction & Contracting',
  ],
  creator: [
    'Content Creator & Influencer',
    'Digital Artist & Illustrator',
    'Writer & Author',
    'Podcaster & Broadcaster',
    'Musician, Producer & DJ',
    'Photographer',
    'Videographer & Filmmaker',
    'UI/UX & Product Designer',
    'Software Developer & Indie Hacker',
    'Educator & Course Creator',
    'Streamer & Gaming Creator',
    'Fashion & Style Creator',
    'Chef & Culinary Creator',
    '3D Artist & Animator',
    'Craftsman & Artisan',
    'Journalist & Commentator',
    'Comic & Storyboard Artist',
    'Fitness Trainer & Coach',
  ],
  person: [
    'Personal Portfolio',
    'Software Engineer & Developer',
    'Founder & Entrepreneur',
    'Product Manager',
    'Designer & Creative',
    'Researcher & Scientist',
    'Writer & Journalist',
    'Executive & Leader',
    'Consultant & Strategist',
    'Student & Learner',
    'Doctor & Healthcare Specialist',
    'Lawyer & Legal Advocate',
    'Architect & Urbanist',
    'Investor & Advisor',
    'Community Leader',
  ],
  organization: [
    'Non-Profit & NGO',
    'Open Source Project',
    'Community & Social Club',
    'Event & Conference Organizer',
    'Educational Institution & University',
    'Sports Club & League',
    'Arts & Cultural Collective',
    'Charity & Philanthropy',
    'Alumni Association',
    'Professional Association',
    'Think Tank & Policy Institute',
    'Environmental & Climate Coalition',
    'Youth & Student Association',
  ],
};

export interface CategoryComboboxProps {
  suggestions?: readonly string[];
  itemLabel?: string;
  value: string;
  onChange: (value: string) => void;
  purpose?: 'business' | 'creator' | 'person' | 'organization';
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
  id?: string;
}

/**
 * Normalizes a string by stripping punctuation and spaces for flexible fuzzy matching
 * (e.g., 'E commerce', 'e-commerce', and 'ecommerce' match seamlessly).
 */
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Highlights matching substring within a category name.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <span>{text}</span>;
  }

  const cleanQuery = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(cleanQuery);

  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + cleanQuery.length);
  const after = text.slice(index + cleanQuery.length);

  return (
    <span>
      {before}
      <span className="font-bold text-[var(--accent-ink)] underline decoration-[var(--accent)] decoration-2 underline-offset-2">
        {match}
      </span>
      {after}
    </span>
  );
}

/**
 * CategoryCombobox fetches category suggestions dynamically from the backend DB store table
 * while allowing users to type and select custom categories freely.
 */
export function CategoryCombobox({
  value,
  onChange,
  suggestions,
  itemLabel = "category",
  purpose = 'business',
  placeholder = 'e.g. Space technology company or E-commerce',
  disabled = false,
  autoFocus = false,
  maxLength = 100,
  className = '',
  id = 'category-combobox-input',
}: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dbSuggestions, setDbSuggestions] = useState<CategorySuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions from backend database API with debounce
  useEffect(() => {
    if (!isOpen || suggestions) return;

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const items = await formsApi.getCategorySuggestions(value, purpose, 35);
        setDbSuggestions(items);
      } catch (err) {
        console.warn('Failed to fetch DB category suggestions, using fallback word store:', err);
        // Fallback to local word store if backend is unreachable
        const fallbackList = CATEGORY_WORD_STORE[purpose] || CATEGORY_WORD_STORE.business;
        const mappedFallback: CategorySuggestionItem[] = fallbackList.map((name, idx) => ({
          id: `fallback-${idx}`,
          name,
          purpose,
          is_popular: idx < 8,
          usage_count: 0,
        }));
        setDbSuggestions(mappedFallback);
      } finally {
        setIsLoading(false);
      }
    }, 120);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [value, purpose, isOpen, suggestions]);

  // Flattened items for keyboard navigation and rendering
  const flatItems = useMemo(() => {
    const items: { type: 'custom' | 'suggestion'; text: string; isRecommended?: boolean; isPopular?: boolean }[] = [];
    const trimmedVal = (value || '').trim();

    const available = suggestions
      ? suggestions.filter(name => suggestions.some(option => option.toLocaleLowerCase() === trimmedVal.toLocaleLowerCase()) || name.toLocaleLowerCase().includes(trimmedVal.toLocaleLowerCase())).map(name => ({ name, purpose: undefined, is_popular: false }))
      : dbSuggestions;
    // Local option lists never fetch or publish category suggestions.
    const isExactMatch = available.some((sug) => sug.name.toLowerCase() === trimmedVal.toLowerCase());

    // If user has typed something that isn't an exact match, offer custom item at the top
    if (trimmedVal && !isExactMatch) {
      items.push({ type: 'custom', text: trimmedVal });
    }

    available.forEach((sug) => {
      items.push({
        type: 'suggestion',
        text: sug.name,
        isRecommended: sug.purpose === purpose,
        isPopular: sug.is_popular,
      });
    });

    return items;
  }, [dbSuggestions, value, purpose, suggestions]);

  // Adjust scroll when highlighted index changes
  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (categoryText: string) => {
    if (disabled) return;
    onChange(categoryText.slice(0, maxLength));
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
        e.preventDefault();
        handleSelect(flatItems[highlightedIndex].text);
      } else if (suggestions && isOpen && value.trim()) {
        e.preventDefault();
        handleSelect(value.trim());
      } else {
        // Close on enter if typing custom
        setIsOpen(false);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(true);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input container */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={isOpen && highlightedIndex >= 0 ? `${id}-opt-${highlightedIndex}` : undefined}
          value={value || ''}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-4 pr-16 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans]"
        />

        {/* Action icons (Clear, Loading, Toggle Arrow) */}
        <div className="absolute right-2.5 flex items-center gap-1 text-[var(--text-muted)]">
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
          )}
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              aria-label={`Clear ${itemLabel}`}
              className="p-1 rounded-md hover:bg-[var(--border)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setIsOpen(!isOpen);
              if (!isOpen) inputRef.current?.focus();
            }}
            disabled={disabled}
            aria-label={`Toggle ${itemLabel} suggestions`}
            className="p-1 rounded-md hover:bg-[var(--border)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Suggestion Dropdown */}
      {isOpen && !disabled && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ minWidth: suggestions ? 0 : '280px' }}
        >
          <ul
            ref={listboxRef}
            id={`${id}-listbox`}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1 text-[13px] font-[Instrument_Sans] divide-y divide-[var(--border)]/40 divide-dashed"
          >
            {flatItems.length === 0 && !isLoading ? (
              <li className="px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                No matching {itemLabel === "category" ? "categories" : "types"}. Type to use custom.
              </li>
            ) : (
              flatItems.map((item, idx) => {
                const isSelected = (value || '').trim().toLowerCase() === item.text.toLowerCase();
                const isHighlighted = idx === highlightedIndex;

                if (item.type === 'custom') {
                  return (
                    <li
                      key={`custom-${item.text}`}
                      id={`${id}-opt-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(item.text)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                        isHighlighted
                          ? 'bg-[var(--surface-soft)] text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--surface-soft)]/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-md bg-[var(--accent-solid)] text-[var(--accent-on-solid)] flex items-center justify-center shrink-0">
                          <Plus className="w-3 h-3 stroke-[3]" />
                        </div>
                        <div className="truncate">
                          <span className="text-xs text-[var(--text-secondary)]">Use custom: </span>
                          <span className="font-semibold text-[var(--text-primary)]">"{item.text}"</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--accent-ink)] border border-[var(--border)]">
                        Custom
                      </span>
                    </li>
                  );
                }

                return (
                  <li
                    key={`sug-${item.text}`}
                    id={`${id}-opt-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(item.text)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3.5 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                      isHighlighted
                        ? 'bg-[var(--surface-soft)] text-[var(--text-primary)]'
                        : isSelected
                        ? 'bg-[var(--surface-soft)]/70 text-[var(--accent-ink)] font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-soft)]/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-[var(--accent-ink)] stroke-[2.5] shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <HighlightMatch text={item.text} query={value || ''} />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.isPopular && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-solid)]/10 text-[var(--accent-ink)] border border-[var(--accent-solid)]/20">
                          Popular
                        </span>
                      )}
                      {item.isRecommended && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-soft)] text-[var(--text-muted)] border border-[var(--border)]">
                          Suggested
                        </span>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {/* Quick hint footer */}
          <div className="px-3.5 py-1.5 bg-[var(--surface-soft)]/50 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
            <span>↑↓ navigate • ↵ select</span>
            <span>From Database store</span>
          </div>
        </div>
      )}
    </div>
  );
}
