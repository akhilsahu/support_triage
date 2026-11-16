# Identity and Yullo handle — UI and backend implementation plan

Date: 2026-09-22. Self-contained form plan. Shared requirements are embedded below; sibling plans are optional references. All paths/functions below are implementation targets unless marked existing.

## Placement and interaction

Identity → Edit; /yullo/spaces/:spaceId?edit=identity. Quick Editor; handle release/change uses a separate confirmation.

Use one create/edit component. Clicking **Edit identity** updates the URL to `/yullo/spaces/:spaceId?edit=identity` and opens a right sheet; closing restores the overview URL and trigger focus. The desktop sheet shows a 72px header (“Edit identity” + quiet close), a scrolling single column, then sticky Cancel/Save. Handle release/change uses its own focused confirmation after validation, never another complete form. Mobile uses the same field order in a fullscreen editor with Back and one bottom Save. Loading renders field-shaped neutral skeletons; errors stay inline; Cancel resets the local draft; dirty close asks Keep editing / Discard.

### Progressive form structure

Do not remove onboarding fields to make the form smaller. Preserve every saved onboarding value and keep it editable in the canonical editor. Reduce initial cognitive load through hierarchy and disclosure:

1. **Essentials — always visible:** Display name; current Yullo address as a read-only row with `Change →`; Space purpose as business/creator/person/organization segmented options.
2. **Introduction — always visible:** Short description. If onboarding did not collect it, show a grounded Aura-generated draft only when source/onboarding evidence is sufficient. Mark it `Suggested by Aura` until the owner edits or saves it; never publish the suggestion before Save.
3. **More identity details — collapsible:** Subtype/category, presence, website and logo/photo. When collapsed, show a compact saved summary such as `Design studio · Online + physical · Logo added` or `Nothing added yet`, so fields never become invisible in meaning. If an existing value needs attention, expand the section and focus that field. Do not show empty optional controls by default.
4. **Sticky actions:** Cancel and Save changes remain after the complete form. Saving persists both visible and disclosed fields; collapsing a section never clears it.

Changing Space purpose may change labels or recommended options but must not erase subtype, presence, website, logo, description or any other onboarding value. Unsupported legacy values remain visible with a clear review state until the owner replaces them. If logo upload is unavailable, show the existing logo read-only and omit the unfinished uploader rather than presenting an implementation message.

## Fields and canonical storage

`settings` means `yullo_configs.settings`. `payload` means the selected entity's validated `payload_json`. New does not mean already accepted by current strict schemas.

| Field | UI, requirement and validation | Storage / compatibility |
|---|---|---|
| Space type | Required segmented business/creator/person/organization | yullo_spaces.purpose; existing column, new enum validation |
| Display name | Required text 1–200 | spaces.display_name; existing |
| Handle | Required lowercase 3–50; debounce availability 400ms | spaces.slug; existing, scoped product uniqueness |
| Logo/photo | Optional image picker, clear button | spaces.logo_url; existing URL, upload service integration required |
| Short description | Optional textarea <=280; inferred suggestion separate | settings.identity.description; proposed typed JSON namespace |
| Category/subtype | Optional editable suggestion <=100 | settings.identity.subtype; new schema |
| Presence | Optional online/physical/both/mobile | settings.identity.presence; new schema |
| Website | Optional HTTPS | contact_channel website entity; reference ID in identity DTO, avoid duplicate truth |

## API, authorization and writer functions

GET/PATCH B/identity -> get_identity / update_identity. POST B/handle/check -> check_handle; POST B/handle/change -> change_handle(expected_revision, handle). Reuse existing handles.py after auditing validation and reservation ownership. GET availability is advisory; enforce uniqueness in the write transaction. Atomic identity update spans Space/YulloSpace/YulloConfig with expected_revision. Release/change requires explicit explanation that old links may stop working; do not automatically reassign another owner's slug.

All owner routes use the embedded owner guard and revision checks. Client cannot set origin/review status/source authority. Server validates on every entry path including bootstrap and extraction. API success returns canonical saved values; field errors remain beside fields; stale revisions never silently overwrite another edit. Public responses use the embedded visibility projection, not owner DTOs.

## Files to implement or extend

