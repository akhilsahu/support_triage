# Switchable Homepage SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public SEO metadata, canonical URLs, and structured data follow the same runtime homepage selection as the switchable UI, with homepage 5 accurately describing its $29 starting plan.

**Architecture:** Keep `useHomepageVariant()` as the single selector for both UI and SEO. Put variant and route metadata in a focused, pure configuration module, then let `RouteSeo` apply the resolved model to the document head and remove stale page data during navigation. Keep `index.html` limited to neutral crawler/social fallbacks and shared identity because it cannot know the runtime variant.

**Tech Stack:** React 18, TypeScript, React Router 6, Zustand, Vitest, Testing Library, Vite, JSON-LD.

**Spec:** `docs/superpowers/specs/2026-09-06-switchable-homepage-seo-design.md`

## Global Constraints

- `RouteSeo` must use the same effective value returned by `useHomepageVariant()` as `ThemeSwitcher`.
- Support `homepage1`, `homepage2`, `homepage3`, `homepage4`, and `homepage5` without changing the persisted platform value during a preview.
- Homepage 5 price claims must derive from `ui/src/screens/home/home5/content.ts`; do not duplicate `$29` in SEO configuration.
- Use `https://www.support247.chat` for every canonical, sitemap URL, Open Graph URL, and JSON-LD ID.
- Private `/app` routes remain `noindex, nofollow` and carry no public-page JSON-LD.
- Shared HTML contains neutral fallback metadata and Organization/WebSite identity only.
- Do not add dependencies or modify unrelated backend work in `app/api/v1/superadmin.py` or `app/config/`.
- Server-rendered variant metadata, tenant soft-404s, UI accessibility, claims review, and Core Web Vitals are outside this plan.

---

### Task 1: Define a pure homepage-aware SEO model

**Files:**
- Create: `ui/src/lib/seoConfig.ts`
- Create: `ui/src/lib/seoConfig.test.ts`
- Modify: `ui/src/lib/RouteSeo.tsx`

**Interfaces:**
- Consumes: `plans` from `ui/src/screens/home/home5/content.ts`.
- Produces: `export type HomepageVariant = 'homepage1' | 'homepage2' | 'homepage3' | 'homepage4' | 'homepage5'`.
- Produces: `export interface PageSeo { title: string; description: string; canonicalPath: string; softwareOffer?: { price: number; url: string } }`.
- Produces: `export function resolvePageSeo(pathname: string, homepage: HomepageVariant): PageSeo | undefined`.
- Produces: `export function buildStructuredData(meta: PageSeo, homepage: HomepageVariant): { '@context': 'https://schema.org'; '@graph': Record<string, unknown>[] }`.

- [ ] **Step 1: Write failing model tests**

Create `ui/src/lib/seoConfig.test.ts` with explicit expectations for every variant and route:

```ts
import { describe, expect, it } from 'vitest'
import { buildStructuredData, resolvePageSeo } from './seoConfig'

describe('resolvePageSeo', () => {
  it.each([
    ['homepage1', 'AI Customer Support Chatbot Platform'],
    ['homepage2', 'Find Your AI Support Space'],
    ['homepage3', 'Connect With Your Customer Support Space'],
    ['homepage4', 'Build an AI Customer Support Team'],
    ['homepage5', 'AI Customer Support for Shopify and Your Website'],
  ] as const)('returns distinct metadata for %s', (homepage, title) => {
    expect(resolvePageSeo('/', homepage)?.title).toContain(title)
  })

  it('derives the homepage5 starting price from its plan data', () => {
    const meta = resolvePageSeo('/', 'homepage5')!
    expect(meta.description).toContain('$29 USD per month')
    expect(meta.softwareOffer).toEqual({
      price: 29,
      url: 'https://www.support247.chat/#pricing',
    })
  })

  it('keeps ordinary marketing routes independent of homepage copy', () => {
    expect(resolvePageSeo('/features', 'homepage1')).toEqual(
      resolvePageSeo('/features', 'homepage5'),
    )
  })

  it('returns no public SEO model for private routes', () => {
    expect(resolvePageSeo('/app/login', 'homepage5')).toBeUndefined()
  })
})

describe('buildStructuredData', () => {
  it('adds a paid SoftwareApplication offer only when the page model has one', () => {
    const homepage = resolvePageSeo('/', 'homepage5')!
    const features = resolvePageSeo('/features', 'homepage5')!
    expect(buildStructuredData(homepage, 'homepage5')['@graph'])
      .toContainEqual(expect.objectContaining({ '@type': 'SoftwareApplication' }))
    expect(buildStructuredData(features, 'homepage5')['@graph'])
      .not.toContainEqual(expect.objectContaining({ '@type': 'SoftwareApplication' }))
  })
})
```

