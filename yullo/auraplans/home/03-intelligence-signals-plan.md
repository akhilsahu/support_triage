# Yullo Home Intelligence Signals Implementation Plan

**Goal:** Generate attention, For you, Quick insight, Pattern, and setup suggestions from verifiable evidence.

**Architecture:** A deterministic rule engine consumes `HomeSnapshot` and returns typed `HomeSignalItem` values in memory. Server-owned templates create copy only after the rule qualifies. Release 1 does not add an intelligence table or call an LLM from Home.

**Depends on:** `02-current-state-plan.md`

## Release 1 scope

Yullo intelligence has no dependency on the existing evaluation subsystem. Do not modify or query evaluation tables, models, schemas, services or routes; do not add an evaluation traffic class or publication gate. Preview traffic remains distinct and is excluded from Home. Model-derived intent remains disabled by default and can be activated only through a separate future implementation decision.

## Reuse boundary

Reuse shared conversation events, the shared model-provider factory when classification is explicitly enabled, eligible typed Space entities for capability checks, and the Home snapshot contract. Keep Yullo rule configuration and copy templates in `app/yullo/`. Do not reuse Support247 triage/agent routing, do not persist an `intelligence_items` table, and do not use Mem0 or model confidence as evidence.

## 7. Intent labels and actual enquiries are different inputs

Create `app/yullo/services/home/intent.py`:

```python
def intent_from_validated_action(action: ExecutedAction) -> IntentEvidence | None: ...
async def classify_turn(message: str, *, config: IntentConfig) -> IntentEvidence | None: ...
```

Controlled labels: booking/contact/pricing/service/portfolio/location/general/unknown. A server-validated completed tool/action may supply category. Rendering a card or receiving a client click is not an executed booking or enquiry.

Default `llm_intent_enabled=false`. If a separate future implementation explicitly enables it, reuse the configured provider factory `app.core.llm_provider.get_async_openai_clients`, bounded JSON schema `{intent: enum}`, input cap 2000 characters, timeout 2 seconds, no tools, temperature low where supported, and no extra retries in the visitor path. Treat input as untrusted data. Invalid/refusal/timeout =>unknown. No arbitrary categories or reasoning are persisted. Prompt/model/classifier version belong in config. A model's self-reported confidence is not proof. Keep evidence origin explicit. Release 1 implements deterministic action-derived intent only.

Persist accepted classification once via event `intent.classified` keyed by user message ID, with message_id, intent, metadata.intent_origin=explicit_action/model, classifier_version, traffic_class. It does not change the original message.received row. Home counts DISTINCT session_id, not classification rows. Classifier failure omits the behavioral signal and never fails the conversation.

No inspected enquiry submission service/table exists. Release 1 therefore returns rightNow.enquiries=null and emits no enquiry_received activity. Contact intent is never counted as an enquiry. Future activation requires a separate accepted-lead command that first commits a durable enquiry record and then emits enquiry.created with its real ID. Do not add a fictional enquiry writer in Home.

### Who calls the classifier and inserts the event

Create `classify_and_record_intent(turn_id: UUID, config: IntentConfig, executed_action: ExecutedAction | None = None) -> None` in the same intent module. `AuraConversationService` invokes it after accept_turn commits, before answer generation, with a maximum2s classifier budget only when enabled. No detached fire-and-forget task or inference-time open SQL transaction.

1. Read turn, user_message_id, validated session identity and persisted message through a short scoped session. Reject preview traffic and completed existing intent.classified events; use turn ID/message ID as idempotency identity.
2. If a server-validated executed action is available, prefer its typed category. Otherwise call classify_turn only if model classification is enabled; when disabled return without inserting an intent event. Free text is otherwise retained solely by the ordinary conversation log policy.
3. Validate the controlled result. Unknown/invalid/timeout returns with a diagnostic counter and no behavioral claim.
4. In a new short transaction revalidate turn/session Space, then call append_aura_event with operation_id=user_message_id, event_type=intent.classified, message_id=user_message_id, intent=accepted label, traffic_class and intent_origin. Commit. Conflict dedupe handles repeated execution. Classification event failure is caught after this independent transaction rolls back; the accepted user message remains intact and answer generation proceeds.
5. Home's next read counts the persisted event; it never repeats classification. Backfilling old raw conversations is disabled unless explicitly planned with a controlled retention/privacy scope.

For explicit actions executed later in a turn, the server tool executor calls classify_and_record_intent with its validated action result. There must be one primary intent event per user message; first accepted event wins. Do not call this from an untrusted analytics endpoint. If no executable Yullo action flow exists, deterministic action-derived labels remain unavailable until that producer is implemented.

## 10. Worked record-to-UI examples

**Source:** owner U submits text to Space S with request key K. `accept_source` inserts pending Item I(space=S,kb=B,version=1) and Job J(item=I,status=queued), then commits. The shared worker produces D; finalization updates I with D/published_version=1, marks J done, and appends source.updated for I. Home shows “Knowledge source updated.” It cannot claim facts were learned because no fact extraction happened.

**Pattern:** seven different production session IDs have accepted booking labels within7d; each belongs to S. Space entities contain no eligible booking action. SQL count(distinct session_id)=7; recurring_need returns ID derived from booking-rule-v1+S+window, title='Booking comes up in 7 conversations', action={kind:add_action,targetId:S}, evidence={sample_count:7,distinct_unit:session,window_start,end,sourceLabel:'Aura conversations',observedAt:last_event}. No intelligence row is inserted. Repeated labels from one session still count once.

**Failure recovery:** broker is down after Source/Job commit. 202 reports queued. Dispatcher later retries J; two deliveries race, one claims lease. Winner commits Item+ready+event once. A stale worker cannot finalize because its token differs. Home sees queued until real success; it never fills a ready state from a fixture.


## Function implementation and exact values

Implement pure rules using the module/function table and configuration values in [Current-state plan](02-current-state-plan.md). All candidates are returned in memory. No rule inserts a database row. Use `signals/types.py`, `signals/recurring_need.py`, `signals/pattern.py`, `signals/momentum.py`, `signals/setup.py`, and `signals/service.py`. Do not also create a conflicting `signals.py` module.

`evaluate(snapshot, config, now) -> list[HomeSignalItem]` returns an empty list when evidence is missing. Template keys select fixed copy; interpolate only validated Space names, counts and time windows. `HomeSignalItem` contains id, kind, spaceId, spaceName, title, evidence, optional typed action, ruleVersion, evidenceFamily, priority, expiresAt. Evidence contains sourceLabel, observedAt, windowStart, windowEnd, sampleCount, distinctUnit='session', ruleId, collectionCoverageStart.

Use booking intent only for booking recommendations; contact is a distinct category. An action entity proves booking capability only when its strict payload schema has `action_kind=booking` and a server-validated destination. Normalize migrated provisional values explicitly; unknown values do not prove availability. Disable booking recommendations until the action entity schema and actual destination are wired.

Initial rules: setup, current source failure, extracted fact review, booking recurrence, intent pattern, numeric momentum. Defer unanswered-rate recommendations until the runtime persists a validated sufficiency outcome and the rule has an explicit denominator. No retrieval-hit boolean alone proves an answer was helpful.