- Create `ui/src/yullo/forms/identity/IdentityForm.tsx` and `schema.ts`; manager components beside them where this plan specifies collections.
- Extend `ui/src/yullo/api/spaceForms.ts` with typed hooks for the above endpoints; route via SpaceOverview registry.
- Create or extend `app/yullo/services/persistence/identity.py`; keep Identity Pydantic validation and persistence operations together. Reuse shared guards/contracts from the same package.
- Register thin routes in `app/yullo/api/space_data.py`. Migrate imports from existing `services/forms/identity.py` and `schemas/forms/identity.py`, then remove those obsolete modules after focused checks pass.
- Update public serializer, runtime reader and existing relevant UI renderer to consume the same published, policy-filtered contract.

## Compatibility and migration work

Current purpose comments include personal/work; map personal -> person, preserve ambiguous work as legacy until owner selects business/creator/person/organization. Do not silently classify work as business. Description/category/presence have no dedicated fields today; JSON schema/readers must be added. `Space.email` is legacy authentication and MUST NOT store public contact email. Space logo upload returns an authorized asset URL; reject executable SVG unless a proven sanitizer exists. Invalidate old and new public handles on rename.

Preserve version1 reads when introducing version2 payloads. Conversion is deterministic and lossless where possible; unsupported old content stays owner-visible for review. Store payload version2 only after every writer/reader supports it. Never loosen `extra=forbid` merely to accept UI fields. Missing backing fields disable that control until its schema and save path ship together.

## UI, motion and libraries

Name and handle alone stay above the fold; optional Details disclosure opens description/category/presence. Logo preview crossfades 140ms; availability status changes without layout jump. Never auto-save handle changes.

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

Website input depends on contact_channel creation. If contact editor is absent, implement only the existing website channel via the shared entity service; the full contact manager is not required. Logo needs verified upload infrastructure; keep existing logo unchanged if provider unavailable and report that gap. Existing handle service must enforce namespace/reservations; never inline a weaker check.


## 2026-11-16 — Three-step Space onboarding

- [x] Replace the crowded New Space page with one question per step: Created for → contextual name + editable link → optional links/files/text. Back retains current inputs. Purpose selection is explicit; creation is available with no sources.
- [x] Preserve source ingestion, extraction, review, source enable/remove controls and knowledge preview. Optional About/category editing and explicit grounded generation remain behind a disclosure on step 3. Creation no longer runs generation implicitly.
- [x] Use configured app/accent tokens, native keyboard radio selection, labelled inputs, accessible source dialogs, 180 ms step entry and reduced-motion support. Display actual request/source state rather than simulated progress/ETA.
- [x] Fix shared publication readiness: valid identity and canonical setup required; empty, queued, processing, review-pending or failed knowledge does not block identity publication. Owner/product checks and source approval/indexing rules remain in force. Legacy personal/work purpose aliases remain accepted.
- [x] Launch accepts optional explicit `space_id`, scopes it to the current Yullo owner, and returns that same Space on retries. The wizard supplies its draft ID. Handle reservation now validates format/reserved names server-side; draft About/category writes use existing identity settings.
- Files: `ui/src/yullo/screens/NewSpaceScreen.tsx`, `ui/src/yullo/api/onboarding.ts`, `app/api/v1/yullo_onboarding.py`, `app/schemas/yullo_onboarding.py`, `app/yullo/services/spaces/publication.py`. Existing publication success fixture supplies required name/purpose; no new tests or migrations.
- Verification: UI TypeScript check passed. Production frontend build, changed Python syntax, service/schema/router imports and diff whitespace checks passed. Build reports existing bundle/dependency warnings. Import check uses DEBUG=false because the shell supplies a nonboolean DEBUG=release. User requested skipping tests; browser/end-to-end ingestion/publication remains unverified. No production writes, commit, push or deployment for this change.


### Onboarding routing clarification, 2026-11-16

Incomplete accounts must complete the three-step wizard before private Home/account/Space pages. `/yullo/onboarding` reuses NewSpaceScreen, resumes the owned draft/identity/sources and starts on step 1 after account reset. Launch marks local account completion before leaving the wizard. Completed owners can still explicitly create additional Spaces via `/yullo/spaces/new`. See the Home completion plan's mandatory-onboarding note for changed files and verification. Earlier Home-first sign-in notes are superseded.


### 2026-11-16 — Onboarding wording and floating network

