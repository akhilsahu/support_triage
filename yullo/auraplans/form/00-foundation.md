# Shared Space form foundation implementation plan

## Goal and layout

Create `/yullo/spaces/:spaceId` inside `YulloPrivateRoute`. Header: Space label, display name, real public URL and View Link. Below: Identity / What Aura knows / Details / Aura / Appearance as calm summary rows with Edit or Manage. Show Setup/Published and real attention state. Retain existing Home sections. Add Space to navigation only with a selected Space; Network link appears only if a real route exists.

Details are driven by a typed capability registry, not separate applications per Space type. Required Space types: business, creator, person, organization. Suggested subtype/capability values remain candidates until accepted. Owner can add any supported module even if inference did not suggest it. Hiding a module must not delete its records or change public visibility. Capability toggle text distinguishes hide from owner overview vs disable public capability.

## File map (new unless identified as existing)

- `ui/src/yullo/screens/space/SpaceOverview.tsx`: summary-only owner page.
- `ui/src/yullo/forms/core/`: FormField, TextField, TextAreaField, SelectField, ComboboxField, SegmentedField, SwitchField, PhoneField, UrlField, UploadField, TimeRangeField, RepeatableField, FieldError, FormActions, VisibilityField, QuickEditor, CollectionManager, UnsavedChangesDialog.
- `ui/src/yullo/forms/registry.ts`: capability -> form routes, labels, schemas; no generated component code.
- `ui/src/yullo/forms/motion.ts`: shared motion tokens.
- `ui/src/yullo/api/spaceForms.ts`: typed owner requests/hooks. Existing `api/client.ts` remains authenticated transport.
- `app/yullo/api/space_data.py`: thin authenticated controllers registered under `/api/v1/yullo/owner/spaces`. Backend API names describe Space data, never frontend forms.
- `app/yullo/services/persistence/common.py`: owner/product guard, revision handling, transaction finalization and shared persistence helpers.
- `app/yullo/services/persistence/contracts.py`: shared validation primitives, enums and response/error contracts.
- `app/yullo/services/persistence/<domain>.py`: domain validation and persistence together. Approved files are `identity.py`, `knowledge.py`, `entities.py`, `profile.py`, `aura.py`, `appearance.py`, and `integrations.py`.
- Modify existing entity/source/Space services, not a parallel persistence implementation.

`app/yullo/services/persistence/` is the approved backend package for this plan set. Do not create `services/forms/`, `schemas/forms/`, another repository package, or another backend directory. Ask the owner before creating any additional directory. Reuse this package from UI routes, onboarding, bootstrap and background work.

## Visual tokens and libraries

React Hook Form owns transient drafts; Zod + existing resolvers validate on blur and Save. Pydantic/server is authoritative. Radix Dialog implements accessible sheet semantics and destructive confirmations; Popover/Select supports suitable pickers. Use native select where it suffices; cmdk is optional only for genuinely searchable command selection. Use the installed dropzone for uploads, date-fns for date handling, TanStack Query for server state, Lucide for sparse 16–20px icons, and `motion/react` for motion. No Material UI, Ant Design, Chakra or second broad primitive system.

Yullo owner UI must be visually isolated from Support247. Never import Support247 form components, cards, layout wrappers, CSS classes, theme tokens or screen shells. Do not imitate a generic SaaS dashboard. Specifically prohibit a boxed card for every section, icon tile beside every heading, KPI cards, thick shadows, glass panels, saturated gradients, pill badges for ordinary metadata, or grids of equal rounded containers. Use typography, whitespace, thin full-width rules and unequal editorial groupings. A raised surface is reserved for a form control, open sheet, dialog or contained preview.

The editor follows `AppTheme=light|dark|system`; the public renderer follows a separate `SpacePresentationTheme`. Public theme variables are scoped only to an Appearance preview subtree or the public Link. They never recolor owner forms.

| Token | Light | Dark |
|---|---|---|
| canvas | `#F6F7F8` | `#11151C` |
| surface | `#FFFFFF` | `#171C24` |
| surfaceRaised | `#FCFCFD` | `#1D232C` |
| surfaceSoft | `#EEF1F4` | `#202731` |
| text | `#151B27` | `#F5F7FA` |
| textMuted | `#667085` | `#A7B0BD` |
| border | `rgba(21,27,39,.12)` | `rgba(245,247,250,.12)` |
| borderHover | `rgba(21,27,39,.24)` | `rgba(245,247,250,.24)` |
| focus | `#4EA6CF` | `#73CBE8` |
| focusSoft | `rgba(78,166,207,.18)` | `rgba(115,203,232,.18)` |
| accent | `#E4CC32` | `#E8D84E` |
| danger | `#C94343` | `#FF8585` |

