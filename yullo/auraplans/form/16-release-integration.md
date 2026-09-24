# Form release integration and coverage plan

## Ship order

1. Foundation and policy enforcement first; no visibility controls before server filtering works.
2. Identity/handle, knowledge CRUD and source processing.
3. Contact/actions, location/hours and offerings.
4. Portfolio/team/events, FAQ/prompts and profile/program sections.
5. Aura behavior, Appearance and real public preview.
6. Provider-backed integrations and optional web learning only when their adapters are working.

Each increment includes UI+schema+API+reader in one deliverable, not frontend-only forms that cannot save.

## Canonical backend boundary

Use `app/yullo/services/persistence/` as the only backend entry boundary for validation plus persistence. Domain contracts and write functions stay together in `identity.py`, `knowledge.py`, `entities.py`, `profile.py`, `aura.py`, `appearance.py` and `integrations.py`; shared primitives belong in `contracts.py`, and atomic finalization belongs in `common.py`. Thin authenticated routes live in `app/yullo/api/space_data.py`. Do not create backend form/schema mirrors, a parallel repository layer, or a new directory without owner approval.

Before further Form 1 work, migrate the existing `app/yullo/services/forms/identity.py`, `app/yullo/schemas/forms/identity.py` and `app/yullo/api/space_forms.py` implementation into the canonical boundary. Preserve working behavior and reuse existing lower-level Space/entity/handle services internally. Update every import and router registration first; delete obsolete modules only after focused checks pass and only when they are empty of unrelated work.

## Shared writes: UI, bootstrap and source extraction

UI request -> authenticated controller -> canonical Yullo service -> shared/isolate models -> registered transactional event -> published projection -> Home/public refresh.
Bootstrap -> complete preflight -> same canonical service with explicit selected owner -> same completion and publication -> verify exact IDs/state through owner and public APIs. Sources process through the real worker. Preserve failure reports; no UI-specific hidden steps required. Input may be synthetic only for the designated nonproduction fixture owner.
Source extraction -> provider -> strict candidate validation -> evidence -> private review -> owner confirm -> same policy/publication finalizer. No entity extraction provider is operational merely because its Protocol exists.

## Launch policy reconciliation

Modify `app/yullo/services/spaces/publication.py` and onboarding launch to use one service and the latest launch requirements: approved type, display_name, valid available handle. A ready KB item is NOT required to publish the identity page. Expose `auraReadiness=insufficient_knowledge|ready|processing|attention` independently of lifecycle. Empty knowledge answers with a truthful limitation and owner-approved contact options. Never label Aura trained/ready solely because Space is live. Publish does not auto-confirm extracted candidates.

Update 07 bootstrap and 08 completion plan references during implementation so they no longer enforce ready-source launch. Resolve the selected Space explicitly; first-draft queries are invalid for multi-Space owners. Keep product/owner isolation on all draft, handle and source routes.

## Cross-cutting migrations

- Existing identity_key migration is reused, not duplicated.
- Entity sort_order, visibility, disclosure_mode and validated field_policies; any missing positive schema/revision constraints.
- YulloConfig revision for atomic typed JSON edits.
- FAQ fact revision/policy fields and source-policy storage only if absent; preserve shared Support247 compatibility through Yullo-specific readers and nullable additions where required.
- Presentation canonicalization to yullo_spaces.appearance_config only when duplicate existing data is found; preserve owner choices.
- No tables per form. No yullo_resources revival. No new root-agent, commerce, calendar or social-network infrastructure.
- No duplicated validation between route schemas and persistence modules. The persistence domain module is authoritative; routes only authenticate, parse transport details, call it and serialize the result.

## Public integration defects observed

`app/yullo/api/public.py` currently returns placeholder identity details, empty prompt starters and boolean-only entity filters. Replace with published owner-independent projections and validate live Yullo Space before sessions and entity reads.

