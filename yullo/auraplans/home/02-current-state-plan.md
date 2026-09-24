# Yullo Home Current-State Snapshot Implementation Plan

**Goal:** Load all factual Home state with bounded grouped queries and strict owner/product isolation.

**Architecture:** Add `HomeSnapshotRepository` as the only database reader used by the Home composition service. It returns typed aggregate records; presentation rules do not issue their own queries.

**Depends on:** `01-home-events-plan.md`

## Reuse boundary

This plan is read-only. It reuses canonical `spaces` + `yullo_spaces`, shared knowledge/items/jobs/facts, shared chat/turn/log/event records, typed `yullo_space_entities`/evidence, and `yullo_user_preferences`. It must not read provisional `yullo_resources`, `space_sources`, `yullo_sources`, `yullo_aura_turns`, legacy `conversations/messages`, or Support247 dashboard projections after cutover. Yullo presentation state is derived in memory and is not copied into another snapshot table.

## 9. Home generation: exact module functions and computations

Create `app/yullo/services/home/repository.py:load_home_snapshot(db,user_id,now,config)->HomeSnapshot`. Use owned Yullo Space IDs and a bounded set of grouped SQL reads in one short read-only REPEATABLE READ transaction so multiple queries share one snapshot. Do not reuse auth's already-started transaction to set isolation.

Proposed defaults (configuration values, not observed product facts): active_window=15min; pattern_window=7d; pattern_min_sessions=5; momentum_min_current=5; momentum_min_previous=5; momentum_min_delta=3; momentum_min_ratio=1.5; attention_limit=3; recent_limit=10; orbit_limit=4. No baseline=0 percentage arithmetic; no previous coverage means no trend.

| Function/module | Inputs | Exact derivation | Database writes |
|---|---|---|---|
| `metrics.py:build_right_now` | production turns, sessions, attention | active=open session with persisted production user turn in last 15min; issues=len(all actionable alerts before display cap); enquiries=null | none |
| `attention.py:build_attention` | current source/job/fact state | only latest linked failed source attempt; extracted current facts -> needs review | none |
| `activity.py:build_recent` | domain events + Aura events | include conversation.started/source.updated/space.published/entity.published; dedupe by event ID; sort occurred_at desc + ID tie break; cap10 | none |
| `signals/recurring_need.py:evaluate` | intent.classified per Space + eligible entity capabilities | >=5 distinct production sessions in last7d with booking intent and no active booking capability => add_booking_action | none |
| `signals/pattern.py:evaluate` | grouped supported intents | >=5 distinct sessions per Space/intent; return measured count and window, max1 candidate per Space | none |
| `signals/momentum.py:evaluate` | current7d/previous7d counts | both>=5 AND delta>=3 AND current/previous>=1.5; show absolute counts/window | none |
| `signals/setup.py:evaluate` | lifecycle, actual ready sources | draft -> continue_setup; published with zero ready sources -> add_sources; no fake behavioral reason | none |
| `orbit/pulse.py:collect` | production conversation.started | >=5 distinct engaged sessions in7d => Pulse, literal count | none |
| `orbit/momentum.py:collect` | validated momentum candidate | map evidence unchanged into Orbit kind=momentum | none |
| `orbit/null_nearby.py:collect`, `null_connection.py:collect` | no provider | [] | none |
| `signals/service.py:select_home_signals` | all candidates | validate, remove duplicates, apply section enablement, assign each evidence family once, rank, cap | none |

No 'travel' trend from generic service intent: taxonomy has no travel category. Domain-category signals require explicit entity/category IDs and a separately validated taxonomy first. Counts are conversations/sessions, never unique people or returning visitors.

All intelligence providers return pure candidates from snapshot, not DB sessions. Synchronous `evaluate(snapshot,config,now)` is sufficient for release1. Future remote providers fetch into their own cache outside Home GET; no network calls during Home rendering.

IDs use rule version+Space+intent+UTC calendar-day window anchor, avoiding new IDs on every request. Evidence includes window_start/end, sample_count, distinct_unit=session, observed_at=max qualifying event time, rule_id/version, collection_coverage_start. Store telemetry schema rollout boundary in validated deployment configuration. A full 14d of comparable collection is required for 7d-over-7d claims; never treat missing historical collection as zero.

Section assignment: current operational alerts first; recurring actionable need to For you; comparison to Quick insight; remaining pulse/momentum to Orbit; remaining repeated need to Pattern. A disabled section releases its candidate for another eligible section. Preserve all section components but hide those without qualified distinct evidence. No dismissal button until dismissal persistence exists.

## 12. Migration and production rollout

### Snapshot query implementation

`load_home_snapshot` calls these repository functions sequentially on its read-only transaction:

```python
async def load_owned_spaces(db, user_id) -> list[SpaceRecord]: ...
async def load_preferences(db, user_id) -> PreferenceRecord: ...
async def load_session_metrics(db, space_ids, now, local_day_start) -> dict[UUID, SessionMetrics]: ...
async def load_source_states(db, space_ids) -> dict[UUID, SourceMetrics]: ...
async def load_entity_capabilities(db, space_ids) -> dict[UUID, CapabilitySet]: ...
async def load_fact_review_counts(db, space_ids, now) -> dict[UUID, int]: ...
async def load_intent_windows(db, space_ids, start, middle, end) -> list[IntentWindow]: ...
async def load_recent_events(db, space_ids, limit) -> list[EventRecord]: ...
```

