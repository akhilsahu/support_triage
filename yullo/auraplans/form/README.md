# Yullo Space forms: implementation index

Date: 2026-09-21. Status: implementation plan; proposed interfaces below are not claims that endpoints already exist.

## Product decisions and scope

Space is an overview. Editors open only when chosen. Preserve Home and the existing public chat experience. Use three patterns: Quick Editor (desktop sheet/mobile fullscreen), Manager (collection page), Visual Editor (controls + actual public renderer preview). Keep frontend components under `ui/src/yullo/`; never import Support247 form/screen components. Reuse backend persistence and infrastructure through Yullo services.

The owner experience is an editorial Yullo workspace, not a Support247 reskin and not a generic SaaS dashboard. Every standalone plan now defines its opening shell, route, hierarchy, exact light/dark tokens, fields, motion and responsive behavior. Coding agents must not substitute Support247 cards, equal dashboard tiles, provider marketplaces, KPI panels, glass/gradient surfaces or a rounded card around every section. App/system theme controls editors; a public Space theme appears only in the isolated Appearance preview and public Link.

Only Space type, display name and valid available handle block launch. This updates the earlier ready-source requirement in the completion plan: a Space without knowledge can publish its identity, while Aura says it has insufficient information and does not invent answers. Source failure is attention, not a reason to fabricate content. No new industry questionnaire is required.

Visibility approved by the user: `public`, `public_aura`, `owner_aura`, `private`; optional disclosure `direct`, `on_request`, `action_only`. These replace ambiguous `aura_only`. See 01 for enforcement. No owner-level multi-Space agent is introduced: owner Aura, if supported, is authenticated and scoped to the selected Space; otherwise owner_aura information stays stored and unavailable to inference.

## Existing code baseline

- Existing seven entity payloads: `app/yullo/services/entities/payloads.py`. Services and evidence persistence exist but need policy, revision, validation and extraction completion.
- Existing storage: shared `spaces`, `knowledge_bases`, `knowledge_base_items`, `ingestion_jobs`, `kb_facts`; isolated `yullo_spaces`, `yullo_configs`, `yullo_space_entities`, `yullo_space_entity_evidence`.
- Existing source service: `app/yullo/services/sources/service.py`; creation/handles/publication under `app/yullo/services/spaces/`.
- Owner CRUD router `app/yullo/api/entities.py` was absent during this inspection. Existing public entity endpoint filters booleans only and returns the full payload. It MUST be replaced with policy-aware serialization before richer visibility is exposed.
- Appearance currently has two possible homes: `yullo_spaces.appearance_config` and `yullo_configs.settings`. This plan selects `yullo_spaces.appearance_config` for presentation. Migrate any duplicate presentation values once; do not double-write.
- Installed frontend dependencies include React Hook Form, Zod, resolvers, Radix Dialog/Popover, Motion, Framer Motion, TanStack Query, dropzone, date-fns and Lucide. Use existing versions; no upgrade required by this plan. Standardize NEW Yullo form animations on `motion/react`; leave unrelated Framer Motion users alone.

## Read and execute in this order

1. [Shared form/UI/backend foundation](00-foundation.md)
2. [Visibility, review and provenance](01-visibility-review.md)
3. [Identity and handle](02-identity-form.md)
4. [Knowledge input and manager](03-knowledge-forms.md)
5. [Contact, links and social profiles](04-contact-links-forms.md)
6. [Locations and opening hours](05-location-hours-forms.md)
7. [Services and products/offers](06-offering-forms.md)
8. [Portfolio and projects](07-portfolio-form.md)
9. [FAQ and prompt starters](08-faq-prompts-forms.md)
10. [Aura behavior](09-aura-form.md)
11. [Appearance and preview](10-appearance-form.md)
12. [Events](11-event-form.md)
13. [Team](12-team-form.md)
14. [About, expertise and profile sections](13-profile-form.md)
15. [Programs and participation actions](14-program-actions-forms.md)
16. [Integrations](15-integrations-form.md)
17. [Release integration and coverage](16-release-integration.md)

Each form file includes placement, exact fields/storage, backend functions, UI files, save flow, motion, errors and acceptance checks. Read 00 and 01 before any form. Dependencies: identity/knowledge first; contact/actions before offering CTAs; location before events; visibility before public output; preview last after its DTO is stable.

18. [Current field compatibility audit](17-current-compatibility-audit.md): existing columns, missing schema fields, migrations and renderer mismatches.

## Approved backend layout

Frontend form code remains under `ui/src/yullo/forms/`. The backend does not model forms. All server-side validation and persistence for these editors lives in one approved package:

```text
app/yullo/services/persistence/
  common.py
  contracts.py
  identity.py
  knowledge.py
  entities.py
  profile.py
  aura.py
  appearance.py
  integrations.py
  visibility.py
  review.py
```

Each domain module owns both its strict Pydantic input/output contracts and its transactional persistence functions. `contracts.py` contains only shared primitives; `common.py` contains shared transaction finalization. Thin authenticated HTTP routes live in `app/yullo/api/space_data.py`. Onboarding, bootstrap, UI routes and background jobs call these same persistence entry points. Existing lower-level services may be called internally during migration, but they must not become a second public write path.

Do not create backend `services/forms/`, `schemas/forms/`, a parallel repository layer, or another backend directory. Ask the owner before creating any backend directory beyond the approved package. The existing Form 1 implementation under backend `forms`/`schemas/forms` is transitional and must be migrated according to 02, then removed only after all imports and focused checks pass.


## Use one form per session

Files 02–15 are self-contained implementation briefs. Each embeds its own UI/motion/library, API/security, visibility, persistence-layout, revision, dependency and handoff contracts. You do not need to paste conversation history or ask the agent to read every sibling plan. 00/01 remain master reference documents; the embedded contract revision is 2026-09-22.2. Future shared-rule changes must update affected standalone copies in the same documentation change to prevent drift.

Example session request:

> Implement only `yullo/auraplans/form/02-identity-form.md`. Read its embedded session contract, inspect current code, reuse existing Yullo infrastructure and complete this form's UI/backend flow. Preserve other work. Record verification and remaining gaps in that same plan when finished.

Next session selects a different file with the same instruction. Forms are individually understandable, not universally dependency-free: each has a local dependency section explaining minimum prerequisites and honest unavailable states. Prefer sequential sessions while shared components are evolving. For parallel sessions use isolated branches and coordinate router, registry, policy and migration edits.
