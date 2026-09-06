# Switchable Homepage SEO Design

## Problem

The public homepage is selected at runtime from `homepage1` through `homepage5`, but its search metadata previously described one fixed variant. Homepage 5 is currently active and shows paid plans starting at $29, while the old metadata advertised $5 and structured data advertised a free offer. Static fallback metadata also applied homepage claims and a homepage canonical to every SPA route.

## Required behavior

- `RouteSeo` must consume the same effective homepage variant as `ThemeSwitcher` through `useHomepageVariant()`.
- Each homepage variant must have its own title and description, matching the visible purpose of that variant.
- A `?homepage=homepage5` tab-local preview must preview homepage 5 metadata without changing the platform setting.
- Homepage 5 pricing metadata and `SoftwareApplication.offers.price` must derive from the visible `plans` data. The current minimum is `$29 USD per month`.
- Open Graph and Twitter title/description must match the active page title and description after client rendering.
- Public marketing routes must have self-referential canonical URLs on `https://www.support247.chat`.
- Private `/app` routes must use `noindex, nofollow` and must not retain public-page structured data.
- Structured data must contain only content that describes the rendered page. Do not emit the retired FAQ rich-result markup or claim ratings/reviews that do not exist.
- The shared SPA HTML must contain neutral fallback metadata and shared Organization/WebSite identity only. It must not contain a homepage-specific price, offer, FAQ, or canonical.
- `robots.txt`, sitemap URLs, canonical URLs, Open Graph URLs, and JSON-LD IDs must use the live `www.support247.chat` host.
- Do not add dependencies. Keep the existing React 18, React Router, Zustand, Vitest, and Vite stack.

## Boundaries

This design covers metadata switching, structured data, canonical consistency, static fallbacks, and regression tests. It does not cover server-rendered social previews, soft-404 routing for tenant slugs, Search Console operations, Core Web Vitals, marketing-claim review, or homepage accessibility fixes. Those need separate implementation work.

## Verification

- Tests exercise all five homepage variants, homepage 5 preview behavior, public/private route transitions, canonical values, social metadata synchronization, stale-schema removal, and pricing consistency.
- `npm run test -- src/lib/RouteSeo.test.tsx src/screens/home/home5/homepage5.test.tsx` passes.
- `npm run build` passes.
- `git diff --check -- ui` reports no whitespace errors.
