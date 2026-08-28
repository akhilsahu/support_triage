import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { X, Tag, Plus, Globe, Folder, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  knownTags?: string[]
  placeholder?: string
}

interface SuggestionItem {
  word: string
  source: 'kb' | 'online'
}

export function TagInput({
  tags,
  onChange,
  knownTags = [],
  placeholder = 'Add tags (press Enter or comma…)',
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [onlineSuggestions, setOnlineSuggestions] = useState<string[]>([])
  const [loadingOnline, setLoadingOnline] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const normalize = (str: string) => str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, ' ')

  // 1. Local KB Suggestions (fuzzy multi-word matching, handles & vs and)
  const kbSuggestions: SuggestionItem[] = knownTags
    .filter(t => t.trim() && !tags.some(existing => existing.toLowerCase() === t.toLowerCase()))
    .filter(t => {
      const normInput = normalize(input.trim())
      const normTag = normalize(t)
      if (normTag.includes(normInput)) return true
      const inputWords = normInput.split(/\s+/).filter(Boolean)
      return inputWords.every(w => normTag.includes(w))
    })
    .slice(0, 5)
    .map(word => ({ word, source: 'kb' }))

  // 2. Fetch Datamuse Online Terms as user types (only depends on input text string)
  useEffect(() => {
    const q = input.trim()
    if (!q || q.length < 2) {
      setOnlineSuggestions(prev => (prev.length > 0 ? [] : prev))
      setLoadingOnline(false)
      return
    }

    setLoadingOnline(true)
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.suggestTerms(q)
        const words = (res.terms || []).map(t => t.word)
        setOnlineSuggestions(words)
      } catch (err) {
        setOnlineSuggestions([])
      } finally {
        setLoadingOnline(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [input])

  // Filter online suggestions on render to avoid state churn
  const filteredOnline: SuggestionItem[] = onlineSuggestions
    .filter(w => w.trim() && !tags.some(existing => existing.toLowerCase() === w.toLowerCase()))
    .filter(w => !knownTags.some(k => k.toLowerCase() === w.toLowerCase()))
    .slice(0, 5)
    .map(word => ({ word, source: 'online' as const }))

  // Combine suggestions: Local KB tags first, then Datamuse Online terms
  const allSuggestions: SuggestionItem[] = [
    ...kbSuggestions,
    ...filteredOnline,
  ]

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [input])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().replace(/^,+|,+$/g, '')
    if (!trimmed) return
    if (!tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...tags, trimmed])
    }
    setInput('')
    setHighlightedIndex(-1)
  }

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, idx) => idx !== indexToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (highlightedIndex >= 0 && allSuggestions[highlightedIndex]) {
        addTag(allSuggestions[highlightedIndex].word)
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (allSuggestions.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % allSuggestions.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (allSuggestions.length > 0) {
        setHighlightedIndex(prev => (prev - 1 + allSuggestions.length) % allSuggestions.length)
      }
    } else if (e.key === 'Escape') {
      setFocused(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] bg-white dark:bg-gray-800 border rounded-lg transition-colors cursor-text ${
          focused
            ? 'border-indigo-500 ring-1 ring-indigo-500/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-full shadow-sm"
          >
            <Tag className="w-3 h-3 text-indigo-500 opacity-70" />
            <span>{tag}</span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                removeTag(idx)
              }}
              className="p-0.5 -mr-1 rounded-full hover:bg-indigo-200/50 dark:hover:bg-indigo-800/60 text-indigo-500 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => {
            const val = e.target.value
            if (val.includes(',')) {
              addTag(val)
            } else {
              setInput(val)
            }
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : 'Add more…'}
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-xs text-gray-900 dark:text-white placeholder-gray-400 p-0 focus:ring-0"
        />

        {loadingOnline && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 self-center mr-1" />
        )}
      </div>

      {/* Auto-suggest dropdown */}
      {focused && input.trim() && allSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden py-1 max-h-56 overflow-y-auto">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>Suggested Terms</span>
            <span className="text-[9px] text-indigo-500 font-mono">Datamuse API</span>
          </div>
          {allSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                addTag(suggestion.word)
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                idx === highlightedIndex
                  ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                {suggestion.source === 'kb' ? (
                  <Folder className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                <span className="truncate">{suggestion.word}</span>
              </span>
              <span className="flex items-center gap-1 flex-shrink-0 ml-2">
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                  suggestion.source === 'kb'
                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300'
                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300'
                }`}>
                  {suggestion.source === 'kb' ? 'KB' : 'Datamuse'}
                </span>
                <Plus className="w-3 h-3 text-gray-400" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
