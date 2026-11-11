import uuid

import pytest

from app.yullo.services.entities.extraction import validate_entity_candidate


class _Provider:
    async def extract(self, *, source_text: str, allowed_types: list[str]) -> list[dict]:
        return [
            {
                "entity_type": "offering",
                "schema_version": 1,
                "payload_json": {"name": "Brand strategy"},
                "evidence_locators": [
                    {"evidence_excerpt": "We provide brand strategy for early-stage startups."}
                ],
            },
            {
                "entity_type": "offering",
                "schema_version": 1,
                "payload_json": {"name": "Invented service"},
                "evidence_locators": [{"evidence_excerpt": "This text is not in the source."}],
            },
        ]


@pytest.mark.asyncio
async def test_entity_candidates_require_verbatim_source_evidence():
    source = 'We provide brand strategy for early-stage startups.'
    raw = await _Provider().extract(source_text=source, allowed_types=[])
    candidates = [candidate for item in raw if (candidate := validate_entity_candidate(item, source))]


    assert [candidate.payload_json["name"] for candidate in candidates] == ["Brand strategy"]


class _MisclassifiedCtaProvider:
    async def extract(self, *, source_text: str, allowed_types: list[str]) -> list[dict]:
        return [
            {
                "entity_type": "contact_channel",
                "schema_version": 1,
                "payload_json": {
                    "label": "Reserve Your Ride",
                    "channel": "website",
                    "value": "https://www.spacex.com/rideshare",
                },
                "evidence_locators": [
                    {"evidence_excerpt": "Reserve Your Ride"}
                ],
            }
        ]


@pytest.mark.asyncio
async def test_explicit_website_cta_is_normalized_to_action():
    source = 'Reserve Your Ride https://www.spacex.com/rideshare'
    raw = await _MisclassifiedCtaProvider().extract(source_text=source, allowed_types=[])
    candidates = [candidate for item in raw if (candidate := validate_entity_candidate(item, source))]


    assert len(candidates) == 1
    assert candidates[0].entity_type == "action"
    assert candidates[0].payload_json == {
        "label": "Reserve Your Ride",
        "kind": "booking",
        "destination_url": "https://www.spacex.com/rideshare",
        "organization": None, "purpose": None, "relationship": "unknown",
    }


def test_neutral_label_uses_only_evidenced_purpose_and_preserves_context():
    from app.yullo.services.entities.extraction import _normalize_candidate_type
    raw = {'entity_type': 'contact_channel', 'payload_json': {
        'label': 'Tickets', 'channel': 'website', 'value': 'https://example.com/visit',
        'purpose': 'Book your visit', 'organization': 'Example Museum', 'relationship': 'third_party',
    }, 'evidence_locators': [{'evidence_excerpt': 'Example Museum: Book your visit'}]}
    result = _normalize_candidate_type(raw)
    assert result['entity_type'] == 'action'
    assert result['payload_json']['kind'] == 'booking'
    assert result['payload_json']['organization'] == 'Example Museum'
    assert result['payload_json']['purpose'] == 'Book your visit'
    raw['payload_json']['purpose'] = 'Order a product'
    assert _normalize_candidate_type(raw)['entity_type'] == 'contact_channel'


def test_url_evidence_requires_complete_destination_and_preserves_path_case():
    from app.yullo.services.entities.extraction import _has_grounded_url
    assert _has_grounded_url('https://example.com/', 'Official website https://example.com')
    assert _has_grounded_url('https://example.com/book?a=1&b=2', 'https://example.com/book?a=1&amp;b=2')
    assert not _has_grounded_url('https://example.com/book', 'https://example.com/book-other')
    assert not _has_grounded_url('https://example.com/Book', 'https://example.com/book')


@pytest.mark.asyncio
async def test_entity_validation_rejects_invented_destination():
    source = 'Reserve Your Ride'
    raw = await _MisclassifiedCtaProvider().extract(source_text=source, allowed_types=[])
    candidates = [candidate for item in raw if (candidate := validate_entity_candidate(item, source))]
    assert candidates == []


@pytest.mark.asyncio
async def test_persistence_keeps_distinct_locators_and_confirmed_payload_on_retry():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, Mock
    from app.yullo.services.entities.extraction import persist_entity_candidates
    from app.yullo.services.entities.contracts import ValidatedEntityCandidate
    from app.models.yullo_space_entity import YulloSpaceEntityEvidence

    entity_id, source_id, space_id, kb_id = [uuid.uuid4() for _ in range(4)]
    item = SimpleNamespace(id=source_id, space_id=space_id, kb_id=kb_id, source_version=1)
    existing = SimpleNamespace(id=entity_id, review_status='owner_confirmed', is_active=True,
                               payload_json={'label': 'Owner-edited label'}, revision=4)
    one, two = {'page': 1, 'evidence_excerpt': 'Book'}, {'page': 2, 'evidence_excerpt': 'Book'}
    candidate = ValidatedEntityCandidate(entity_type='action', payload_json={
        'label': 'Book', 'kind': 'booking', 'destination_url': 'https://example.com/book'},
        evidence_locators=[one, two, two])
    prior = SimpleNamespace(unique=lambda: SimpleNamespace(all=lambda: []))
    db = SimpleNamespace(scalar=AsyncMock(side_effect=[item, existing]),
        scalars=AsyncMock(side_effect=[prior, SimpleNamespace(all=lambda: [SimpleNamespace(locator_metadata=one)])]),
        add=Mock(), flush=AsyncMock())
    await persist_entity_candidates(db, source_item_id=source_id, source_version=1, candidates=[candidate])
    assert db.add.call_count == 1
    import hashlib, json
    legacy_payload = {'label': 'Book', 'kind': 'booking', 'destination_url': 'https://example.com/book'}
    expected_key = 'extracted:action:' + hashlib.sha256(('action:' + json.dumps(legacy_payload, sort_keys=True)).encode()).hexdigest()[:32]
    assert db.scalar.call_args_list[1].args[0].compile().params['identity_key_1'] == expected_key
    record = db.add.call_args.args[0]
    assert isinstance(record, YulloSpaceEntityEvidence)
    assert record.locator_metadata == two and record.source_item_id == source_id
    assert existing.payload_json == {'label': 'Owner-edited label'} and existing.revision == 4
    db.scalar.reset_mock(side_effect=True)
    db.scalar.side_effect = [item, existing]
    db.scalars.side_effect = [prior, SimpleNamespace(all=lambda: [SimpleNamespace(locator_metadata=one), SimpleNamespace(locator_metadata=two)])]
    db.add.reset_mock()
    await persist_entity_candidates(db, source_item_id=source_id, source_version=1, candidates=[candidate])
    assert not db.add.called
