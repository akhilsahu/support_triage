# OrchestraSupport UI — Design System Documentation

## Stack
- React 18 + TypeScript
- React Router v6 (client-side routing)
- Zustand (global state with localStorage persistence)
- TanStack Query v5 (server state, caching)
- Axios (HTTP client)
- Tailwind CSS 3 with `darkMode: 'class'`
- Recharts (charts)
- Lucide React (icons)
- clsx + tailwind-merge (className utilities)
- date-fns (date formatting)

---

## File Structure

```
src/
  config/
    api.ts          — All API endpoint paths, base URL, quick actions
    agents.ts       — Built-in agent definitions (5 agents)
    navigation.ts   — Sidebar nav items
    theme.ts        — Color tokens, agent themes, sentiment helpers
  types/
    index.ts        — Message, SourceItem, AgentStatus, RagDoc, StatsData
  store/
    useAppStore.ts  — Zustand store (theme, sidebar, chat, backend status, settings)
  api/
    client.ts       — Axios-based API client (all backend calls)
  components/
    ui/
      cn.ts               — clsx + twMerge helper
      Badge.tsx           — Inline badge pill (default/success/warning/danger)
      Button.tsx          — Button (primary/secondary/ghost/danger, sm/md/lg, loading state)
      Card.tsx            — White/dark surface card with optional onClick
      StatusDot.tsx       — Animated colored dot (connected/disconnected/checking/active/idle)
      SkeletonLoader.tsx  — Skeleton + ChatSkeleton components
      SourceCitation.tsx  — Collapsible RAG source citations
      Toggle.tsx          — Accessible on/off toggle switch
    layout/
      Sidebar.tsx   — Collapsible sidebar with nav links and backend status
      Header.tsx    — Top bar with title, dark mode toggle, status indicator
      Layout.tsx    — Full-page shell combining Sidebar + Header + main
  screens/
    Dashboard.tsx     — Overview with stat cards, sparkline chart, activity feed, agent grid
    Chat.tsx          — Full chat UI with markdown, sentiment bars, source citations
    Agents.tsx        — Agent management with toggles and custom agent creator
    KnowledgeBase.tsx — Drag-drop doc upload (Session Docs + Admin KB tabs)
    Analytics.tsx     — Mock analytics with Recharts charts
    Settings.tsx      — Appearance, API config, client ID, danger zone
  App.tsx       — Router + QueryClientProvider + health polling
  index.css     — Tailwind directives + global base styles
```

---

## Color System

All agent colors come from `src/config/theme.ts`. Each agent has three properties:

| Agent        | bg             | badge (light/dark)                              | dot           |
|--------------|----------------|-------------------------------------------------|---------------|
| triage       | bg-blue-500    | bg-blue-100 text-blue-700 / dark variants       | bg-blue-500   |
| logistics    | bg-emerald-500 | bg-emerald-100 text-emerald-700 / dark variants | bg-emerald-500|
| finance      | bg-purple-500  | bg-purple-100 text-purple-700 / dark variants   | bg-purple-500 |
| order        | bg-orange-500  | bg-orange-100 text-orange-700 / dark variants   | bg-orange-500 |
| tech_support | bg-teal-500    | bg-teal-100 text-teal-700 / dark variants       | bg-teal-500   |
| custom       | bg-indigo-500  | bg-indigo-100 text-indigo-700 / dark variants   | bg-indigo-500 |

Use `getAgentTheme(agentLabel: string)` to resolve an agent name string to its theme tokens.

### Sentiment Colors

| Score range | Color          | Label         |
|-------------|----------------|---------------|
| < 0.35      | bg-red-400     | 😠 Frustrated |
| 0.35–0.5    | bg-yellow-400  | 😕 Concerned  |
| 0.5–0.75    | bg-yellow-400  | 🙂 Neutral    |
| ≥ 0.75      | bg-green-400   | 😊 Positive   |

Use `getSentimentColor(score)` and `getSentimentLabel(score)` from `theme.ts`.

---

## Dark Mode

Dark mode is implemented via Tailwind's `class` strategy. The `html` element receives `class="dark"` when enabled. The Zustand store persists the `isDark` flag and applies the class on mount and on toggle.

Every component uses `dark:` variant classes. Example pattern:
```
bg-white dark:bg-gray-800
text-gray-900 dark:text-white
border-gray-200 dark:border-gray-700
```

---

## Global State (Zustand)

`useAppStore` persists: `isDark`, `sidebarCollapsed`, `apiKey`, `clientId`.

Runtime-only (not persisted): `messages`, `conversationId`, `activeAgent`, `backendStatus`.

Key actions:
- `toggleTheme()` — flips dark mode and applies/removes `dark` class on `<html>`
- `addMessage(msg)` — appends a message to the chat
- `clearChat()` — resets messages + conversationId
- `setBackendStatus(s)` — updated by health polling in App.tsx every 30s
- `setClientId(id)` — used by KnowledgeBase admin upload and Settings

---

## API Client

All calls go through `src/api/client.ts`. Base URL defaults to `http://127.0.0.1:8000` and can be overridden via the `VITE_API_URL` environment variable.

Key methods:
- `healthCheck()` — GET /health
- `sendMessage(message, conversationId?)` — POST /api/v1/chat
- `getAgentStatus()` — GET /api/v1/agents/status
- `uploadDoc(file, clientId?, docType?)` — POST /api/v1/documents/rag/upload with form-data + headers
- `listDocs()` — GET /api/v1/documents/rag/list
- `deleteDoc(docId)` — DELETE /api/v1/documents/rag/:id

---

## Adding a New Screen

1. Create `src/screens/MyScreen.tsx`
2. Add a route in `src/App.tsx`:
   ```tsx
   <Route path="/my-screen" element={<Layout title="My Screen"><MyScreen /></Layout>} />
   ```
3. Add a nav entry in `src/config/navigation.ts`:
   ```ts
   { id: 'my-screen', label: 'My Screen', icon: 'SomeLucideIcon', path: '/my-screen' }
   ```
4. Register the icon in `src/components/layout/Sidebar.tsx` ICONS map.

---

## Component Usage Examples

### Button
```tsx
<Button variant="primary" size="md" loading={false} onClick={handler}>Save</Button>
<Button variant="danger" size="sm">Delete</Button>
<Button variant="secondary">Cancel</Button>
```

### Badge
```tsx
<Badge variant="success">Online</Badge>
<Badge variant="warning">Pending</Badge>
<Badge className="bg-blue-100 text-blue-700">Custom</Badge>
```

### Card
```tsx
<Card className="p-4">Content here</Card>
<Card onClick={() => navigate('/chat')} className="p-4">Clickable card</Card>
```

### Toggle
```tsx
<Toggle checked={isOn} onChange={(v) => setIsOn(v)} />
<Toggle checked={locked} onChange={() => {}} disabled />
```

### StatusDot
```tsx
<StatusDot status="connected" />
<StatusDot status="checking" className="w-3 h-3" />
```
