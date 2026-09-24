# Yullo Missing UI Plan

The overall plan includes backend and frontend integration, but the Yullo owner UI is incomplete.

## Reuse boundary

- Keep every Yullo owner/public screen, store, API adapter, renderer and style under `ui/src/yullo/`.
- Do not reuse Support247 screens, chatbot state, dashboard contracts, render blocks or business components.
- Reuse installed framework libraries and proven product-neutral utilities only.
- Backend screens consume Yullo DTOs even when those DTOs are assembled from shared Space, knowledge, ingestion and conversation tables.

Existing UI:

- Marketing page
- Yullo authentication
- Onboarding: purpose → handle → sources → preview
- Public Aura conversation
- Initial generative UI renderer

Required additions:

1. **Spaces Home**
   - List all Spaces owned by the user.
   - Create another Space.
   - Show draft/live/limited status.
   - Replace the current mock `YulloDashboard`.
   - Remove dependency on one global `onboardingComplete` value.

2. **Space Studio**
   - Public link and publication status.
   - Aura status: building, ready, limited, failed, paused.
   - Basic identity, appearance and contact settings.
   - Entry points for sources and preview.

3. **Sources Manager**
   - Add, remove and retry sources after onboarding.
   - Show queued, processing, ready, limited and failed states.
   - Display what information was accepted.
   - Reuse the onboarding `TeachStep` behavior.

4. **Real Preview and Publish**
   - Current preview uses a static `SpaceRenderer`.
   - It must call the real preview Aura version and use the same public renderer/chat runtime.
   - Show generation progress, limited knowledge, stale preview and publish errors.
   - Allow regeneration after source changes.

5. **Public Aura states**
   - Loading
   - Unpublished/private
   - Aura disabled or limited
   - Streaming failure with retry
   - Unknown-answer state with source suggestions
   - Mobile conversation restoration

6. **Citations UI**
   - Current frontend types do not include citations.
   - Add citation stream data, source labels and a small citation/details view.

7. **Separate Yullo state**
   - Yullo currently uses the shared Support247 Zustand store.
   - Add a Yullo-specific auth, selected Space and conversation store.
   - Key browser data by `yullo:{spaceHandle}`.

The working tree contains a provisional `yullo_resources` table. Its name and scalar provenance link are not the target design. Migrate it to typed Space entities and evidence, then remove it.

Recommended target:

```text
yullo_space_entities
- id
- space_id
- entity_type
- schema_version
- title
- payload_json
- identity_key
- origin_type
- review_status
- visibility
- status
- revision
- created_at
- updated_at

yullo_space_entity_evidence
- id
- entity_id
- space_id
- kb_id
- source_item_id
- source_version
- evidence_locator_json
- created_at
```

Each `entity_type` uses a strict schema. General facts remain in `kb_facts`; PDFs, URLs, text and Q&A remain in shared knowledge items. Aura returns only:

```json
{
  "type": "offering",
  "entityId": "..."
}
```

The backend validates the entity type, same-Space ownership, review/visibility/status and published version before the frontend renders it.

Current UI issues to correct:

- Service, portfolio and location cards contain placeholder data.
- `products` exists in the TypeScript union but has no renderer.
- `actions` accepts arbitrary URLs instead of validated entity IDs.
- Preview is static and does not represent the generated Aura.
- The owner dashboard is only a placeholder.

For minimal v1, retain these main owner screens:

- Spaces Home
- Onboarding
- Space Studio
- Sources
- Preview and Publish

Keep appearance, contact details and Aura status inside Space Studio instead of creating many separate settings screens.
