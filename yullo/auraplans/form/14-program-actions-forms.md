## Approved third slice — public booking buttons (2026-10-19)

Public Space GET now returns `bookingLinks` from its already-loaded same-Space eligible entities. Static-page projection additionally requires public (or legacy null) visibility, active/public approved booking actions, unrestricted label/kind/destination fields, and a safe HTTPS destination. Public-Aura-only/private/on-request fields do not become static booking buttons. No extra request, LLM call, database migration or scheduling integration.

PublicSpace's optional bookingLinks property feeds IdentityBlock: theme-aware, wrapping, >=48px links beneath the introduction; real stored destinations open in a new tab. No example bookings. Appearance generation and chat rendering were not changed.

Files: app/yullo/api/public.py; ui/src/yullo/services/aura/types.ts; ui/src/yullo/screens/public/components/IdentityBlock.tsx; focused backend/frontend tests.

Verification: 13 booking backend tests, 11 frontend tests, TypeScript and focused lint pass. Existing test_public_chat_stream.py fails because its direct stream_aura_chat call omits required raw_request; unchanged/out of scope. Live browser/mobile visual and real persistence end-to-end testing remain pending. Existing Home suggestion resolver route remains outside this slice.

---

## Approved second slice — Space booking management (2026-10-19)

Implemented a permanent Booking row in `SpaceDashboard.tsx`. Expanding it loads the existing entity API lazily through `forms/BookingLinks.tsx`. Approved, active booking actions show their label, destination host/Open link, visitor access state and Edit. Extracted suggestions link back to the existing knowledge review flow; they are not automatically approved. No new directories, routes, endpoints or database changes.

`forms/BookingForm.tsx` now accepts an existing entity. Editing merges the original payload, preserving organization/purpose/relationship, and sends the saved revision to the canonical PATCH endpoint. Visitor enable/disable is saved through that same editor. Revision conflicts retain edits and instruct closing/reopening to inspect fresh data. Home create behavior remains unchanged.

Verification: all nine focused booking tests passed, including prior create/retry/validation tests, editing with preserved context and revision, conflict handling, and lazy Space listing/review separation. TypeScript and booking-file lint passed. Live browser/mobile visual checks and real backend writes remain unverified. Appearance/public-page rendering and Home action-resolver routes were not changed and remain pending separate approval.

---

## Approved first slice — implementation status (2026-10-19)

Implemented only the Home selected-Space **Add booking option** button and its responsive editor: label, HTTPS URL, visitor enable toggle (off initially), Save/Cancel, error recovery and unsaved-close confirmation. The existing owner entity POST stores an `action` with `kind=booking`; no backend/schema changes. A stable per-editor identity key supports retry without duplicate creation of the same payload. Existing entity and Home query caches refresh after save.

Files: `ui/src/yullo/forms/BookingForm.tsx`, its colocated test, `ui/src/yullo/screens/YulloHome.tsx`, and the optional `identity_key` API command type in `ui/src/yullo/api/entities.ts`.

This approved slice opens directly from Home, rather than adding a route or new directories. Remaining route/resolver, permanent Space entry, editing existing links, public landing integration and other broader work below require the user's next approval.

Verification: six component tests passed (invalid URLs, private default, explicit enablement, failed-save retry preserving input/identity, unsaved-close protection); frontend TypeScript passed; new component/test lint passed. Live browser, mobile visual review and real backend persistence were not exercised. No user data was created during tests. Existing unrelated changes preserved.

---

# Programs, collaboration and participation actions — UI and backend implementation plan

Date: 2026-09-22. Self-contained form plan. Shared requirements are embedded below; sibling plans are optional references. All paths/functions below are implementation targets unless marked existing.


## Booking-link implementation slice — 2026-10-19

Status: PLAN ONLY. This slice takes precedence over the broader future-program targets below for booking. Implement only external booking links. No scheduling engine, calendar availability, payments, LLM generation, new database table, migration, duplicate persistence service or enum extension is required. Follow repository AGENTS.md; preserve current knowledge, ingestion, appearance and entity flows. Do not change production records or commit/deploy as part of implementation.