Resolve Space IDs once using owner_user_id and product=yullo. Empty set short-circuits all aggregate queries. Returned HomeSnapshot fields are spaces, preference, session_metrics, source_states, entity_capabilities, review_counts, intent_windows, recent_events, coverage_start, now. Every dictionary is keyed by that authorized Space set only.

`load_source_states`: query shared `knowledge_base_items` for owned Yullo Spaces and LEFT JOIN the current/latest `ingestion_jobs` attempt by item/Space/KB/version. Ready requires non-null published_version/current doc ID and a matching successful attempt. Count items, not chunks or historical attempts. A failed refresh may coexist with an older published version.

Home does not query `space_sources`, `yullo_sources`, or duplicate knowledge tables. Knowledge groups, sources/documents and lifecycle come from canonical `knowledge_bases`, extended `knowledge_base_items`, and linked `ingestion_jobs` attempts.

`load_session_metrics`: COUNT DISTINCT session.id with an EXISTS matching `conversation_turns` row and production message.received event; require both turn/session runtime_type=aura and matching Space. Today is sessions whose first production user turn falls within owner timezone's day. Active is open sessions with production user turn within15min. Never count empty starts or preview traffic. Resolve valid timezone from preferences; convert local-day bounds to UTC.

`load_intent_windows` uses this semantic SQL (array binding through SQLAlchemy; no string concatenation):

```sql
SELECT space_id, intent,
 count(DISTINCT session_id) FILTER (WHERE created_at >= :middle) AS current_count,
 count(DISTINCT session_id) FILTER (WHERE created_at < :middle) AS previous_count,
 max(created_at) AS observed_at
FROM conversation_events
WHERE space_id = ANY(:owned_space_ids)
  AND runtime_type = 'aura'
  AND event_type = 'intent.classified'
  AND event_metadata->>'traffic_class' = 'production'
  AND intent IN ('booking','contact','pricing','service','portfolio','location')
  AND created_at >= :start AND created_at < :end
GROUP BY space_id, intent;
```

Add the configured intent_origin filter when model-derived labels are disabled. An absent group is zero only when collection coverage is known complete; otherwise unavailable. Bounds passed to existing naive timestamp columns are explicit naive-UTC values, while API timestamps serialize with Z.

`load_fact_review_counts`: review_status=extracted, superseded_by_id IS NULL, valid_from null or <=now, valid_until null or >now, plus current source version linkage. Incomplete provenance is not included in a current-source claim. Count only reviewable rows; never label them conflicts automatically.

`load_entity_capabilities`: select active/public/trusted `yullo_space_entities`; extracted entities do not qualify. Evidence-backed entities must join at least one valid same-Space `yullo_space_entity_evidence` row whose item/version remains current. Owner-origin entities need no evidence row. Return typed action kinds only from validated `entity_type='action'` payloads. Do not infer booking from arbitrary URL text.

`load_recent_events`: fetch at most limit from each event stream using the same time/ID sort, merge, namespace IDs with table type, sort and cap again. Current targets are revalidated when creating actions. Historical source event remains history after a source is removed, but its retry action disappears. No isNew field until there is a real persisted view watermark.

Query failure returns a recoverable API error rather than an apparently empty account. Provider absence returns empty provider output; do not conflate database outage with unsupported functionality.

1. Inspect actual Alembic head; generate chained revisions instead of assuming fixed 0068. Add event table/preference column, event dedupe column/index, source creation_key, entity/evidence tables, provisional-table migration, lease/turn tables and constraints. Existing shared-table columns are nullable or defaulted for backward compatibility.
2. Backfill transitional sources by stable legacy source ID as creation_key. Join only product=yullo. A legacy ready flag does not prove indexed data: enqueue where no validated KB item exists. Never invent past events or timestamps. Invalid/ambiguous rows are reported and omitted from ready counts.
3. Deploy producers with Home behavioral signals disabled. Run dispatcher/reconciler, confirm production event schema coverage, verify source linkage and failure recovery.
4. Enable factual Home modules first; classify deterministically. Model classifier stays disabled until evaluated. Enable patterns after enough samples, and momentum only after full comparative coverage.
5. Enable frontend real API per config after contract parity. Deployment failure disables affected signals; keep canonical data and pending jobs recoverable.

Operational counters: pending job age, lease expirations, finalization errors, duplicate event conflicts, interrupted turns, classifier failures, candidate rejection reasons, Home query latency/query count. Logs include IDs and stable error codes only. Configure alert when queued age>5min or finalization failures persist; never log request bodies or signed capabilities. Event retention default90d; delete in bounded batches; turns follow conversation retention; purge orphan blobs/vector attempts after24h. Retention must preserve the configured comparison windows.

Targeted acceptance: fault after SQL commit before dispatch; duplicate worker delivery; stale worker finalization; DB failure before stream done; retry same turn; cross-Space session/source/entity/evidence IDs; no-event and partial-coverage periods; unknown action routes; account switch. These are required production checks, not an exhaustive test-case plan.