Yellow is a restrained identity/accent/status mark. Never use it as small body text on white or as the default large action fill. Primary actions use the current text color as their background with inverse label; secondary actions are transparent/quiet; destructive actions alone use danger.

Use existing Satoshi display and Instrument Sans body styling where loaded, with existing fallback stacks. Page titles 32–36px/1.1, sheet titles 24px/1.2, section labels 12–13px uppercase with `.08em` tracking, labels/body 16px and helper/error copy 14px. Visible labels sit above inputs; no floating labels. Fields are full width, minimum 52px (56px touch variants), padding 14px 16px, 12px radius, token surface/border/text and 4px focusSoft ring. Textareas start at 120px. Spacing: 12px label-to-control, 8px control-to-helper, 20px related fields, 32px groups and 48px major sections. Extend existing Yullo token CSS instead of inventing colors. Verify text contrast 4.5:1 and interactive indicators 3:1.

Desktop at >=768px: a Quick Editor is a right sheet with width `clamp(420px,38vw,560px)`, max-width `calc(100vw - 32px)`, one left border and tokenized backdrop matching `rgba(11,18,32,.08)` in light theme. It has a fixed header, independently scrolling body and sticky actions; the underlying Space remains visible. Below 768px it is a fullscreen editor with 16px minimum input font, Back/title, one Save action and safe-area padded sticky footer. A collection manager remains a page with max-width 1100px, margin auto and padding `32px 24px 80px` (`16px` horizontal below768). Manager items are borderless 72–88px rows separated by a single bottom rule, never a repeated card grid. At 768–1199px collapse secondary columns before shrinking fields. Appearance uses a dedicated split editor at >=1024px and stacked controls/preview below. Confirmations alone use centered dialogs with max-width420px. Verify at360,768,1024 and1440px.

Motion: `fast=140`, `base=220`, `sheet=260` ms; easing `[0.22,1,0.36,1]`. Sheet opens opacity0/x20 to opacity1/x0 in220ms and closes x12/opacity0 in180ms. Page content enters opacity0/y4 in180–220ms. Errors enter opacity0/y-4 in160ms. Optional fields reveal height0-to-auto/y-4-to0 in220ms; list insertion uses opacity0/y6 in200ms; status and preview changes crossfade140–180ms. Save -> Saving -> Saved only on server success, then sheet exits after300ms. Persistent pages stay open. Reduced motion removes translation, height animation, staggering and travelling effects while retaining immediate state changes. No bounce, shake, shimmer, overshoot, perpetual pulse, glow or dramatic full-page slide.

Trap sheet focus, restore trigger focus on close, Escape invokes dirty check, lock body scroll, label all errors via aria-describedby, announce save/error politely and focus first invalid field after Save. Use accessible buttons for reorder (Move up/down); drag is optional enhancement, never the sole control. Manager delete is a small confirmation dialog, not a normal editing modal.

## Backend contracts shared by entity forms

Owner API root `B=/api/v1/yullo/owner/spaces/{space_id}`. All calls derive user from session, enforce `Space.product='yullo'`, join Yullo extension and owner; never trust a user_id in a body. 404 for unavailable owned resources, 422 field errors, 409 stale revision, 413 oversized upload, 429 provider quota. Protect cookie-authenticated mutation requests through existing CSRF/origin protections; audit this explicitly before exposing routes.

Entity routes: GET/POST `B/entities`; GET/PATCH/DELETE `B/entities/{id}`; POST `B/entities/reorder`; POST `B/entities/{id}/confirm`. GET filters allowlisted `entity_type` and `kind`, cursor + limit <=100. POST takes `identity_key`, `entity_type`, `schema_version`, typed `payload_json`, `visibility`, optional disclosure/field policies. PATCH includes `expected_revision`, explicit field changes and policy changes; missing means keep, null means clear optional value. DELETE archives by default and returns 204. Confirm requires expected revision and revalidates evidence. Reorder takes complete IDs for one collection and expected collection revision, validates ownership/type/duplicates atomically and returns canonical order.

Services: extend `create_owner_entity`, `update_entity`, `confirm_entity`, `archive_entity`; add `list_owner_entities`, `get_owner_entity`, `reorder_entities`. Keep caller-owned transaction boundaries. Successful writes return normalized DTO with ID/type/payload/policy/revision/updated_at; event uses `append_domain_event` in same transaction and an allowlisted registered type. Never add unregistered event names or sensitive values to Home metadata.

