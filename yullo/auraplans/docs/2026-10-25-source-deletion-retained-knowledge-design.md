# Source deletion and retained knowledge

## Problem

Removing a source currently deletes its database row and attempts to clean related data, but cleanup is incomplete and the user cannot choose whether confirmed facts should survive. Vector deletion calls the wrong method, URL scrape snapshots remain on disk, and extracted entities are deactivated even when another source may still support them.

Source removal must immediately stop deleted-source content from entering Aura while giving the owner an explicit, informed choice about previously extracted knowledge.

## Product behavior

Before deletion, the UI requests a dependency summary containing the source title and counts for facts, extracted entities, vector chunks, uploaded blobs and scrape snapshots.

The confirmation dialog includes a checked-by-default option:

> Permanently delete facts and extracted data from this source.

When checked, deletion uses `purge`. When unchecked, deletion uses `retain_for_review`.

### Purge

- Remove the source from active retrieval immediately.
- Delete its vector chunks, uploaded blobs, extracted-text blob and raw scrape snapshots.
- Delete source facts.
- Delete source evidence records.
- Delete extracted entities supported only by this source.
- Retain entities that have another active source or were created manually.
- Remove legacy source references where they exist.

### Retain for review

- Remove the source and all external artifacts as in `purge`.
- Detach source facts before the source row is deleted and mark them unavailable to Aura.
- Preserve a small immutable source snapshot for audit: source ID, title, locator and deletion time.
- Deactivate source-derived entities that have no other active evidence.
- Create a pending knowledge-cleanup alert for the Space.
- Do not expose retained facts or entities through public retrieval until the owner resolves the alert.

## Notification and review experience

The “What Aura knows” header shows a bell only when the Space has pending cleanup alerts. The bell has a count badge and an accessible label such as “2 knowledge reviews pending.” This is a local knowledge-review indicator, not a general notification platform.

Clicking the bell opens a modal listing each removed source and its retained facts/entities. Closing the modal leaves the alert pending.

Each alert provides three actions:

1. **Delete facts** — permanently delete all selected retained facts and source-only entities.
2. **Review individually** — select facts to keep or delete.
3. **Continue using facts** — convert selected facts into owner-maintained knowledge.

Before continuing to use facts, show:

> These facts no longer have an active source. Aura can continue using them, but answers may become inaccurate or outdated because the original information cannot be verified. We recommend deleting them unless you will maintain them manually.

The owner must check:

> I understand that these facts may be outdated or inaccurate, and I want Aura to continue using them.

Confirmed facts become owner-maintained facts. Aura may use them, the deleted-source snapshot remains in audit metadata, and the UI displays “Source removed · maintained manually.” This action does not restore extracted entities automatically; entities require their own selection because their payloads can contain links, prices, availability or media that depended on the removed source.

## Data model

Add `yullo_knowledge_cleanup_alerts`:

- `id`: UUID primary key
- `space_id`: required FK to `spaces`, cascade on Space deletion
- `deleted_source_id`: original source UUID, stored as audit data rather than a live FK
- `source_title`: source title at deletion time
- `source_locator`: nullable source URL or filename at deletion time
- `fact_ids`: JSON array of retained fact UUIDs
- `entity_ids`: JSON array of affected entity UUIDs
- `status`: `pending` or `resolved`
- `created_at`, `resolved_at`
- `revision`: optimistic-concurrency integer

The alert stores workflow references and an audit snapshot, not duplicate fact/entity payloads. Facts and entities remain canonical in their existing tables.

Retained facts keep `source_doc_id`, `source_filename` and source locator information but set `source_item_id` to null before source deletion. Existing retrieval already rejects a fact when `source_item_id` is null but `source_doc_id` remains present. Owner confirmation clears its operational source dependency and records manual-maintenance audit metadata. A migration may add `maintenance_mode`, `deleted_source_id` and `deleted_source_locator` fields to `kb_facts` rather than overloading review status.

More precisely, retained facts first move to a paused state with `source_item_id = NULL` while `source_doc_id` remains populated. When the owner chooses **Continue using facts**, the resolver copies the original source identity into immutable audit fields, clears `source_doc_id` and other operational source linkage, sets `maintenance_mode = 'owner'`, and keeps `review_status = 'owner_confirmed'`. This makes the fact eligible for the existing manual-fact retrieval path while preserving its history.

## API contract

### Deletion impact

`GET /onboarding/sources/{source_id}/deletion-impact`

Returns authorized, current-Space counts and the current source version:

```json
{
  "source_id": "uuid",
  "source_title": "Amazon",
  "source_version": 3,
  "facts": 12,
  "entities_source_only": 7,
  "entities_with_other_evidence": 2,
  "vector_chunks": 36,
  "stored_artifacts": 3
}
```

### Delete source

`DELETE /onboarding/sources/{source_id}` with a JSON body:

```json
{
  "derived_data": "purge",
  "expected_source_version": 3
}
```

or:

```json
{
  "derived_data": "retain_for_review",
  "expected_source_version": 3
}
```

The backend re-locks and recounts dependencies. A source-version mismatch returns `409` so the user sees an updated impact summary rather than deleting newly extracted data using stale counts.

### Cleanup alerts

- `GET /spaces/{space_id}/knowledge-cleanup-alerts?status=pending`
- `POST /spaces/{space_id}/knowledge-cleanup-alerts/{alert_id}/resolve`

Resolution accepts selected fact/entity IDs, one action per item, the alert revision, and `acknowledge_unverified=true` when facts will remain available to Aura.

## Deletion service

Deletion is staged because database changes and vector/blob removal cannot share one transaction:

1. Lock the source, validate `expected_source_version`, recount dependencies, and calculate which entities have other active evidence.
2. In the first transaction, mark the source unavailable to retrieval, detach or delete derived rows according to the selected mode, and persist a cleanup operation containing only trusted artifact identifiers and expected storage paths. Commit this transaction before external cleanup so Aura stops using the source immediately.
3. Delete vectors, blobs and snapshots using the persisted cleanup operation.
4. In a second transaction, delete the source row and mark cleanup `complete`. If an external deletion fails, keep the source unavailable and mark cleanup `pending_retry`; the operation retains the identifiers required for a bounded retry.

External cleanup is explicit and observable:

- Call `delete_client_doc(space_id, doc_id)` for vector chunks.
- Delete the uploaded source blob and extracted-text blob.
- Delete both `raw_html_path` and `raw_deep_path` within the expected source snapshot directory.
- Never accept arbitrary metadata paths for deletion; resolve and verify every path is within the configured uploads root and matches the Space/source IDs.

The API must not return unconditional success when external cleanup fails. The source becomes unavailable to Aura first, and the response reports cleanup as `complete` or `pending_retry`. A bounded cleanup job retries failed vector/blob/snapshot deletion. Logs contain safe identifiers and counts, not source content.

## Entity rules

- Manual entities are unaffected.
- An extracted entity with another active evidence source remains active.
- An extracted entity supported only by the deleted source becomes inactive during review.
- `purge` permanently removes a source-only extracted entity. If the model already records an explicit manual origin or another owner relationship, treat it as manual and leave it untouched; do not infer ownership from `review_status` alone.
- `retain_for_review` lets the owner keep selected entities only after acknowledging that source-dependent links, prices, availability and images may be stale.
- Extracted entities missing evidence are treated as integrity errors: exclude them from public Aura immediately and surface them in the cleanup alert instead of silently retaining them.

## Frontend changes

- Extend `DeleteSourceConfirmDialog` with dependency counts and the checked-by-default purge option.
- Pass the selected deletion mode through `yulloOnboardingApi.deleteSource` from every source-deletion entry point, including onboarding and cleanup paths.
- Add the pending-review bell beside the “What Aura knows” heading.
- Add a cleanup review modal with bulk and individual decisions, keyboard operation, focus management and theme tokens.
- Refresh sources, facts, entities and cleanup alerts after deletion or resolution.

## Compatibility and migration

- Apply the fact schema and cleanup-alert migration before enabling `retain_for_review`.
- Update every source-deletion caller in the same release to send an explicit mode. The backend may temporarily default omitted mode to `purge` only for compatibility with an older deployed frontend; log that fallback and remove it after the coordinated rollout.
- Repair vector deletion by replacing the nonexistent `delete_doc` call with `delete_client_doc`.
- Clean legacy `YulloSource` rows or references associated with the deleted `KnowledgeBaseItem`.
- Existing orphaned vectors and raw snapshots require a separately authorized reconciliation job; the feature does not silently scan or delete historical data during deployment.

## Verification

Focused checks should cover:

- Purge removes source facts, source-only entities, evidence, vectors and artifacts.
- Retain mode keeps facts stored but excludes them from Aura before confirmation.
- Explicit acknowledgement converts selected facts to owner-maintained knowledge.
- Closing the review modal leaves the bell notification pending.
- Multi-source entities remain active after one source is removed.
- Conflicting source versions return `409`.
- Vector/blob cleanup failures produce `pending_retry` rather than false success.
- Cross-Space source, alert, fact and entity IDs are rejected.
