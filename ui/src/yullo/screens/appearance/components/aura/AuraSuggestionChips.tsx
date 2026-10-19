const suggestions = ['Make it more visual', 'Use less yellow', 'Show services first', 'Make it more minimal']

export function AuraSuggestionChips({ onSelect }: { onSelect: (value: string) => void }) {
  return <div className="appearance-aura-chips">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => onSelect(suggestion)}>{suggestion}</button>)}</div>
}