Add entity `sort_order` if absent. Use identity_key String(200), immutable, unique per Space/type. Client UUID generated once per create draft is reused on retries. Lock/check revision before update. Add `revision` to YulloConfig for config endpoints; replace only validated JSON namespace with a fresh dict to trigger persistence, preserving siblings. For mixed Space/config updates use one transaction and config revision guard. Use existing Yullo context version for publication and inference invalidation; do not treat independent revisions as interchangeable.

## Save and publication contract

Forms explicitly Save meaningful content. Existing live Spaces: owner save is explicit authorization to apply that selected public change; use one canonical mutation finalizer to advance context/published version and invalidate public readers. Draft Spaces stay unpublished. Partial writes or failed processing never advance a published source version. Appearance previews are unsaved local drafts until Save. Tiny standalone display preferences may autosave with rollback; no public-contact/visibility autosave.

Query keys include owner ID, Space ID, namespace and filter. Cancel stale requests; preserve dirty drafts on refetch; show 409 conflict with Reload saved version or review changes, never silently overwrite. Clear owner queries on logout/switch. Invalidate overview, affected collection, public preview, Home and capability reads after confirmed mutation. Do not optimistically publish sensitive content.

## Implementation steps

- [ ] Add shared shell/routes/components and typed registry with loading, empty, failed and unauthorized states.
- [ ] Add backend common policy/revision layer and thin owner entity routes over existing services.
- [ ] Introduce forward migrations only after checking actual database revision; preserve existing records and same-Space composite constraints.
- [ ] Implement paired Zod/Pydantic contracts in each form plan. UI defaults never become authoritative facts without save.
- [ ] Verify keyboard, narrow mobile, reduced motion and cross-owner denials before integrating individual forms.

## Concrete request/response example

An offering create request (version2 as introduced in06):
```json
{
  "identity_key": "client-generated-stable-id",
  "entity_type": "offering",
  "schema_version": 2,
  "payload_json": {"kind": "service", "name": "Brand Sprint", "pricing_mode": "contact"},
  "visibility": "public",
  "disclosure_mode": "direct"
}
```
Response: `201 {id,space_id,identity_key,entity_type,schema_version,payload_json,visibility,disclosure_mode,field_policies,revision,sort_order,updated_at}`. Same identity and normalized command retry returns existing DTO; conflicting command returns409. POST includes client idempotency key where side effects extend beyond the entity row. User ID and review authority are server-derived.

PATCH example: `{"expected_revision":1,"payload_json":{"name":"Brand Sprint Plus"}}`. Service merges explicitly provided payload fields into stored payload, validates complete result, then saves revision2. Arrays replace as a whole unless endpoint explicitly supports reorder; null clears optional values. Current update_entity validates payload_json as a complete replacement: update it to this documented merge contract before frontend submits partial fields. DELETE accepts revision through If-Match or a documented query/header, checks it under lock and returns204. All endpoints must agree on one error shape `{code,message,field_errors,current_revision}` and translate existing service errors at controller boundaries.

Shared successful mutation finalizer interface, proposed in `services/persistence/common.py`:
```python
async def finalize_space_mutation(db, *, user_id, space_id,
                                  public_content_changed: bool,
                                  operation_key: str) -> None: ...
```
It verifies ownership, locks YulloSpace, increments context_version and advances published_version only for an already-live Space and a reviewed eligible public change. It does not mark pending extracted candidates reviewed. Cache invalidation occurs after commit through existing event/invalidation machinery. Nonpublic changes do not become public by sharing a context version.


## Form stack refinement — 2026-09-21

This section incorporates the owner's detailed stack and visual specification. These requirements apply to every form plan.

### Isolated component and theme locations

Keep the existing planned `ui/src/yullo/forms/core/` location; do not introduce a duplicate global `ui/src/components/forms/` system. Add `ColorPresetField.tsx` and `ThemePresetField.tsx` there. Use `TextAreaField` consistently instead of maintaining both TextArea and TextAreaField wrappers.

Create or extend `ui/src/yullo/theme/tokens.ts`, `presets.ts`, and `ThemeProvider.tsx` only as adapters around existing Yullo token/provider infrastructure. Inspect that infrastructure first and extend it where possible; do not maintain a second active theme provider or competing CSS variable store. Scope theme variables to the Yullo root. Scope an unsaved public appearance preview to its own subtree so preview edits never change the surrounding owner app or Support247.

