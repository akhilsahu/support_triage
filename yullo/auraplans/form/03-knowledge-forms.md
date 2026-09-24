# Knowledge manager and four source inputs — UI and backend implementation plan

Date: 2026-09-22. Self-contained form plan. Shared requirements are embedded below; sibling plans are optional references. All paths/functions below are implementation targets unless marked existing.

## Placement and interaction

What Aura knows → Manage; /yullo/spaces/:spaceId/knowledge. Full manager with Add link / Upload / Paste text / Learn from web chooser; one input editor at a time.

Open **What Aura knows** as `/yullo/spaces/:spaceId/knowledge`, a dedicated manager page. Its top is editorial: Back to Space, 32–36px title, one sentence with the real source count, then a single **Add knowledge** action. Below, show Website, file, pasted text and provider sources as full-width 76–88px ruled rows: source name/type on the left, real processing state and overflow actions on the right. Do not use source cards, integration tiles or KPI counters. **Add knowledge** opens a small chooser, then exactly one right sheet for Link, Upload, Paste text or supported Learn from web input; do not put all source forms on one screen. Mobile keeps the manager as a page and each source input as a fullscreen editor. Preserve row positions during loading/status refresh and keep failed rows visible with a direct Retry/Review action.

## Fields and canonical storage

`settings` means `yullo_configs.settings`. `payload` means the selected entity's validated `payload_json`. New does not mean already accepted by current strict schemas.

| Field | UI, requirement and validation | Storage / compatibility |
|---|---|---|
| Link | Required valid public HTTPS URL; optional title <=500 | knowledge_base_items source_locator/content via UrlSourceInput |
| Upload | Required PDF/DOCX/TXT; optional title | durable blob + FileSourceInput; never duplicate file bytes in entities |
| Paste | Required title <=500 and nonempty text | TextSourceInput -> canonical item/job |
| Learn from web | Required query <=500; optional selected domains | proposed search provider job, selected results then UrlSourceInput |
| Public use policy | Required explicit choice, default private | proposed source policy metadata; inherited by chunks/facts |
| Title / grouping | Editable title, existing KB picker optional advanced | item.title, kb_id; same-Space validation |
| Status / last sync / error | Read only | ingestion lifecycle/job + last_synced_at; no fake readiness |

## API, authorization and writer functions

GET B/knowledge -> list_sources. POST B/knowledge/url|text -> accept_source. POST B/knowledge/upload -> validate stream, durable storage, accept_source(FileSourceInput); return SourceAccepted(item_id, job_id, version, queued). PATCH/DELETE B/knowledge/{id}, POST .../{id}/reprocess|replace call scoped source lifecycle services. GET B/knowledge/{id}/status returns real job status. POST B/knowledge/web/search returns server search results; POST B/knowledge/web/import accepts selected result IDs, revalidates URLs and calls accept_source. Search must be provider-gated; unavailable provider displays a truthful disabled option.

All owner routes use the embedded owner guard and revision checks. Client cannot set origin/review status/source authority. Server validates on every entry path including bootstrap and extraction. API success returns canonical saved values; field errors remain beside fields; stale revisions never silently overwrite another edit. Public responses use the embedded visibility projection, not owner DTOs.

## Files to implement or extend

- Create `ui/src/yullo/forms/knowledge/KnowledgeForms.tsx` and `schema.ts`; manager components beside them where this plan specifies collections.
- Extend `ui/src/yullo/api/spaceForms.ts` with typed hooks for the above endpoints; route via SpaceOverview registry.
- Create or extend `app/yullo/services/persistence/knowledge.py`; keep Knowledge request validation and persistence coordination together while reusing SourceService and shared ingestion. Register thin routes in `app/yullo/api/space_data.py`.
- Reuse existing services/models named above; add typed namespace handlers rather than exposing unrestricted JSON patches.
- Update public serializer, runtime reader and existing relevant UI renderer to consume the same published, policy-filtered contract.

## Compatibility and migration work

Reuse shared KB/items/jobs and storage; list/delete must stop using transitional SpaceSource. UrlSourceInput currently lacks title, so extend optional title compatibly. Source schema policy/limits still need implementation. File limit defaults 20MiB, pasted text 100,000 characters, max 10 search results and import batch <=5; expose server capabilities and enforce server-side. Sniff MIME, validate extension/content, reject archive bombs, enforce upload ownership and SSRF protection on URL plus each redirect/resolved address. Social link is not permission to scrape private content: return limited with a reason for inaccessible providers. Replacement increments version; old confirmed published content remains readable only when policy permits until new processing succeeds; deletion immediately revokes retrieval then asynchronously cleans vectors/blobs. Composite kb_facts SET NULL FKs include non-null scope columns: fix deletion behavior before enabling hard delete, otherwise archive items instead.

Preserve version1 reads when introducing version2 payloads. Conversion is deterministic and lossless where possible; unsupported old content stays owner-visible for review. Store payload version2 only after every writer/reader supports it. Never loosen `extra=forbid` merely to accept UI fields. Missing backing fields disable that control until its schema and save path ship together.

## UI, motion and libraries

Manager shows readable states Waiting/Learning/Ready/Limited/Needs attention. Actual byte progress only; indeterminate parsing is plain “Learning”. Poll only while jobs run, back off on errors, stop on unmount. Row insert 200ms; errors 160ms; no fake progress or shimmer. Destructive delete lists effects on derived details and asks confirmation.

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

Requires existing SourceService, durable blob storage and a registered worker. Implement missing adapter wiring for these inputs rather than a private demo ingestion path. Web search/social connectors are provider-gated optional methods; text input remains independently deliverable. Complete policy projection before enabling public source use.