**Goal:** An owner can add/edit/enable a booking link from Home or the Space page; visitors can open the enabled link on the public page or through Aura.
**Architecture:** Reuse existing action entities (kind=booking), owner entity routes/services, revision/identity checks and public visibility projection. Keep URLs canonical in the saved entity; preview text or an LLM must never supply the booking destination.
**Stack:** Existing React Hook Form, Zod, Yullo field controls and Motion for React. Reuse the current sheet/accessibility primitives; do not introduce a second visual library.
**Approved scope reference:** Chat request: implement Add a booking option as an external scheduling/reservation link; user subsequently requested this plan before code changes.

### 1. Owner entry points and editor

- [ ] Wire the currently inert Add booking option button in ui/src/yullo/screens/YulloHome.tsx. Fix add_booking_action in ui/src/yullo/home/actionResolver.ts; it currently points at the nonexistent /manage/:id/actions/new route. Trace the Home response-to-view adapter too, so API-driven suggestion actionHref reaches the same real route.
- [ ] Add an authenticated child route at /yullo/spaces/:spaceId/booking in ui/src/App.tsx, following the existing SpaceDashboard/Outlet editor pattern. Add a Booking row in ui/src/yullo/screens/SpaceDashboard.tsx so links remain manageable after the Home suggestion disappears.
- [ ] Proposed new files, to be created only during implementation: ui/src/yullo/forms/booking/BookingForm.tsx, ui/src/yullo/forms/booking/schema.ts and ui/src/yullo/screens/booking/BookingFormScreen.tsx. These are feature UI files, not backend form services. Search again before creating; extend equivalent existing files if another implementation has appeared.
- [ ] Show saved booking links as compact ruled rows with label, visible destination host, Enabled/Hidden state and Edit. Reuse listEntities and filter entity_type=action, payload_json.kind=booking. Imported bookings use the same editor; retain existing context fields and provenance.

Fields: button label (required, trimmed, 1–200 characters; editable initial suggestion Book a call); booking URL (required HTTPS); Enable for visitors (explicit owner control, initially off for a new link, persisted as is_public). Explain: Enabled links appear on the public page and may be offered by public Aura. No provider dropdown, iframe, customer details or appointment fields. Show destination host and Open booking page for checking the entered URL. Never fetch or scrape this URL on Save.

Editor: wide sheet approximately 720–800px on desktop, constrained to available width; fullscreen below 720px. Preserve the Yullo header/theme access. Use theme tokens for canvas/surface/border/text/focus/accent; Satoshi title and Instrument Sans fields. Controls >=52px, input text >=16px, accessible labels/errors, keyboard focus trapping/restoration, sticky safe-area-aware Save/Cancel. Restrained 160–220ms reveal and validation transitions; respect reduced motion. No admin cards or Support247 styling. Keep invalid values visible and handle unsaved-close confirmation.

### 2. Canonical persistence and authorization