`ServiceCard.tsx` expects entity.title/payload.url; canonical offerings use payload.name and a linked action. `AuraUINode` has service/portfolio/location/actions renderer IDs; keep those UI IDs with an explicit entity->renderer mapping (offering->service, portfolio_item->portfolio, location->location, action/contact->actions). Person/event get bounded renderer implementations before exposed as cards; text fallback must use the same projected DTO. Do not rename stored entity types to match component names.

Current public entity hooks cache full entity responses by Space/id for five minutes. Add policy/published revision invalidation and do not use that static endpoint for public_aura-only fields. Chat-card projection must be authorized within the current visitor session/disclosure context. Verify existing sessions cannot replay stale private card payloads after revocation where data has not already been disclosed; previously disclosed information cannot be retracted from a visitor.

## Coverage of supplied specification

| Supplied feature | Plan |
|---|---|
| Summary Space page; exactly three editing patterns | 00 |
| Mobile, focus, errors, unsaved changes, delete confirmations, saves, themes/motion/libraries | 00 plus each form |
| Business/creator/person/organization + capability-based Details | README,00,02,13,14 |
| Identity/name/handle/logo/subtype/presence | 02 |
| Links/socials/files/text/web learning as knowledge | 03 |
| Contact/WhatsApp/social public links | 04 |
| Branches, address privacy, service area, weekly hours | 05 |
| Services/products/offers/menu/pricing/CTA | 06 |
| Work/projects/portfolio/media | 07 |
| FAQs, prompt generation/reset/reorder | 08 |
| Human Aura tone/response length/instructions | 09 |
| Semantic appearance config/presets/owner override/real preview | 10 |
| Events/team | 11,12 |
| About/mission/topics/experience/education/writing/speaking/availability | 13 |
| Programs/membership/volunteer/donate/booking/collaboration/reservations/delivery/resources | 14 |
| Integrations | 15 |
| Inference/provenance/owner precedence/four scopes/disclosure | 01 |

## Verification and completion

Run existing UI type-check/build and focused backend validation/authorization checks for changed forms. Confirm installed dependencies before adding any package. Use separate test DB/blob/index namespaces for integration; never use a live owner to test deletion. Execute owner create/edit/read/archive for each collection, policy cross-audience negative checks, stale revision, failed upload/retry and logout cache clearance. At least one three-Space bootstrap verifies that one owner's updates cannot alter another Space or Support247 data.

Browser review at 360px, 768px and desktop, light/dark themes and reduced motion: no clipping, no keyboard traps, forms preserve drafts on failures, manager content readable, no unsupported controls shown as working. Verify actual public Link projections and chat-generated cards, not screenshots alone.

### Yullo visual acceptance gate

Reject the implementation even when it functions if it falls back to Support247 or generic SaaS styling. Before marking any form complete, verify at 360, 768, 1024 and 1440px in light and dark app themes:

- no import of Support247 UI components, CSS, layout wrappers or theme tokens;
- no repeated rounded-card grid, KPI tile, provider marketplace, glass panel, thick shadow or saturated dashboard gradient;
- managers use the documented editorial title, whitespace, ruled rows and restrained metadata;
- compact editing opens in the right sheet/fullscreen mobile shell; collections stay route-based pages; Appearance alone uses the live split preview; confirmations alone are centered modals;
- exact semantic tokens, typography scale, field dimensions, sticky actions, focus treatment and motion timings match the standalone plan;
- public Space colors remain confined to the public renderer/Appearance preview and never recolor owner controls;
- reduced motion removes translation and sequencing without hiding state changes.

Capture one light and one dark screenshot for the changed desktop shell plus one 360px screenshot. Review composition, hierarchy and overflow rather than accepting screenshots as proof of persistence. If an existing shared component cannot produce this contract without Support247 styling, create or extend the Yullo-owned primitive in `ui/src/yullo/forms/core/`; do not wrap the incompatible component with more cards.

Document real endpoint/file/migration status in each plan checkbox. Code existence is not completion; mark complete only after a save reaches the canonical store and the correct projected value appears in its intended consumer.
