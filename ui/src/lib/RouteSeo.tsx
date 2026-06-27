import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * RouteSeo — lightweight per-route meta manager (no external deps).
 *
 * Mounted once inside <BrowserRouter>. On every navigation it updates:
 *   - <title>
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - <meta name="robots">  (noindex for the private app + tenant chat pages)
 *
 * NOTE: this is client-side. Google renders JS and will pick it up, but social
 * scrapers (which don't run JS) read the static index.html defaults. For full
 * coverage, prerender the marketing routes at build time (see follow-up notes).
 */

const SITE = 'https://support247.chat'
const BRAND = 'SUPPORT247.chat'

interface Meta { title: string; description: string }

// Keyword-targeted meta for each public marketing route.
const ROUTE_META: Record<string, Meta> = {
  '/': {
    title: `AI Customer Support Chatbot Platform | ${BRAND}`,
    description: 'Build an AI-powered customer support chatbot in minutes. Multi-agent automation, live human handoff, and a no-code embeddable widget for any website. Start free.',
  },
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

  useEffect(() => {
    const meta = ROUTE_META[pathname]

    if (meta) {
      // Public marketing page — full SEO.
      document.title = meta.title
      upsertMeta('name', 'description', meta.description)
      upsertMeta('name', 'robots', 'index, follow, max-image-preview:large')
      upsertMeta('property', 'og:title', meta.title)
      upsertMeta('property', 'og:description', meta.description)
      upsertMeta('property', 'og:url', `${SITE}${pathname}`)
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
  }, [pathname])

  return null
}