### Primitive choices

Use React Hook Form, Zod, Radix primitives, Yullo-owned fields and `motion/react` as the default. Radix Select is suitable for styled short lists; native select remains acceptable when sufficient. Add its package only when the first styled SelectField needs it and after checking installed dependencies. A Popover alone is not an accessible combobox: implement keyboard navigation, selection, escape, aria-expanded/controls/activedescendant and listbox semantics using a proven primitive. cmdk remains optional for genuinely searchable command-style pickers, not a mandatory dependency for every dropdown.

Do not add react-aria-components as a second general primitive system. An isolated accessibility gap may justify it after documenting why Radix/native controls cannot meet the requirement. Existing react-aria dependencies do not mean react-aria-components is installed. No Ant Design, MUI or Chakra.

### Exact field and action styling

Use Yullo-scoped classes and map CSS custom properties to existing semantic tokens:

```css
.yullo-form-field {
  min-height: 52px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
.yullo-form-field:hover { border-color: var(--border-hover); }
.yullo-form-field:focus-within {
  border-color: var(--focus);
  box-shadow: 0 0 0 4px var(--focus-soft);
}
.yullo-form-actions {
  position: sticky;
  bottom: 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--surface) 70%, transparent);
}
```

Labels stay visible above fields, calmly weighted; helper/error text has reserved readable spacing. Sticky actions must not cover the final field: add matching content bottom padding and account for mobile keyboard/viewport behavior. Save and Cancel remain keyboard accessible. Disabled/invalid states must not be communicated by colour alone.

### Theme preset starting values

These are owner-supplied starting values for central preset definitions, not hardcoded component colours or fully validated accessible palettes:

| Token | Business cool | Creator warm |
|---|---|---|
| canvas | #F6F7F8 | #F8F4EE |
| surface | #FFFFFF | #FFFDFC |
| text | #151B27 | #1B1A17 |
| textMuted | #69707D | #756F67 |
| border | rgba(21,27,39,.10) | rgba(27,26,23,.09) |
| accent | #E4CC32 | #E9C94A |
| focus | #7CB7FF | #C99CF2 |
| focusSoft | rgba(124,183,255,.12) | rgba(201,156,242,.12) |

Complete surfaceRaised, borderHover, accentSoft and danger using the existing validated theme registry; check contrast before approving each full preset. The suggested pale focus colours may need a darker border/outline to meet the foundation's interactive contrast requirement. Keep dark/editorial/minimal presets in the same registry. Do not derive a dark theme by simply swapping white for black.

### Motion and form behavior

Keep shared fast140/base220/sheet260 millisecond tokens and standard easing [0.22,1,0.36,1]. Convert milliseconds to seconds at Motion transition boundaries. Theme-specific motion is optional and centrally bounded; start with the same motion in every theme. Do not multiply per-form animation variants.

- Error: AnimatePresence initial=false; opacity0/y-4 -> opacity1/y0; exit opacity0/y-4; duration160ms.
- Progressive optional field: opacity0/height0/y-4 -> opacity1/height:auto/y0; collapse height0 on remove. Unregister removed fields or explicitly clear their submitted values; hidden controls must not silently retain active contact details.
- Repeatable row: opacity0/y6 -> opacity1/y0, 200ms; stable React field IDs preserve typing focus.
- Keep all existing reduced-motion, focus-restoration and successful-save rules.

Configure RHF mode=onBlur. Required/email/URL errors appear after blur; full submit validates every field. Handle availability debounces400ms, cancels stale requests and ignores responses for an older input. Untouched fields remain neutral; server conflicts are authoritative regardless of a green availability indication.

Aura-suggested values show Suggested by Aura plus Keep/Change only while pending. After confirmation remove the persistent AI badge; provenance remains available in optional source details. Keep and Change never bypass review, policy or save semantics.

Appearance uses visual preset tiles and named accent swatches, not a standard theme dropdown or arbitrary V1 colour picker. A swatch has a text label and programmatically exposed selected state. Searchable cities/categories/countries/integrations use typed provider/registry data with an empty/unavailable state, not invented search results.

### Small-slice implementation rule

Build only the shared components required by the currently implemented form. Identity introduces basic text fields, error/actions and the sheet; subsequent forms introduce phone, upload, time and colour controls. The catalogue is the intended shared vocabulary, not a prerequisite to build every control before the first working form.
