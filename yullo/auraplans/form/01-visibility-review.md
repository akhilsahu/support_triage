# Visibility, disclosure and inferred-detail review implementation plan

## Approved policy

| Scope | Static public Link | Public Aura | Selected Space owner Aura |
|---|---|---|---|
| public | Eligible | Eligible | Eligible |
| public_aura | Never in static DTO | Eligible subject to disclosure | Eligible |
| owner_aura | Never | Never | Authenticated owner only |
| private | Never | Never | Never in responses |

Eligibility also requires active, reviewed, valid/current source and published Space. Owner administration can read all owned values to edit them; that is not Aura disclosure. A future internal workflow needs separately explicit authorization for private values. Do not introduce an owner Aura runtime just to implement a dropdown; retain owner_aura values securely until that runtime exists.

Disclosure is orthogonal: `direct` permits normal use in eligible channels; `on_request` releases a field only after a server-approved explicit relevant visitor request; `action_only` emits an allowlisted action rather than literal value prose. Restrictive disclosure also suppresses static raw values even if visibility=public. For action_only public values show the button only. Links such as tel/mailto/WhatsApp expose their destination in the browser: label the control honestly, do not describe them as secret.

Default new sensitive values private; owner explicitly chooses a public scope. Offering draft may suggest public but Save must display selected scope. No automatic widening on owner confirmation, import or schema migration. Missing policy denies disclosure.

## UI placement and fields

VisibilityField appears inside Contact, Location, Pricing, Person, FAQ and any entity editor's collapsed “Visibility” group. Options: On my Link and in Aura / Only in public Aura / Only in my private Aura / Private. Explain each inline. Disclosure selector shown for publicly usable contact/action fields with labels Use normally / Only when asked / Show an action. Location editor also offers exact/city/hidden projection; field policies cannot be broader than the entity scope.

Review page `/yullo/spaces/:spaceId/review`: “Aura found something new”, source title + observed source version + candidate content, Ignore / Edit / Confirm. Single candidate opens its existing form in a sheet, with editable inferred fields and visible provenance. Confirmation uses explicit visibility; never defaults to broad exposure. Ignore retains audit state/rejection and stops showing that exact version. Confidence is supporting metadata, not permission or proof. Once confirmed display normal summary with optional source details.

Motion/libraries: foundation stack. Candidate removal collapses in 220ms only after server success, preserve focus to next candidate; errors 160ms; no celebration. Loading is plain progress copy. Confirm and disclosure controls are keyboard accessible; reduced motion instant.

## Persistence and migration

Extend `yullo_space_entities` with `visibility` enum-like string, `disclosure_mode`, `field_policies` JSONB validated by payload field-path allowlist. Backfill legacy is_public=true to public only where prior review/lifecycle establishes eligibility; false to private. Retain is_public temporarily for compatibility but make policy service authoritative and test every old reader. Field policies may narrow an entity scope, never elevate it. Restricted nested subfields are stripped before serialization/model context.

Reuse `kb_facts` lifecycle and provenance for scalar facts. Add equivalent visibility/disclosure policy metadata if absent; source item policies cap inherited chunk/fact/entity access. Raw document chunks can leak the same phone a field policy hides: never pass mixed/restricted source text to public retrieval until a reviewed public projection exists. Configure sources private by default and present a clear explicit public-use switch; derived restrictions trigger public index/projection invalidation and deny stale chunks immediately.

UI states map to existing canonical statuses: inferred -> extracted; owner_entered/confirmed -> owner_confirmed with origin owner/extracted distinguished. Do not create a parallel incompatible fact status enum. Keep rejected/superseded and source_authoritative policy separate.

## Backend files and functions

Create `app/yullo/services/persistence/visibility.py` inside the approved persistence package:
`project_for_audience(record, audience, request_context) -> dict | None`; audiences public_page, public_aura, owner_aura, owner_editor. `can_disclose_field(policy, audience, approved_intent) -> bool` denies by default. User-owned notes cannot weaken these checks.

Create `app/yullo/services/persistence/review.py` inside the same package: `list_review_candidates(db,user_id,space_id)`, `confirm_candidate(db,...,expected_revision,policy)`, `reject_candidate(db,...,expected_revision)`. Expose GET `B/review`, POST `B/review/{kind}/{id}/confirm|reject` through `app/yullo/api/space_data.py`; kind allowlist entity/fact/config-suggestion. Typed config suggestions live in `yullo_configs.settings.suggestions` with ID, proposed field/value, source item/version, status and fingerprint; cap at 100 pending per Space. Model calls outside write transactions; lock/recheck evidence in commit transaction. Never overwrite owner-confirmed values on extraction refresh.

Apply projection to public API, runtime tool resolution, retrieval, generated cards, preview, Home and caches. For on_request use an allowlisted server disclosure intent and conservative fallback to asking clarification. Do not send withheld value to the LLM and rely on a prompt. On-request rich cards use session-bound authorization and field projection; public static entity GET must not bypass it. Cache keys include audience and policy/context version; revocation invalidates current access.

## Steps and acceptance

- [ ] Add forward policy migrations, preserve old values, never backfill owner_aura to public.
- [ ] Implement shared deny-by-default projection and reference it from every output path before adding UI controls.
- [ ] Add review endpoint and UI using existing entity forms, source version validation and concurrency checks.
- [ ] Prove with phone/address examples: hidden static values absent from JSON, public_aura visible only in authorized chat, private/owner_aura never reach public prompt/vector context/cards; stale evidence cannot be confirmed.