- First question is now “What would you like to do?” with the agreed introduction/work/business/community supporting line.
- Reuses the landing page's `YulloCanvasNetwork` behind the three-step flow, masked away from the central form with lower opacity on mobile. Canvas is decorative, cannot capture input, already honors reduced motion and pauses when hidden. Shared landing component is unchanged; ingestion and navigation remain intact.
- File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. TypeScript and diff whitespace checks passed. Tests remain skipped by request; browser visual review not performed. No commit, push or deployment.


### 2026-11-16 — Snapchat-yellow onboarding palette

- User requested Snapchat yellow with black borders. NewSpaceScreen now scopes #FFFC00 page/surface/action tokens and black text/control borders to the onboarding/create flow. Black progress and focus indicators remain visible on yellow; selected purpose has a heavier black outline and checkmark. Floating graphics remain in place. Global dashboard/theme preferences are not mutated.
- File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. TypeScript and diff whitespace checks passed; tests skipped by existing request. Browser appearance not verified. No commit, push or deployment.


### 2026-11-16 — Yellow styling scope correction

User clarified that the page background should retain its prior theme. Removed the yellow canvas/surface and black global text/border overrides. Only existing yellow action components use #FFFC00 with black text and black borders; background, neutral fields, selected-purpose styling and text follow the configured app theme again. Floating graphics retained. Supersedes the full-page palette note above. TypeScript and diff whitespace checks passed; tests remain skipped. Not deployed.


### 2026-11-16 — Step 1 copy refinement

Updated the onboarding title to “How do you want to show up in the world?” and made the radio-group legend visible as “Please choose one”. Existing options and selection behavior are unchanged. Copy-only change; diff whitespace check passed, tests skipped as requested. Not deployed.


### 2026-11-16 — Selected option gradient/glow

Selected step-1 option now uses a Snapchat-yellow gradient, soft yellow glow, black border/text/icons and its existing checkmark. Neutral options retain their theme styling. Focus stays visible; the 150 ms color/shadow transition is disabled for reduced motion, with no animated pulsing. File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. TypeScript and diff whitespace checks passed. Tests skipped as requested; browser visuals not verified. Not deployed.


### 2026-11-16 — Visible profile-generation guidance

Moved `needs_clarification`/`insufficient_context` feedback outside the optional About/category disclosure into the visible step-3 knowledge area. Replaced light-mode-unreadable amber text with semantic theme surfaces/text and a live status. Guidance remains tied to explicit Generate, and never gates creation. File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. TypeScript and diff whitespace checks passed; tests skipped by request. Browser visibility not verified. No deployment.


### 2026-11-16 — Step 3 classification, presence and official channel

- Step 3 is now Online Presence & Classification. Category uses the existing Yullo CategoryCombobox; Presence Type reuses the canonical online/physical/both/mobile values; Official Website or Channel is visible with explicit public-link copy. Existing source ingestion/review, previews and optional About generation remain below these fields.
- Knowledge URLs were intentionally never identity website channels. Add Link now offers an explicit “Use as my official website or channel” checkbox; already-added URLs can be chosen from the official field. These choices populate local official-channel input without silently publishing reference links or replacing an owner-approved channel.
- Creation flushes classification/presence/official channel through `formsApi.updateIdentity` and the existing authenticated, revision-checked canonical persistence service before handle reservation/publication. That service writes the established `space-website` contact-channel entity, so the main identity editor/public projection can read the same data. No duplicate website store or direct entity insert. Resume reads canonical presence/website. New details save on Create; refreshing unsaved classification inputs before creation is not verified.
- Added `generate_missing_category` to the canonical update request, default true to preserve existing editor enrichment. Onboarding sends false to avoid implicit model work or fabricated fallback classification on Create; blank optional category still allows launch. Explicit generation, source processing and review remain unchanged.
- Files: `ui/src/yullo/screens/NewSpaceScreen.tsx`, `ui/src/yullo/api/forms.ts`, `app/yullo/schemas/forms/identity.py`, `app/yullo/services/persistence/identity.py`.
- Verification: UI TypeScript, canonical service/schema imports and diff whitespace checks passed. Production frontend build passed with existing bundle warnings. Tests remain skipped by user request; browser persistence/public channel integration not verified. No migration, production data writes, commit, push or deployment.


### 2026-11-16 — Separate optional knowledge step

