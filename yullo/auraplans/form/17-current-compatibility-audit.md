# Current field compatibility audit — 2026-09-21

This is a source inspection, not a database deployment verification. “JSON exists” does not mean a field is supported: current Pydantic models forbid extra fields and every read/render path must understand new keys.

## Current Form 1 placement issue

The present Identity implementation is split across `app/yullo/services/forms/identity.py`, `app/yullo/schemas/forms/identity.py` and `app/yullo/api/space_forms.py`. Its behavior can be reused, but those backend locations are transitional. Consolidate its validation and persistence into `app/yullo/services/persistence/identity.py`, place shared contracts/finalization in the approved persistence package, and move thin authenticated routes to `app/yullo/api/space_data.py`. Keep frontend form code under `ui/src/yullo/forms/identity/`. Remove the old backend modules only after imports, router registration and focused behavior checks pass.

| Form area | Current compatible data | Missing/required work | Storage outcome |
|---|---|---|---|
| Identity | spaces.display_name/slug/logo_url; YulloSpace purpose | new type enum including creator/person; typed description/subtype/presence; handle policy reuse | existing columns + config schema |
| Knowledge | TextSourceInput(title,text), UrlSourceInput(url), FileSourceInput(title,blob_key,mime_type); item/job lifecycle | owner manager/router, URL optional title, durable uploads/status/replacement, social/web provider capabilities, source disclosure | shared KB/item/job reuse, policy metadata migration if absent |
| Contacts | label/channel/value for email/phone/website | whatsapp/social/link enum; strict normalization/platform; policies | contact_channel v2 + common policy columns |
| Location | name,address,lat/lng,map_url | city-only without full address, locality/precision, schedule/timezone/service area | location v2; no separate hours table |
| Services/products | name,description,price_amount,currency,duration_minutes | kind, summary, pricing modes/range/original, media, availability, timeline, CTA references | offering v2 |
| Portfolio | title,description,media_urls,project_url | alt/asset IDs/client/date/tags/featured | portfolio_item v2 |
| Team | name,role,bio,image_url | contact references, image alt, policy | person v2 |
| Events | title,starts_at,ends_at,location_entity_id,registration_url | timezone-aware validation + timezone, description/online/media/status | event v2 |
| Actions | label,kind booking/enquiry/external_link,destination_url | membership/volunteer/donate/order/collaboration/reservation/delivery enum, references | action v2 |
| Programs | no program kind | offering kind=program with bounded metadata | offering v2, not new table |
| FAQ | KBFact label/value/value_json/source lifecycle | explicit FAQ mapping, revision/order/policy and API | shared kb_facts |
| Prompt starters | frontend renders string list; public API returns [] | persisted typed config, owner CRUD/generation, published API mapping | settings.aura.prompt_starters |
| Aura behavior | config JSON exists | typed behavior + runtime consumption | settings.aura.behavior |
| Appearance | YulloSpace.appearance_config JSON exists | semantic registry/schema + preview + tokens + owner precedence | existing JSON column authoritative |
| Profile extras | generic config JSON exists | full typed wrappers/editors/readers/provenance | settings.profile |
| Capabilities | proposed concept, not full registry | registry with explicit owner overrides and available provider states | settings.capabilities |
| Visibility | entity is_public boolean, review_status | four scopes + field policies/disclosure + all-source retrieval controls | migrations and policy service before UI |
| Ordering | entity identity/revision present | sort_order and per-collection concurrency | entity column + config revision |

## Concrete mismatches that must not be papered over

1. Entity payload unknown keys are rejected; extending a form alone will produce 422. Ship schema version2 with server/client adapters and renderer support before showing new controls.
2. Current ServiceCard reads title/url while offering stores name and needs typed action references. Public DTO adapter is required.
3. Public space serializer uses `space.name` even though current model's mapped name is `display_name`; correct canonical mapping and remove hardcoded description.
4. Existing public entity endpoint checks is_public/is_active only. It must additionally enforce publication, review, source validity and audience/disclosure projection.
5. Entity schema uses `contact_channel`, not `contact`; normalize deprecated bootstrap alias only at its boundary and reject ambiguous multi-value aliases.
6. Person/work legacy purpose values differ from the new four Space types. Audit distinct values first; no automatic inference for ambiguous rows.
7. Existing SourceInput contracts do not implement “Learn from web” or social authentication. Do not expose working-state UI without a real provider.
8. Current action input is a URL, not an executable booking/payment tool. Forms must promise external navigation only.
9. Facts have a verified/status equality constraint and superseded/self-reference rules. Owner writes must update both verified/status and respect provenance; FAQ archive can expire rather than fabricate supersession.
10. Composite fact source FK has SET NULL across source_item_id/space_id/kb_id while scope columns are non-null. Source deletion needs a compatible reference policy; do not turn on destructive source deletion until reconciled.

## Schema evolution decisions

Create explicit V2 payload classes for extended entity types and retain V1 readers. New writes use V2 after all consumers support it; no destructive mass migration required for optional fields. Migrate visibility and row ordering separately from JSON changes. Metadata extensions belong in Yullo config/payload, not generic Space columns. Backend shared infrastructure reuse is allowed; UI reuse is within Yullo only.

For each endpoint implementation, map submitted fields to this table and reject fields with no implemented backing contract. Keep the domain's validation and persistence together in its `app/yullo/services/persistence/` module so route schemas cannot drift. Copy these checks into review criteria, not into customer-facing copy.
