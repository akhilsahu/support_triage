# Yullo Home API and Frontend Integration Plan

**Goal:** Deliver one authenticated, typed Home payload and replace production fixtures without changing the approved editorial design.

**Architecture:** `GET /api/v1/yullo/home` composes one snapshot and its derived modules. A frontend adapter converts typed backend actions/status into the existing Home presentation model and section registry.

**Depends on:** Plans 01–04.

## Reuse boundary

Reuse the authenticated backend primitives and the single Yullo Home response assembled from canonical tables. Do not reuse Support247 dashboard endpoints, DTOs, stores, screens, render blocks, or API clients. The Yullo frontend may reuse only product-neutral framework packages and low-level utilities; all Home mapping, actions, cache keys, components, and visual behavior remain under `ui/src/yullo/`.

## 11. API, frontend and preference writes

`app/yullo/services/home/service.py:get_yullo_home` calls load_home_snapshot once, runs pure builders, resolves selection, and serializes strict response. No event insert on page view. Define separate `pattern` field and retain `suggestion` for setup only.

`ui/src/yullo/home/apiAdapter.ts:mapYulloHomeResponse` maps wire DTOs; `actionResolver.ts:resolveHomeAction` accepts discriminated action kinds and required IDs. Render action only if destination screen exists. Opening a Space is a public link; manage/retry/review links go to authenticated Yullo views. Every destination API reauthorizes targets. Query key is `['yullo-home',authenticatedUserId]`; logout/account switch removes all Yullo owner queries.


## Exact API mapping and UI flow

Modify `app/schemas/yullo_home.py:YulloHomeResponse` to include account, preference, spaces, rightNow, attention[], recent[], forYou[], quickInsight|null, orbit|null, pattern|null, suggestion|null, generatedAt. Suggestion is setup guidance; pattern is behavioral evidence. Nullable unavailable metrics are not zero. New response models use extra=forbid.

`mapYulloHomeResponse(dto)` maps spaces to HomeSpace, recent to happening, preserves separate suggestion/pattern fields, and converts every action using resolveHomeAction. Update HomeData to include pattern separately; update existing pattern section to read pattern rather than reusing setup suggestion. Do not synthesize evidence or hrefs in components.

`useYulloHome(userId)` GETs existing /home through yulloApiClient with owner-keyed query and enabled=authenticated. Loading shows composition skeleton; 401 clears owner cache and redirects via Yullo auth; network failure shows Retry; unsupported sections collapse through sectionRegistry. Error never loads fixtures.

Action contracts: open_space requires Space UUID and server-provided real slug; retry_source requires Space/source UUID; review_knowledge/add_offering/add_action/add_location require Space UUID; open_entity requires Space/entity UUID; view_conversation_pattern requires Space UUID and approved intent. `resolveHomeAction(action, ownedSpaces, availableRoutes)` returns an internal navigation descriptor or null. Implement retry as an explicit authenticated POST to SourceService.retry_source with idempotency key, not a GET side effect; invalidate Home after success. Every entity destination reauthorizes same-Space ownership. Missing management routes yield null action and must be listed as integration dependencies. No dead or invented route.

API-to-UI verification uses real seeded canonical records: ready source -> count/readiness, current failed job -> retry attention, 7 distinct booking sessions -> one eligible signal, insufficient coverage -> no trend. Preserve all existing section components and automatic layout reflow.
