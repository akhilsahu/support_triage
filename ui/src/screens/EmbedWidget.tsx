import { useState, useEffect } from 'react'
import { Copy, Check, Code2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { apiClient } from '../api/client'

type Platform = 'html' | 'shopify' | 'wordpress' | 'react'

interface Chatbot {
  id: string
  slug: string
  display_name: string
  api_key: string
  is_default: boolean
}

function buildSnippets(origin: string, apiKey: string): Record<Platform, { display: string; copy: string }> {
  const src = `${origin}/widget.js?api_key=${apiKey}`
  return {
    html: {
      display: `<!-- Support247 Widget -->\n<script\n  src="${src}"\n  async\n></script>`,
      copy: `<script src="${src}" async></script>`,
    },
    shopify: {
      display: `{% comment %} Support247 Widget {% endcomment %}\n<script\n  src="${src}"\n  data-customer-email="{{ customer.email }}"\n  data-customer-name="{{ customer.name }}"\n  data-customer-id="{{ customer.id }}"\n  async\n></script>\n\n{%- comment -%}Add before </body> in theme.liquid{%- endcomment -%}`,
      copy: `<script src="${src}" data-customer-email="{{ customer.email }}" data-customer-name="{{ customer.name }}" data-customer-id="{{ customer.id }}" async></script>`,
    },
    wordpress: {
      display: `// Add to functions.php\nfunction support247_widget() {\n  echo '<script src="${src}" async></script>';\n}\nadd_action('wp_footer', 'support247_widget');`,
      copy: `function support247_widget() { echo '<script src="${src}" async></script>'; } add_action('wp_footer', 'support247_widget');`,
    },
    react: {
      display: `// In your root component or _app.tsx\nuseEffect(() => {\n  const s = document.createElement('script')\n  s.src = '${src}'\n  s.async = true\n  document.body.appendChild(s)\n  return () => document.body.removeChild(s)\n}, [])`,
      copy: `useEffect(() => { const s = document.createElement('script'); s.src = '${src}'; s.async = true; document.body.appendChild(s); return () => document.body.removeChild(s); }, [])`,
    },
  }
}

const PLATFORM_LABELS: Record<Platform, string> = {
  html: 'HTML / Custom',
  shopify: 'Shopify',
  wordpress: 'WordPress',
  react: 'React / Next.js',
}

export function EmbedWidget() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [selected, setSelected] = useState<Chatbot | null>(null)
  const [platform, setPlatform] = useState<Platform>('html')
  const [copied, setCopied] = useState<'snippet' | 'key' | null>(null)
  const [loading, setLoading] = useState(true)

  const widgetOrigin = window.location.origin

  useEffect(() => {
    apiClient.getChatbots()
      .then((data: Chatbot[]) => {
        setChatbots(data)
        const def = data.find(c => c.is_default) ?? data[0]
        if (def) setSelected(def)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const copyText = (text: string, type: 'snippet' | 'key') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const snippets = selected?.api_key ? buildSnippets(widgetOrigin, selected.api_key) : null

  return (
    <div className="p-6 max-w-3xl space-y-6">

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select a chatbot, then copy the embed snippet into your website, Shopify store, or WordPress theme.
        Each chatbot has a unique widget key — swapping it switches which bot loads on that page.
      </p>

      {/* Chatbot selector */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Select Chatbot</h3>

        {loading && (
          <p className="text-xs text-gray-400 italic">Loading chatbots…</p>
        )}

        {!loading && chatbots.length === 0 && (
          <p className="text-xs text-gray-400 italic">No chatbots found. Create one in Agents first.</p>
        )}

        {!loading && chatbots.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {chatbots.map(bot => (
              <button
                key={bot.id}
                onClick={() => setSelected(bot)}
                className={`text-left px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  selected?.id === bot.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <span className="block truncate">{bot.display_name}</span>
                {bot.is_default && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">Default</span>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Snippet card — shown once a chatbot is selected */}
      {selected && snippets && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Embed snippet — {selected.display_name}
              </h3>
            </div>

            {/* Truncated key + copy */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Key:</span>
              <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">
                {selected.api_key.slice(0, 8)}…
              </code>
              <button
                onClick={() => copyText(selected.api_key, 'key')}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Copy full key"
              >
                {copied === 'key'
                  ? <Check className="w-3.5 h-3.5 text-green-500" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Platform tabs */}
          <div className="flex gap-1 mb-4 flex-wrap">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map(tab => (
              <button
                key={tab}
                onClick={() => setPlatform(tab)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  platform === tab
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {PLATFORM_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Code block */}
          <div className="relative">
            <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all select-all">
              {snippets[platform].display}
            </pre>
            <button
              onClick={() => copyText(snippets[platform].copy, 'snippet')}
              className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors"
            >
              {copied === 'snippet'
                ? <><Check className="w-3 h-3 text-green-400" /> Copied</>
                : <><Copy className="w-3 h-3" /> Copy</>}
            </button>
          </div>

          {/* Full key row */}
          <div className="mt-3 p-3 bg-gray-50 dark:bg-white/5 rounded-lg flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Widget key:</span>
            <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400 flex-1 truncate">
              {selected.api_key}
            </code>
            <button
              onClick={() => copyText(selected.api_key, 'key')}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Copy key"
            >
              {copied === 'key'
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </Card>
      )}

      {/* How it works */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">How it works</h3>
        <ol className="space-y-2 text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside leading-relaxed">
          <li>Select the chatbot you want to embed above.</li>
          <li>Pick your platform tab and copy the snippet.</li>
          <li>
            Paste it before the{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">&lt;/body&gt;</code>{' '}
            tag on every page where the chat widget should appear.
          </li>
          <li>
            A branded floating chat button appears for your visitors. Clicking it opens the chat window.
          </li>
          <li>
            To embed a different bot on a different page, select it above and copy that snippet — each has a unique{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">api_key</code>.
          </li>
        </ol>
      </Card>

    </div>
  )
}
