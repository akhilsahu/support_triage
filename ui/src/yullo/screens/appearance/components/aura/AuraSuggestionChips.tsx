import { YulloButton } from '../../../../components/core/YulloButton'
const suggestions = ['Match my cover and content', 'Make it more visual', 'Show services first', 'Make it more minimal']

export function AuraSuggestionChips({ onSelect }: { onSelect: (value: string) => void }) {
  return <div className="appearance-aura-chips">{suggestions.map((suggestion) => <YulloButton variant="outline" key={suggestion} onClick={() => onSelect(suggestion)}>{suggestion}</YulloButton>)}</div>
}