- [ ] **Step 2: Run the model tests and confirm failure**

Run from `ui/`:

```bash
npm run test -- src/lib/seoConfig.test.ts
```

Expected: FAIL because `./seoConfig` does not exist.

- [ ] **Step 3: Implement the pure SEO model**

Create `ui/src/lib/seoConfig.ts`. Move the variant and route copy out of `RouteSeo.tsx`, derive the homepage 5 price, and expose pure functions:

```ts
import { plans } from '../screens/home/home5/content'

export const SITE = 'https://www.support247.chat'
export const BRAND = 'SUPPORT247.chat'

export type HomepageVariant =
  | 'homepage1'
  | 'homepage2'
  | 'homepage3'
  | 'homepage4'
  | 'homepage5'

export interface PageSeo {
  title: string
  description: string
  canonicalPath: string
  softwareOffer?: { price: number; url: string }
}

const homepage5Price = Math.min(...plans.map((plan) => plan.price))

const HOMEPAGE_META: Record<HomepageVariant, Omit<PageSeo, 'canonicalPath'>> = {
  homepage1: {
    title: `AI Customer Support Chatbot Platform | ${BRAND}`,
    description: 'Find your support team. Search for an organization and chat with its AI support agents, or create a support space for your business.',
  },
  homepage2: {
    title: `Find Your AI Support Space | ${BRAND}`,
    description: 'Find a registered support space and connect with its AI agents. Get help through multi-agent routing and answers from business knowledge.',
  },
  homepage3: {
    title: `Connect With Your Customer Support Space | ${BRAND}`,
    description: 'Find a brand, team, or workspace and start a customer support conversation. Connect directly with the support space you need.',
  },
  homepage4: {
    title: `Build an AI Customer Support Team | ${BRAND}`,
    description: 'Build an AI support team with your business documents. Configure agents, publish your support space, and help customers with human handoff.',
  },
  homepage5: {
    title: `AI Customer Support for Shopify and Your Website | ${BRAND}`,
    description: `Answer customer questions from your docs and Shopify data, with human handoff when needed. Plans from $${homepage5Price} USD per month.`,
    softwareOffer: { price: homepage5Price, url: `${SITE}/#pricing` },
  },
}

const ROUTE_META: Record<string, Omit<PageSeo, 'canonicalPath'>> = {
  '/features': {
    title: `Features — AI Customer Support Chatbot | ${BRAND}`,
    description: 'Multi-agent AI, retrieval-augmented answers, live human handoff, analytics, and a no-code widget. Everything you need to automate customer support.',
  },
  '/how-it-works': {
    title: `How It Works — Build a Support Chatbot in Minutes | ${BRAND}`,
    description: 'See how to create a customer support chatbot: add your knowledge, connect data sources, and embed the widget on any website. No code required.',
  },
  '/pricing': {
    title: `Pricing — AI Customer Support Chatbot | ${BRAND}`,
    description: 'Simple pricing for an AI customer support chatbot. Start free, scale as you grow. Multi-agent automation and live chat included.',
    softwareOffer: { price: 0, url: `${SITE}/pricing` },
  },
  '/what-we-do': {
    title: `What We Do — AI Customer Support Automation | ${BRAND}`,
    description: 'SUPPORT247.chat automates customer support with AI agents and live human handoff, embeddable on any website.',
  },
  '/about': {
    title: `About — ${BRAND}`,
    description: 'About SUPPORT247.chat — the AI-powered, multi-agent customer support chatbot platform for modern teams.',
  },
  '/contact': {
    title: `Contact — ${BRAND}`,
    description: 'Get in touch with the SUPPORT247.chat team about AI customer support chatbots for your business.',
  },
  '/security': {
    title: `Security — ${BRAND}`,
    description: 'How SUPPORT247.chat protects your data: encryption, tenant isolation, and secure AI customer support infrastructure.',
  },
  '/privacy': {
    title: `Privacy Policy — ${BRAND}`,
    description: 'Privacy policy for SUPPORT247.chat, the AI customer support chatbot platform.',
  },
  '/terms': {
    title: `Terms of Service — ${BRAND}`,
    description: 'Terms of service for SUPPORT247.chat, the AI customer support chatbot platform.',
  },
  '/cookies': {
    title: `Cookie Policy — ${BRAND}`,
    description: 'Cookie policy for SUPPORT247.chat.',
  },
}