- Onboarding/create now has four steps: Created for → Name → Online Presence & Classification → Add knowledge (optional). Moved link/file/text actions, existing source/review list, processing/clarification feedback, optional About generation and preview to step 4. Category, presence and official channel remain in step 3. Back/Continue preserves component state; Create/Skip is only on step 4. Canonical identity save and ingestion remain unchanged.
- Presence Type mobile retains its stored value and now explains that it covers travel-to-customer or temporary-location services (home services, food trucks, market stalls).
- File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. Supersedes earlier three-step notes. TypeScript and diff whitespace checks passed; tests skipped by existing request. Browser flow not verified. No deployment.


### 2026-11-16 — Remove mobile/pop-up onboarding choice

Removed Mobile / Pop-up service and its explanatory helper from onboarding. The selectable presence choices are Online only, Physical location and Online & physical location. A hidden compatibility option preserves an existing saved mobile value until the owner chooses a replacement; no stored data or other editor capability was deleted. File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. Diff whitespace passed; tests skipped by request. Not deployed.


### 2026-11-16 — Home after onboarding

Successful mandatory onboarding now always navigates to `/yullo/home` after server launch and local completion update, overriding any old return destination for that flow. Explicit additional-Space creation retains its existing destination. File: `ui/src/yullo/screens/NewSpaceScreen.tsx`. Diff whitespace passed; tests skipped as requested. Not deployed.


### 2026-11-16 — Remove Explore toggle from identity UI

Removed the Show in Explore apps checkbox and explanatory text from `ui/src/yullo/forms/identity/IdentityForm.tsx` at user request. Existing saved discovery values and server filtering remain unchanged; form reset/schema compatibility is retained. No stored visibility changes. TypeScript and diff whitespace checks passed; tests skipped as requested. Not deployed.


### 2026-11-17 — Owner inputs take priority in About generation

- Suggest with Aura, Chat with Aura and onboarding generation now send current purpose, category/provenance, presence and description/provenance with the name/official URL. Request fields have server-side enum/length validation. Missing fields from older/internal callers fall back to saved identity values.
- Context distinguishes owner-written category/description from previous Aura drafts, labels presence explicitly, includes current owner classification in fallback search terms and fingerprints all owner constraints/history/prompt version. Added product/owner filtering in the context collector and rejects an inaccessible explicit Space before collecting any source data. Context/search boundary logs retain IDs without names or queries.
- Prompt `identity-v3-owner-priority` says owner inputs define intended identity, same-name searches are unverified, category/presence conflicts must ask for clarification, URLs alone are not website contents and prior Aura drafts are not owner evidence. Model reports consistent/uncertain/conflict. Server pins the owner's category and downgrades uncertain/conflicting matches, or search matches missing consistency, to needs_clarification without candidate description/channel when owner constraints are present. Matching is model-assisted, not a deterministic identity guarantee.
- Fixed generate-summary response dropping the generated category. Generation now leaves form values intact until explicit Use suggestion/Apply. Apply retains an owner-entered category and existing official channel; chat cannot apply an old proposal while awaiting a new result or after a non-ready result. Source ingestion/extraction/review and canonical save/publication remain intact.
- Files: `app/schemas/yullo_onboarding.py`, `app/api/v1/yullo_onboarding.py`, `app/orchestra/ai/data_generation/identity_generate.py`, `app/orchestra/ai/prompts/yullo/about.py`, `ui/src/yullo/api/onboarding.ts`, `ui/src/yullo/forms/identity/IdentityForm.tsx`, `ui/src/yullo/screens/NewSpaceScreen.tsx`.
- Verification: TypeScript, changed generation schema/router/context/prompt imports and diff whitespace passed. Production frontend build passed with existing bundle/dependency warnings. Tests remain skipped by user request; no live-model calls or database/source mutations made for validation. Search identity accuracy and browser end-to-end generation remain unverified. Bare official URLs still do not fetch website content; unchanged source-status/evidence collection remains a separate known limitation from the prior audit. No migration, commit, push or deployment.


### 2026-11-17 — Icon-only delete action in identity editor

Identity editor now requests the existing shared FormActions delete action as a 44px icon-only button with Delete space accessible label/title. Other forms retain their text labels by default. Existing confirmation/archive/delete behavior is unchanged. Files: `ui/src/yullo/forms/core/FormActions.tsx`, `ui/src/yullo/screens/identity/IdentityFormScreen.tsx`. TypeScript and diff whitespace checks passed; tests skipped by request. Not deployed.
