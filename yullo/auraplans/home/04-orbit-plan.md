# Yullo Home In Your Orbit Implementation Plan

**Goal:** Build the irregular Orbit mosaic from grounded providers while keeping unavailable Nearby and Connection signals absent.

**Architecture:** Orbit is a provider registry over the same Home snapshot. Each provider returns typed candidates; one shared filter/ranker selects one dominant and up to three supporting signals. Providers do not write UI copy to tables.

**Depends on:** `03-intelligence-signals-plan.md`

## Reuse boundary

Pulse and Momentum reuse already-authorized aggregates from `HomeSnapshot`; they do not query or copy conversation text. The provider protocol/ranker is Yullo-owned because its relevance and UI contract are product behavior. Future external Nearby or Connection adapters may reuse neutral HTTP/cache primitives, but their provider records, consent, expiry, and relevance rules require explicit schemas and cannot be stored as conversation events or inferred from knowledge documents.

## Provider contract

Create `app/yullo/services/home/orbit/base.py`:

```python
class OrbitProvider(Protocol):
    kind: OrbitSignalKind
    def collect(self, snapshot: HomeSnapshot, config: HomeRules, now: datetime) -> list[OrbitCandidate]: ...
```

Each candidate contains scope, Space identity when applicable, metric, evidence, relevance, typed action, prominence score, and expiry. The registry is configuration driven so providers can be enabled/disabled without changing composition code.

## Release-1 providers

### Pulse

Input: recent Aura `conversation.started`, approved intent, retrieval, and answer events for one owned Space.

Generation: group by Space and bounded window; count distinct sessions; qualify only above a minimum sample. Example: “Northstar is getting noticed” with `7 visitor sessions in 7 days`. “Returned more than once” remains prohibited until a privacy-reviewed stable visitor identity exists.

Files: `app/yullo/services/home/orbit/pulse.py`.

### Momentum

Input: controlled intent events in current and preceding equal windows.

Generation: require minimum samples in both periods and a configured increase. State only the measured category movement. Example: “Booking questions increased” only when booking intent counts meet the exact comparison thresholds in plan 02. Travel is not an approved intent; no travel trend is available.

Files: `app/yullo/services/home/orbit/momentum.py`.

### Nearby

Release 1 uses `NullNearbyProvider`, returning `[]`. Do not infer location from IP, browser locale, Space name, document text, or user profile prose.

Future activation requires:

- an eligible `yullo_space_entities(entity_type='location')` record with explicit coordinates, visibility and radius settings; owner confirmation or an approved authoritative integration is required;
- an approved external events/place provider;
- provider item ID, source name, coordinates/distance, start/end time, fetched time, expiry, and relevance link to an explicit category/interest;
- background sync that normalizes external data into a provider-owned cache, not `yullo_home_events`.

Files: `app/yullo/services/home/orbit/null_nearby.py`; future `nearby_provider.py` and provider cache migration in a separate plan.

### Connection

Release 1 uses `NullConnectionProvider`, returning `[]`. Do not infer social/network links from shared document words.

Future activation requires public Yullo network profiles, categories, visibility, membership/connection semantics, block/privacy rules, and a mutual relevance algorithm. That belongs in a separate network subsystem plan.

Files: `app/yullo/services/home/orbit/null_connection.py`.

## Selection and UI mapping

Create `app/yullo/services/home/orbit/service.py` to:

1. collect candidates from enabled providers;
2. revalidate owned Space scope and evidence freshness;
3. remove duplicates and overlaps with stronger attention items;
4. select the highest-value dominant signal;
5. select at most three diverse supporting signals;
6. return `null` when no provider has valid output.

The API returns typed actions such as `view_conversation_pattern`, `open_space`, `add_to_space`, or `view_opportunity`. The frontend resolves routes and uses the existing editorial mosaic. Unknown actions are omitted.

## Motion and presentation boundary

The backend supplies semantic roles (`dominant`/`supporting`, kind, metric, evidence). It does not send animation instructions, coordinates, CSS, or arbitrary HTML. The frontend owns Notice, Connect, Activity, and Reveal motion and honors reduced motion.

## Implementation steps

- [ ] Define provider and candidate contracts.
- [ ] Implement Pulse and Momentum from the snapshot.
- [ ] Implement explicit null providers for Nearby and Connection.
- [ ] Add configuration-driven provider registration.
- [ ] Add shared validation/ranking/diversity selection.
- [ ] Map results to the API Orbit schema.
- [ ] Keep the entire section absent when no candidate qualifies.

## Completion evidence

- Orbit displays only Pulse/Momentum backed by current events.
- Nearby and Connection are invisible, not fixture-backed.
- Each Space-derived signal remains scoped to exactly one owned Space.
- Provider failures omit that provider and do not break Home.


## Concrete orchestration contract

Create `orbit/registry.py:build_orbit_providers(config) -> tuple[OrbitProvider,...]`. Inject `PulseProvider`, `MomentumProvider`, `NullNearbyProvider`, `NullConnectionProvider` into `orbit/service.py:collect_orbit_candidates(snapshot,config,now)`. These are synchronous pure functions; they consume plan 02 aggregates and perform no I/O or database writes.

`PulseProvider.collect`: for each owned Space, take production conversation.started DISTINCT session_id count in the last7d; require >=5; construct candidate `pulse:{space_id}:{day_anchor}:v1`, title='{count} conversations this week', evidence with actual count/window/latest event. Do not count empty sessions, message rows, or unique visitors.

`MomentumProvider.collect`: call `signals/momentum.py:evaluate`; reuse its rule/evidence family unchanged so Home cannot present the same claim twice. Candidate expiry is window_end+24h. All candidates are recomputed each GET.

`select_home_signals` applies enabled sections, assigns evidence families globally, then `orbit/service.py:compose_orbit(selected)` sorts by priority desc, observedAt desc, stable id asc. Highest eligible item becomes dominant; at most3 remaining candidates become supporting. Prefer different Spaces and different signal kinds for supporting slots; fewer than4 is valid. Zero items =>null. One item expands in UI.

No Nearby input writer exists, so NullNearbyProvider returns []. No network graph/membership writer exists, so NullConnectionProvider returns []. No LLM fills these gaps. Enablement is `orbit.providers.pulse=true,momentum=true,nearby=false,connection=false`; enabled unavailable providers still return no fabricated data.

Example: 8 distinct production sessions for S qualifies one pulse; all other owned Spaces below5 => one dominant pulse and no supporting items. A refresh with no new event produces the same ID. Hide Orbit via preference => no Orbit section; other sections can receive otherwise eligible candidates.
