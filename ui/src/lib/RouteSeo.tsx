import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useHomepageVariant } from '../screens/home/useHomepageVariant'
import { plans } from '../screens/home/home5/content'

/**
 * RouteSeo — lightweight per-route meta manager (no external deps).
 *
 * Mounted once inside <BrowserRouter>. On every navigation it updates:
 *   - <title>
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - Open Graph, Twitter metadata, and page-specific structured data
 *   - <meta name="robots"> (noindex for the private app)
 *
 * NOTE: this is client-side. Google can render this metadata, but social
 * scrapers (which don't run JS) read the neutral index.html defaults. For full
 * coverage, render metadata on the server or regenerate prerenders when the public variant changes.
 */

const SITE = 'https://www.support247.chat'
const BRAND = 'SUPPORT247.chat'

interface Meta { title: string; description: string }

// Keep marketing SEO tied to the same variant used by ThemeSwitcher, including previews.
const HOMEPAGE_META: Record<ReturnType<typeof useHomepageVariant>, Meta> = {
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
    description: `Answer customer questions from your docs and Shopify data, with human handoff when needed. Plans from $${Math.min(...plans.map(plan => plan.price))} USD per month.`,
  },
}

const STRUCTURED_DATA_ID = 'site-structured-data'

function updateStructuredData(pathname: string, meta: Meta | undefined, homepage: ReturnType<typeof useHomepageVariant>) {
  let script = document.getElementById(STRUCTURED_DATA_ID)
  if (!meta) {
    script?.remove()
    return
  }
  if (!script) {
    script = document.createElement('script')
    script.id = STRUCTURED_DATA_ID
    script.setAttribute('type', 'application/ld+json')
    document.head.appendChild(script)
  }
  const graph: Record<string, unknown>[] = [
    { '@type': 'Organization', '@id': `${SITE}/#organization`, name: BRAND, url: `${SITE}/`, logo: `${SITE}/favicon.jpg` },
    { '@type': 'WebSite', '@id': `${SITE}/#website`, name: BRAND, url: `${SITE}/`, publisher: { '@id': `${SITE}/#organization` } },
    { '@type': 'WebPage', '@id': `${SITE}${pathname}#webpage`, url: `${SITE}${pathname}`, name: meta.title, description: meta.description, isPartOf: { '@id': `${SITE}/#website` } },
  ]
  if ((pathname === '/' && homepage === 'homepage5') || pathname === '/pricing') {
    graph.push({
      '@type': 'SoftwareApplication',
      name: BRAND,
      url: `${SITE}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: meta.description,
      offers: {
        '@type': 'Offer',
        price: homepage === 'homepage5' ? Math.min(...plans.map(plan => plan.price)) : 0,
        priceCurrency: 'USD',
        url: homepage === 'homepage5' ? `${SITE}/#pricing` : `${SITE}/pricing`,
      },
    })
  }
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
}

// Keyword-targeted meta for each public marketing route.
const ROUTE_META: Record<string, Meta> = {
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

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function RouteSeo() {
  const { pathname } = useLocation()
  const homepage = useHomepageVariant()

  useEffect(() => {
    const meta = pathname === '/' ? HOMEPAGE_META[homepage]
      : pathname === '/pricing' && homepage === 'homepage5'
        ? { title: ROUTE_META['/pricing'].title, description: HOMEPAGE_META.homepage5.description }
        : ROUTE_META[pathname]
    updateStructuredData(pathname, meta, homepage)

    if (meta) {
      // Public marketing page — metadata for the rendered route.
      document.title = meta.title
      upsertMeta('name', 'description', meta.description)
      upsertMeta('name', 'robots', 'index, follow, max-image-preview:large')
      upsertMeta('property', 'og:title', meta.title)
      upsertMeta('property', 'og:description', meta.description)
      upsertMeta('property', 'og:url', `${SITE}${pathname}`)
      upsertMeta('name', 'twitter:title', meta.title)
      upsertMeta('name', 'twitter:description', meta.description)
      upsertCanonical(`${SITE}${pathname}`)
      return
    }

    if (pathname.startsWith('/app')) {
      // Private product — keep the dashboard out of the index entirely.
      upsertMeta('name', 'robots', 'noindex, nofollow')
      return
    }

    // Tenant chat pages (/<slug>) and anything else: we don't optimize these,
    // but we don't block them either — let Google index them naturally if it
    // finds them. The one fix: make the canonical self-referential so they don't
    // inherit the homepage canonical from index.html (which would deindex them).
    // Title is managed by the screen itself (e.g. CustomerChat sets the brand).
    upsertMeta('name', 'robots', 'index, follow')
    upsertCanonical(`${window.location.origin}${pathname}`)
  }, [pathname, homepage])

  return null
}