- [ ] Reuse POST /api/v1/yullo/spaces/{spaceId}/entities with entity_type=action, schema_version=1, identity_key=<stable UUID per new draft>, payload_json={label,kind:booking,destination_url}, is_public=<visitor toggle>. Current backend EntityCommand supports identity_key/schema_version, but ui/src/yullo/api/entities.ts must expose these optional properties. Reuse useCreateEntity in entityQueries.ts rather than a parallel API.
- [ ] Editing uses PATCH on the existing entity ID with expected_revision; merge the original payload before modifying label/destination so organization/purpose/relationship and other valid context are preserved. Changing URL must not fabricate new source evidence. Retain the existing owner-edit semantics.
- [ ] Enable/hide uses the existing owner update/confirm flow with explicit visibility and revision. Do not use rejection to mean hidden. Use existing archive only if removal is exposed; require confirmation.
- [ ] Reuse app/yullo/services/entities/service.py:create_owner_entity/update_entity and app/yullo/services/entities/payloads.py:ActionPayload. Verify same-owner/product/Space checks, HTTPS validation, public projection, context-version bump and existing domain events. Do not create app/yullo/forms or a new persistence repository.
- [ ] Validate URL structure on both client and backend; reject credentials, javascript/data schemes and unsupported destinations. Keep provider support generic (Calendly, Cal.com, reservations or an owner's HTTPS booking page), not domain-allowlisted. Do not infer ownership from the entered domain. A Save retry uses the same draft identity_key; a later changed payload is an explicit edit, not another create. Show 403, 409 and 422 errors clearly without discarding input.

### 3. Public page, Aura and Home refresh

- [ ] Reuse the existing public entity projection and ActionsCard. Approved/public active booking entities should be included in the verified Aura manifest, letting the existing generative-UI tool emit an actions card. No special new LLM call or promise that every chat answer contains a booking button.
- [ ] Ensure a real Book button appears on the public landing page independent of chat. Inspect ui/src/yullo/screens/public/components/AuraIntro.tsx and PublicSpaceExperience.tsx; existing featured preview content is descriptive and does not guarantee an actionable link. Render from the policy-filtered saved action entity using existing public entity readers/ActionsCard; avoid duplicate booking buttons across featured/primary areas. Resolve sourceEntityId to an eligible entity rather than accepting an LLM-supplied URL. Keep mock preview fixtures out of the real booking flow.
- [ ] External navigation requires a deliberate click; show host, use target=_blank and rel=noopener noreferrer, and preserve keyboard/touch behavior. Hidden, rejected, archived or other-Space actions must never appear publicly or in Aura tools.
- [ ] After Save invalidate the existing Space entity, Home and relevant public/appearance queries using their actual keys. Audit app/yullo/services/home/repository.py booking capability detection: enabling a valid booking action suppresses the repeated-booking suggestion; hiding/removing it permits the suggestion when demand rules qualify. Do not mutate appearance layouts or silently regenerate content.

### 4. Acceptance and verification

- [ ] Home button and API-driven suggestion open the correct Space editor; Space Booking row works independently.
- [ ] Save a booking link through the real owner API in an isolated test environment; reload and edit preserve values. Duplicate Save/retry does not create duplicate records.
- [ ] Public enabled booking works via direct page navigation and the existing Aura actions renderer; disabling removes public/Aura access. Private Spaces remain private.
- [ ] Test invalid URLs, unrelated-owner/Space access, stale revisions, hidden actions, and imported-booking edits preserving context/evidence.
- [ ] Verify mobile 375px, tablet and desktop layouts, keyboard/focus behavior and reduced motion. Run focused frontend tests, TypeScript, lint and existing entity/public-visibility/backend tests. Live browser tests depend on localhost access; do not claim them if blocked.
- [ ] Update this slice with actual changed files, tests and any remaining integration gaps. No application code has been changed while preparing this plan.

---

## Placement and interaction

Details → Programs manager; Contact/Services/Organization → Actions (booking, enquiry, membership, volunteer, donate, order).

Open **Programs** at `/yullo/spaces/:spaceId/programs` and expose contextual Actions from the relevant Contact/Offering/Organization manager. Programs use wide ruled rows with name, concise description, date/location metadata and one action. Participation actions use compact text rows; do not create donation, booking or membership product cards in the owner editor. Add/Edit opens a right sheet for one program or action. The action sheet shows Label and Destination first, then optional related entity and visibility. Mobile uses fullscreen editing. External destinations show their host plainly before Save and before visitor navigation.

## Fields and canonical storage

`settings` means `yullo_configs.settings`. `payload` means the selected entity's validated `payload_json`. New does not mean already accepted by current strict schemas.

| Field | UI, requirement and validation | Storage / compatibility |
|---|---|---|
| Program name/description | Required name<=200, optional description<=4000 | offering kind=program; v2 extension |
| Program dates/location | Optional date range/same-Space location IDs | offering payload.program metadata |
| Action label | Required <=200 | action.payload.label existing |
| Action kind | booking/enquiry/external_link/membership/volunteer/donate/order/collaboration/reservation/delivery | extend action.kind enum |
| Destination | Required validated HTTPS URL | action.destination_url existing |
| Related entity | Optional same-Space offering/portfolio/location reference | action.related_entity_id new |
| Visibility/disclosure/order | Explicit policy | entity policy/order |

## API, authorization and writer functions

Common CRUD over offering(kind=program) and action. No eighth entity type needed. Add optional program kind to OfferingForm schema registry without changing service/product behavior. Action dispatcher is allowlisted; only external navigation in v1. Show host before navigation where meaningful; no payment collection, membership enrollment, calendar availability promise or form submission by LLM. Membership/donate/volunteer links use same action editor with label presets.

All owner routes use the embedded owner guard and revision checks. Client cannot set origin/review status/source authority. Server validates on every entry path including bootstrap and extraction. API success returns canonical saved values; field errors remain beside fields; stale revisions never silently overwrite another edit. Public responses use the embedded visibility projection, not owner DTOs.

## Files to implement or extend

- Create `ui/src/yullo/forms/program_actions/ProgramActionForms.tsx` and `schema.ts`; manager components beside them where this plan specifies collections.
- Extend `ui/src/yullo/api/spaceForms.ts` with typed hooks for the above endpoints; route via SpaceOverview registry.
- Extend `app/yullo/services/persistence/entities.py`; keep program/action payload validation with entity persistence. Register thin routes in `app/yullo/api/space_data.py`.
- Extend existing entities/payloads.py and entities/service.py; use owner entities router as specified in this file. Do not introduce another entity repository.
- Update public serializer, runtime reader and existing relevant UI renderer to consume the same published, policy-filtered contract.

## Compatibility and migration work

Current action schema accepts booking/enquiry/external_link only; enum extension and renderer dispatch required. Programs/collaboration/membership capability keys absent from initial registry must be added explicitly. Resources in organization overview are curated links or knowledge items with authorized public projection, not revival of yullo_resources table. Offers use offering kind=offer; do not duplicate program entities across groups.

Preserve version1 reads when introducing version2 payloads. Conversion is deterministic and lossless where possible; unsupported old content stays owner-visible for review. Store payload version2 only after every writer/reader supports it. Never loosen `extra=forbid` merely to accept UI fields. Missing backing fields disable that control until its schema and save path ship together.

## UI, motion and libraries

Action editor shows Label + Destination first, context selector optional. Program list uses editorial name/summary, no enterprise workflow builder. Confirm deletion if referenced by active offerings; detach/reassign explicitly in same transaction. No decorative donation/payment widgets.

Use React Hook Form + Zod, Yullo-owned fields, TanStack Query, Radix primitives and `motion/react` as specified in this file; semantic theme tokens and 52–56px controls. Blur validation and Save revalidation. Save progress follows actual server response. Reduced motion disables movement. No Support247 UI component reuse.

## Data flow and implementation steps

- [ ] Add field schemas and explicit storage mapping above; add only required forward migrations from compatibility section.
- [ ] Implement/readapt named backend functions with ownership, same-Space references, concurrency, policy and canonical save DTO.
- [ ] Implement GET loading and one create/edit form, progressive optional groups, dirty tracking and visible field errors.
- [ ] Wire Save to the exact endpoint; commit data and approved event atomically; run canonical context/publication finalizer and invalidate affected owner/public/Home caches.
- [ ] Wire list/update/archive/reorder only where specified. Check references before archive; retain evidence/audit information, schedule unused blob cleanup after commit.
- [ ] Integrate Aura suggestions as private review candidates; owner acceptance uses the same save function. Suggestions cannot override owner-authored values.
- [ ] Update bootstrap input adapter to call the same service where this form is supported; do not insert form data directly into DB to demonstrate success.

## Acceptance checks

Save -> reload -> reopen must return identical normalized fields. Exercise create/edit with two Spaces and a foreign owner denial; rejected writes leave no partial public changes. Check required/conditional fields and removed values, policy projection in page and chat, keyboard/mobile/reduced motion, retry behavior and one stale revision. Verify public rendering only after canonical publication, with no synthetic timestamps or guessed content. Collections preserve order; empty optional forms do not block launch.

## Standalone session contract — revision 2026-09-22.2

This file contains the requirements needed to implement this form without conversation history or reading sibling plans. Sibling links are optional background. Inspect the repository files named here; existing-code compatibility cannot be established from a document alone. This is a form-scoped task, not authorization to implement all Space forms.

### Start here

1. Read applicable AGENTS.md, inspect git status and this form's existing UI/schema/API/service files. Preserve unrelated and uncommitted work. Paths below are relative to repository root `/Users/aks/Projects/support247_bobathon`.
2. Check existing shared form components, policy functions, router registration, database revision and installed package versions. Proposed interfaces may already have been implemented by another session; extend their current contracts compatibly rather than replacing them.
3. Report a short gap list for this form, then implement the smallest complete create/edit/read slice. Build only its required shared primitives. No need to read or execute the whole plan directory.
4. Resolve dependency gaps using the local dependency instructions below. Ask only for a genuine product conflict or a destructive choice; do not invent provider availability, schema fields or approvals.

### Product and entry context

Home -> Your Spaces -> Open Space -> `/yullo/spaces/:spaceId`. The owner overview has Identity, What Aura knows, Details, Aura and Appearance summary rows. Edit opens a focused editor; Manage opens a collection. Keep Home and public chat design intact. Wrap owner routes in existing `YulloPrivateRoute` and derive session through existing Yullo API client. If the overview is absent, add this form's smallest working overview entry using the shared route; do not rebuild unrelated sections.

Types are business/creator/person/organization; capability registry controls modules without creating four products. Owner can add supported modules. Only type/name/valid handle block launch; knowledge readiness is separate. A source-empty public Space cannot claim Aura is trained. There is one isolated Aura per Space; no cross-Space delegation. Backend shared infrastructure may be reused; frontend components must stay under `ui/src/yullo/`, never import Support247 UI.

### Exact visual and interaction contract

Use the installed React Hook Form + Zod/resolvers for local form state and validation, TanStack Query for server state, Radix Dialog for sheets/confirmations, Radix Popover/Select only where appropriate, and `motion/react` for restrained transitions. Reuse installed dropzone, date-fns and Lucide where this form needs them. Optional cmdk is limited to genuinely searchable pickers. A Popover alone is not a combobox: provide listbox semantics and complete keyboard behavior. Do not add or use MUI, Ant Design, Chakra, a second broad primitive system, Support247 components, Support247 CSS, or Support247 layout wrappers.

Shared components live in `ui/src/yullo/forms/core/`; form state is local and saved state is server-authoritative. Extend the existing Yullo theme provider under `ui/src/yullo/theme/`; do not create a competing provider. Owner editors always use the app theme (`light|dark|system`). A public Space presentation theme is allowed only inside an isolated preview subtree and must never recolor the editor shell.

Exact owner-app tokens:
- Light: canvas `#F6F7F8`, surface `#FFFFFF`, surfaceRaised `#FCFCFD`, surfaceSoft `#EEF1F4`, text `#151B27`, textMuted `#667085`, border `rgba(21,27,39,.12)`, borderHover `rgba(21,27,39,.24)`, focus `#4EA6CF`, focusSoft `rgba(78,166,207,.18)`, accent `#E4CC32`, danger `#C94343`.
- Dark: canvas `#11151C`, surface `#171C24`, surfaceRaised `#1D232C`, surfaceSoft `#202731`, text `#F5F7FA`, textMuted `#A7B0BD`, border `rgba(245,247,250,.12)`, borderHover `rgba(245,247,250,.24)`, focus `#73CBE8`, focusSoft `rgba(115,203,232,.18)`, accent `#E8D84E`, danger `#FF8585`.
Map these through semantic CSS variables; do not hardcode them in individual components. Yellow is a small identity/accent/status mark, never body text on white and never the default large button fill. Primary action is text-colored in light mode with white label and the inverse in dark mode; secondary actions are quiet/transparent; destructive actions use danger only.

The visual language is editorial, calm and spacious. It must not resemble Support247, a generic admin dashboard, or a SaaS card grid. Prohibited defaults: boxed card per section, icon tile beside every heading, dashboard KPI cards, thick shadows, glass panels, saturated gradients, pill badges for ordinary metadata, floating rounded containers around every row, and copied Support247 spacing/colors. Use the app canvas as the page background, typography and whitespace for hierarchy, thin full-width rules between major bands, and raised surfaces only where interaction or preview containment needs one. Manager collections are borderless groups of 72–88px rows with a single bottom rule, clear primary text, restrained metadata and a right-aligned action; do not wrap every row in a card.

Use Satoshi for display headings and Instrument Sans for body where already loaded. Page titles are 32–36px/1.1, sheet titles 24px/1.2, section titles 12–13px uppercase with .08em tracking, body and input text 16px, helper/error text 14px. Labels remain visible above inputs; never use floating labels. A field is full width, at least 52px high (56px for touch-heavy controls), padding 14px 16px, radius 12px, surface background and 1px border. Hover changes only border color. Focus uses the cool focus border plus a 4px focusSoft ring. Textarea minimum height is 120px. Keep 12px label-to-control spacing, 8px control-to-helper spacing, 20px between related fields, 32px between groups and 48px between major sections. Untouched fields remain neutral; errors appear beside the field without shaking or shifting the whole page.

Desktop Quick Editor (>=768px) is a right sheet: `width:clamp(420px,38vw,560px)`, maximum `calc(100vw - 32px)`, surface background, 1px left border, no decorative gradient, and a light-mode backdrop equivalent to `rgba(11,18,32,.08)`. Keep the Space overview visible below it. Structure it as fixed header, independently scrolling body and sticky action footer. Below 768px it becomes a full-viewport editor with 16px minimum input font, Back/title header, one Save action, safe-area padding and a sticky footer. Dedicated managers remain pages: max-width 1100px, margin auto, padding `32px 24px 80px`; use `16px` horizontal padding below 768px. At 768–1199px collapse secondary columns before reducing field widths. Appearance uses a split editor at >=1024px and stacked controls/preview below; phones use Edit/Preview tabs only if the stacked preview becomes too tall. Confirmations alone use centered dialogs, max-width 420px. Review at 360, 768, 1024 and 1440px.

Motion tokens are fast140/base220/sheet260ms with easing `[0.22,1,0.36,1]`. Sheet entry is opacity0/x20 to opacity1/x0 in220ms; exit x12/opacity0 in180ms. Page content enters opacity0/y4 to opacity1/y0 in180–220ms. Errors enter opacity0/y-4 in160ms. Optional fields reveal height0-to-auto/y-4-to0 in220ms; new rows enter opacity0/y6 in200ms. Status changes crossfade in140–180ms; Appearance preview theme changes crossfade180ms. Convert milliseconds to seconds for Motion APIs. Reduced motion removes translation, height animation, sequencing and travelling effects while preserving immediate state changes. No bounce, shake, shimmer, overshoot, perpetual pulse, glow or dramatic full-page slide.

Validate touched fields on blur and the complete form on Save. Keep drafts on request failure/refetch. Dirty close asks Keep editing/Discard; untouched close does not. Trap and restore sheet/modal focus, lock background scroll, support Escape through the dirty check, connect errors with aria-describedby, announce save/error politely and focus the first invalid field after Save. Reorder has Move up/down buttons even when drag is offered. A successful sheet shows Saved for300ms, then closes and restores trigger focus; persistent manager/Aura/Appearance pages stay open and update their saved state. Aura-suggested values lose the AI badge once accepted, while optional provenance remains available.

### API and database contract

`B` means `/api/v1/yullo/owner/spaces/{space_id}`. Every endpoint derives owner from authenticated session, checks product=yullo and owned Yullo extension, and validates all referenced records in the same Space. Enforce existing cookie/CSRF/origin protections. Never trust user_id/review authority in the body. Errors: unavailable owned resource404, validation422, stale revision409, oversized upload413, rate limit429; DTO error shape `{code,message,field_errors,current_revision}`.

Entity CRUD: GET/POST `B/entities`; GET/PATCH/DELETE `B/entities/{id}`; POST `B/entities/reorder`; POST `B/entities/{id}/confirm`. Filter by allowlisted entity_type/kind, cursor and limit<=100. Use `app/yullo/services/persistence/entities.py` as the canonical validation and persistence interface. It may call the existing `app/yullo/services/entities/service.py` internally during migration, but routes, bootstrap code and new form work must import the persistence entry points. Move or adapt create_owner_entity/update_entity/confirm_entity/archive_entity there and add list_owner_entities/get_owner_entity/reorder_entities without duplicating rules. Identity is UUID primary ID plus immutable identity_key String(200), unique(space_id,entity_type,identity_key). Generate client create key once and reuse retries. Same identity/same normalized command returns prior object; conflicting payload requires explicit update.

Entity DTO: id,space_id,identity_key,entity_type,schema_version,payload_json,visibility,disclosure_mode,field_policies,revision,sort_order,updated_at. These are target fields, not proof they all exist. Add missing migrations safely. PATCH includes expected_revision; merge specified fields, validate complete result; null clears optional, arrays replace. DELETE archives under revision check. Reorder checks complete collection IDs and collection revision atomically. Config endpoints guard `yullo_configs.revision` and update only their typed namespace using a fresh JSON dict. Existing schema versions remain readable; extended payloads use version2 only after consumers understand it. Never disable extra=forbid.

Caller owns transaction. Save canonical record and registered event using append_domain_event atomically. Implement `finalize_space_mutation(db,user_id,space_id,public_content_changed,operation_key)` in `app/yullo/services/persistence/common.py`; it locks YulloSpace, advances context_version, and publishes only reviewed authorized changes for already-live Spaces. Drafts remain draft; private changes do not become public. Invalidate affected owner/Space queries, preview/public/Home/runtime after commit. Query keys include owner+Space; clear on logout. Do not optimistically expose public sensitive data.

### Visibility, provenance and output rules

Scopes: public=static Link+public Aura; public_aura=public chat only; owner_aura=authenticated selected-Space owner Aura only; private=no Aura responses. Owner editor can read all owned data. If owner Aura is absent, owner_aura stays stored and unavailable to inference. Disclosure: direct=eligible normal use; on_request=server-approved explicit relevant request; action_only=allowlisted action instead of raw prose. Restrictive disclosure suppresses raw static values too. Action URLs can expose their target; do not promise secrecy for mailto/tel/WhatsApp.

Persist missing entity visibility/disclosure/field_policies columns through forward migration; is_public alone is insufficient. Field policies narrow, never widen record policy. Sensitive input defaults private; public choice explicit. Owner confirmed fields cannot be overwritten by inferred updates. Extracted candidates are private/extracted with source item+KB+version+verified locator evidence; confidence is not authority. Recheck source/version on confirmation. Eligible public records must be active, reviewed and in a published Space. Public DTOs/tools/cards and retrieval must project approved fields BEFORE giving them to the model/browser. Mixed restricted source chunks cannot enter public context; invalidate stale projections after policy changes. Never implement privacy by CSS.

Existing evidence columns: entity_id,space_id,source_item_id,source_kb_id,source_version,locator_metadata. General facts remain kb_facts; KB groups/items/jobs store source material. Reuse existing storage; no per-form tables unless this file identifies a concrete missing requirement. Appearance canonical store is yullo_spaces.appearance_config; settings means yullo_configs.settings. No shared evaluation deletion is needed.

### Session boundaries and handoff

Own only this form's frontend folder, its approved persistence module, and small additive integration changes. Backend validation and persistence belong only in `app/yullo/services/persistence/`; thin authenticated routes belong in `app/yullo/api/space_data.py`. Do not create `services/forms/`, `schemas/forms/`, repository packages, or any additional backend directory without owner approval. Shared hotspots: form core/registry, API hooks, entity payload registry, public serializer, router registration and migrations. Check changes before editing; never overwrite whole shared files. If sessions run concurrently, use isolated branches and coordinate shared contracts/migrations; a self-contained document does not make shared-file writes conflict-free. Sequential small sessions are simplest.

At completion update the checkboxes/status in THIS file with date, actual files/endpoints, migration revision (and whether applied), checks run, remaining gaps and dependency features left unavailable. Report supported field types/schema version and public behavior. A later session should be able to continue from this file plus current code, without this chat. Do not mark mocked/provider-disabled functionality complete.


### Dependencies for this particular form

Reuse offering/action service with v2 program kind and bounded action enum. Program editor can stand alone without services manager. Same-Space location/portfolio links optional. Participation actions are external URLs; no payments/membership engine is assumed.