export function resolvePageSeo(pathname: string, homepage: HomepageVariant): PageSeo | undefined {
  if (pathname === '/') return { ...HOMEPAGE_META[homepage], canonicalPath: '/' }
  if (pathname === '/pricing' && homepage === 'homepage5') {
    return { ...ROUTE_META['/pricing'], description: HOMEPAGE_META.homepage5.description, softwareOffer: HOMEPAGE_META.homepage5.softwareOffer, canonicalPath: '/pricing' }
  }
  const meta = ROUTE_META[pathname]
  return meta ? { ...meta, canonicalPath: pathname } : undefined
}
```

Implement `buildStructuredData()` with the complete graph below. It appends `SoftwareApplication` only when the resolved page model includes an offer:

```ts
export function buildStructuredData(meta: PageSeo, _homepage: HomepageVariant) {
  const canonicalUrl = `${SITE}${meta.canonicalPath}`
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: BRAND,
      url: `${SITE}/`,
      logo: `${SITE}/favicon.jpg`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: BRAND,
      url: `${SITE}/`,
      publisher: { '@id': `${SITE}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: meta.title,
      description: meta.description,
      isPartOf: { '@id': `${SITE}/#website` },
    },
  ]

  if (meta.softwareOffer) {
    graph.push({
      '@type': 'SoftwareApplication',
      name: BRAND,
      url: `${SITE}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: meta.description,
      offers: {
        '@type': 'Offer',
        price: meta.softwareOffer.price,
        priceCurrency: 'USD',
        url: meta.softwareOffer.url,
      },
    })
  }

  return { '@context': 'https://schema.org' as const, '@graph': graph }
}
```

- [ ] **Step 4: Make RouteSeo consume the model**

Replace the metadata tables and JSON-LD construction in `RouteSeo.tsx` with imports:

```ts
import {
  SITE,
  buildStructuredData,
  resolvePageSeo,
  type HomepageVariant,
} from './seoConfig'
```

Resolve and apply the model in the effect:

```ts
const meta = resolvePageSeo(pathname, homepage as HomepageVariant)

if (meta) {
  updateStructuredData(buildStructuredData(meta, homepage as HomepageVariant))
  document.title = meta.title
  upsertMeta('name', 'description', meta.description)
  upsertMeta('name', 'robots', 'index, follow, max-image-preview:large')
  upsertMeta('property', 'og:title', meta.title)
  upsertMeta('property', 'og:description', meta.description)
  upsertMeta('property', 'og:url', `${SITE}${meta.canonicalPath}`)
  upsertMeta('name', 'twitter:title', meta.title)
  upsertMeta('name', 'twitter:description', meta.description)
  upsertCanonical(`${SITE}${meta.canonicalPath}`)
  return
}
```

Change `updateStructuredData` to accept the built object and set one `#site-structured-data` element. On `/app`, call `removeStructuredData()` before applying `noindex, nofollow`.

- [ ] **Step 5: Run model and document-head tests**

Run from `ui/`:

```bash
npm run test -- src/lib/seoConfig.test.ts src/lib/RouteSeo.test.tsx
```

Expected: both test files PASS.

- [ ] **Step 6: Commit the focused model change**

```bash
git add ui/src/lib/seoConfig.ts ui/src/lib/seoConfig.test.ts ui/src/lib/RouteSeo.tsx ui/src/lib/RouteSeo.test.tsx
git commit -m "feat: make homepage SEO follow active variant"
```

---

### Task 2: Keep fallback metadata and crawl signals neutral and canonical

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/public/robots.txt`
- Modify: `ui/public/sitemap.xml`
- Test: `ui/src/lib/RouteSeo.test.tsx`

**Interfaces:**
- Consumes: the runtime document-head behavior from Task 1.
- Produces: one neutral HTML fallback, one canonical hostname, and shared `#site-structured-data` identity markup.

- [ ] **Step 1: Add failing fallback and hostname tests**

Extend `RouteSeo.test.tsx` using the existing raw HTML fixture:

```ts
it('keeps shared HTML neutral and uses the live host', () => {
  expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  expect(meta('description')).not.toMatch(/\$\d|Start free/)
  expect(meta('og:url')).toBe('https://www.support247.chat/')
  expect(meta('og:image')).toBe('https://www.support247.chat/favicon.jpg')
  expect(graph().map((item) => item['@type'])).toEqual(['Organization', 'WebSite'])
})
```

Add file-text assertions by importing with `?raw`:

```ts
import robots from '../../public/robots.txt?raw'
import sitemap from '../../public/sitemap.xml?raw'

it('uses www URLs in crawler files', () => {
  expect(robots).toContain('Sitemap: https://www.support247.chat/sitemap.xml')
  expect(sitemap).not.toContain('https://support247.chat/')
})
```

- [ ] **Step 2: Run tests and confirm the pre-change failure**

Run from `ui/`:

```bash
npm run test -- src/lib/RouteSeo.test.tsx
```

Expected: FAIL on the old apex URLs, homepage canonical, missing image, or variant-specific structured data.

- [ ] **Step 3: Make index.html a neutral fallback**

Set the fallback description consistently across primary, Open Graph, and Twitter tags:

```html
<meta name="description" content="AI customer support with answers from your business knowledge, website chat, and human handoff. Find a support space or create one for your team." />
```

Remove the static canonical. Set `og:url` to `https://www.support247.chat/`. Until a dedicated 1200×630 asset exists, use the existing valid image with a summary card:

```html
<meta property="og:image" content="https://www.support247.chat/favicon.jpg" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:image" content="https://www.support247.chat/favicon.jpg" />
```

Replace the shared JSON-LD graph with only `Organization` and `WebSite` nodes using `www` URLs and `id="site-structured-data"`. Remove the old SoftwareApplication and FAQ nodes.

- [ ] **Step 4: Align sitemap and robots URLs**

Change every `<loc>` in `ui/public/sitemap.xml` to `https://www.support247.chat/...` and set:

```text
Sitemap: https://www.support247.chat/sitemap.xml
```

Keep the existing `/app/` crawl rule unchanged in this plan; resolving crawlable `noindex` for public auth shells belongs to the separate indexing-control task.

- [ ] **Step 5: Run fallback tests and build**

Run from `ui/`:

```bash
npm run test -- src/lib/seoConfig.test.ts src/lib/RouteSeo.test.tsx
npm run build
```

Expected: tests PASS and Vite ends with `built in` without TypeScript errors.

- [ ] **Step 6: Commit crawler-facing fallback changes**

```bash
git add ui/index.html ui/public/robots.txt ui/public/sitemap.xml ui/src/lib/RouteSeo.test.tsx
git commit -m "fix: align public SEO fallback and canonical host"
```

---

### Task 3: Prove switching and navigation cannot leave stale SEO

**Files:**
- Modify: `ui/src/lib/RouteSeo.test.tsx`
- Modify: `ui/src/screens/home/home5/homepage5.test.tsx`
- Verify: `ui/src/lib/seoConfig.test.ts`
- Verify: `ui/src/lib/RouteSeo.tsx`
- Verify: `ui/index.html`

**Interfaces:**
- Consumes: `resolvePageSeo`, `buildStructuredData`, and the single `#site-structured-data` element from Tasks 1–2.
- Produces: regression coverage for runtime variant changes, previews, route changes, and private-route cleanup.

- [ ] **Step 1: Add a stale-state regression test**

In `RouteSeo.test.tsx`, render `RouteSeo` once and switch the Zustand state through every homepage:

```ts
it('replaces stale homepage SEO when the active homepage changes', async () => {
  mount()
  await waitFor(() => expect(document.title).toContain('Shopify'))
  expect(meta('description')).toContain('$29 USD per month')

  const titles = new Set([document.title])
  for (const homepage of ['homepage1', 'homepage2', 'homepage3', 'homepage4'] as const) {
    act(() => useAppStore.getState().setActiveHomepage(homepage))
    await waitFor(() => expect(document.title).not.toContain('Shopify'))
    titles.add(document.title)
    expect(meta('description')).not.toContain('$29')
    expect(graph().some((item) => item['@type'] === 'SoftwareApplication')).toBe(false)
    expectSocialMatchesPage()
  }

  expect(titles.size).toBe(5)
  expect(document.querySelectorAll('#site-structured-data')).toHaveLength(1)
})
```

- [ ] **Step 2: Add preview and route-transition regressions**

Add tests that assert:

```ts
useAppStore.setState({ activeHomepage: 'homepage2' })
mount('/?homepage=homepage5')
expect(document.title).toContain('Shopify')
expect(useAppStore.getState().activeHomepage).toBe('homepage2')
expect(document.querySelector('link[rel="canonical"]'))
  .toHaveAttribute('href', 'https://www.support247.chat/')
```

Then navigate homepage → features → `/app/login` → homepage and assert that features has its own canonical, `/app/login` has `noindex, nofollow` with no JSON-LD element, and returning home restores homepage 5 paid-offer schema.

- [ ] **Step 3: Update the existing homepage 5 title expectation**

In `homepage5.test.tsx`, replace the old title fragment with the approved homepage 5 title:

```ts
await waitFor(() =>
  expect(document.title).toContain('AI Customer Support for Shopify')
)
```

- [ ] **Step 4: Run the complete focused regression suite**

Run from `ui/`:

```bash
npm run test -- src/lib/seoConfig.test.ts src/lib/RouteSeo.test.tsx src/screens/home/home5/homepage5.test.tsx
```

Expected: all files PASS. The existing React Router v7 future-flag warnings are informational and do not fail the suite.

- [ ] **Step 5: Run production and whitespace verification**

Run:

```bash
cd ui && npm run build
cd .. && git diff --check -- ui docs/superpowers/specs/2026-09-06-switchable-homepage-seo-design.md docs/superpowers/plans/2026-09-06-switchable-homepage-seo.md
```

Expected: the production build passes and `git diff --check` prints nothing.

- [ ] **Step 6: Review the final scope and commit tests/docs**

Run:

```bash
git status --short
git diff --stat -- ui docs/superpowers/specs/2026-09-06-switchable-homepage-seo-design.md docs/superpowers/plans/2026-09-06-switchable-homepage-seo.md
```

Confirm the diff contains only the SEO UI files and these two documents. Do not stage `app/api/v1/superadmin.py` or `app/config/`.

```bash
git add ui/src/lib/RouteSeo.test.tsx ui/src/screens/home/home5/homepage5.test.tsx docs/superpowers/specs/2026-09-06-switchable-homepage-seo-design.md docs/superpowers/plans/2026-09-06-switchable-homepage-seo.md
git commit -m "test: cover switchable homepage SEO"
```

---

## Final Acceptance

- Homepage 5 remains the live active selection; this implementation does not change the server setting.
- All five homepage variants produce distinct, visible-content-aligned titles and descriptions.
- Homepage 5 description and SoftwareApplication offer resolve to the minimum visible plan price, currently `$29`.
- Previewing homepage 5 changes only the tab's rendered UI and SEO.
- Open Graph and Twitter title/description match the rendered page.
- Public canonical and crawler-file URLs use `https://www.support247.chat`.
- Private app navigation removes public schema and sets `noindex, nofollow`.
- Shared HTML has no homepage-specific canonical, price, FAQ, or offer.
- Focused tests, the production build, and whitespace checks pass.
