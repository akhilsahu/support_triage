from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.orchestra.ai.knowledge.extraction import source_extraction as extraction
from app.yullo.config.inference import get_source_extraction_options
from app.yullo.services.entities.payloads import validate_entity_payload


TEXT = 'Morgan Stanley & Co. LLC provides copies of the prospectus by email at prospectus@morganstanley.com.'


def chunk(text=TEXT):
    return {'id': 'chunk-1', 'content': text, 'metadata': {'source_text': text, 'page': 12, 'filename': 'document.pdf'}}


def output():
    return {'facts': [], 'entities': [{
        'entity_type': 'contact_channel', 'chunk_index': 0, 'schema_version': 1,
        'payload_json': {'label': 'Prospectus requests', 'channel': 'email',
                         'value': 'prospectus@morganstanley.com', 'organization': 'Morgan Stanley & Co. LLC',
                         'purpose': 'copies of the prospectus', 'relationship': 'third_party'},
        'evidence_locators': [{'evidence_excerpt': TEXT}],
    }]}


def test_contact_keeps_context_and_provenance():
    result = extraction._validate_batch(output(), [chunk()], 'doc-v1', 'SpaceX', config=get_source_extraction_options())
    entity = result.entities[0]
    assert entity.payload_json['relationship'] == 'third_party'
    assert entity.payload_json['purpose'] == 'copies of the prospectus'
    assert entity.evidence_locators[0]['page'] == 12
    assert entity.evidence_locators[0]['source_chunk_id'] == 'chunk-1'


def test_unsupported_contact_context_removed():
    data = output()
    data['entities'][0]['payload_json'].update(organization='SpaceX', purpose='General enquiries', relationship='space_owner')
    result = extraction._validate_batch(data, [chunk()], 'doc-v1', 'SpaceX', config=get_source_extraction_options())
    assert result.entities[0].payload_json['organization'] is None
    assert result.entities[0].payload_json['purpose'] is None
    assert result.entities[0].payload_json['relationship'] == 'unknown'


def test_invalid_entity_shape_does_not_discard_facts():
    result = extraction._validate_batch({'facts': [], 'entities': None}, [chunk()], 'doc', config=get_source_extraction_options())
    assert result.facts == []
    assert result.entities is None
    assert result.entity_error == 'invalid_entities_response'


def test_malformed_locator_is_rejected():
    data = output()
    data['entities'][0]['evidence_locators'] = None
    assert extraction._validate_batch(data, [chunk()], 'doc', config=get_source_extraction_options()).entities == []


def test_existing_contact_payload_compatible():
    result = validate_entity_payload('contact_channel', 1, {'label': 'Email', 'channel': 'email', 'value': 'hello@example.com'})
    assert result['relationship'] == 'unknown'


@pytest.mark.asyncio
async def test_one_call_per_batch_for_both_outputs(monkeypatch):
    store = SimpleNamespace(get_doc_chunks=lambda *args: [chunk()])
    monkeypatch.setattr(extraction, 'get_vector_store', lambda: store)
    complete = AsyncMock(return_value=output())
    monkeypatch.setattr(extraction, '_complete', complete)
    monkeypatch.setattr(settings, 'YULLO_ENTITY_EXTRACTION_ENABLED', True)
    progress = []
    result = await extraction.extract_source_knowledge(space_id='space', doc_id='doc', space_name='SpaceX', progress_cb=lambda *args: progress.append(args), config=get_source_extraction_options())
    assert complete.await_count == 1
    assert result.facts == [] and len(result.entities) == 1
    assert progress[-1] == ('understanding', 1, 1)


def test_oversized_input_not_truncated(monkeypatch):
    monkeypatch.setattr(settings, 'YULLO_KNOWLEDGE_BATCH_CHARACTERS', 1000)
    text = 'abcde' * 550
    batches = extraction._batches([chunk(text)], config=get_source_extraction_options())
    assert ''.join(extraction._source_text(batch[0]) for batch in batches) == text


@pytest.mark.asyncio
async def test_truncated_output_is_failure(monkeypatch):
    response = SimpleNamespace(choices=[SimpleNamespace(finish_reason='length', message=SimpleNamespace(content='{"facts": []}'))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(return_value=response))))
    monkeypatch.setattr(extraction, 'get_async_openai_clients', lambda **kwargs: [('mock', client, 'mock-model')])
    with pytest.raises(RuntimeError):
        await extraction._complete('source', 'SpaceX', config=get_source_extraction_options())


def test_combined_validation_preserves_prose_and_rejects_wrong_table_row():
    prose = chunk('Starship carries crew and cargo.')
    row = chunk('FALCON HEAVY — Payload Capacity to LEO: 64 Metric Tons.')
    row['metadata']['is_table_row'] = True
    result = extraction._validate_batch({'entities': [], 'facts': [
        {'subject': 'Starship', 'label': 'Capability', 'value': 'carries crew and cargo',
         'chunk_index': 0, 'evidence_excerpt': 'Starship carries crew and cargo.'},
        {'subject': 'FALCON 9', 'label': 'Payload Capacity to LEO', 'value': '64 Metric Tons',
         'chunk_index': 1, 'evidence_excerpt': 'FALCON HEAVY — Payload Capacity to LEO: 64 Metric Tons.'},
    ]}, [prose, row], 'doc', config=get_source_extraction_options())
    assert len(result.facts) == 1
    assert result.facts[0]['subject'] == 'Starship'
    assert result.facts.diagnostics['rejected'] == 1


@pytest.mark.asyncio
async def test_answer_context_retains_contact_purpose_and_current_source(monkeypatch, retrieve_for):
    import uuid
    from app.yullo.schemas.retrieval import YulloExecutionContext

    space_id, kb_id, source_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    payload = output()['entities'][0]['payload_json']
    entity = SimpleNamespace(id=uuid.uuid4(), payload_json=payload, field_policies={}, disclosure_mode=None, review_status='owner_confirmed')
    source = SimpleNamespace(id=source_id, source_metadata={'is_confirmed': True})
    evidence = SimpleNamespace(source_version=1, locator_metadata={'page': 12, 'evidence_excerpt': TEXT})
    contact_rows = SimpleNamespace(all=lambda: [(entity, evidence, source)])
    db = SimpleNamespace(
        execute=AsyncMock(return_value=contact_rows),
        scalars=AsyncMock(side_effect=[SimpleNamespace(all=lambda: [kb_id]), SimpleNamespace(all=lambda: [])]),
    )
    monkeypatch.setattr('app.orchestra.ai.db_utils.get_facts.get_authoritative_facts', AsyncMock(return_value=[]))
    backend = SimpleNamespace(for_agent=lambda **kwargs: SimpleNamespace(has_knowledge=False, knowledge=None))
    pack = await retrieve_for(db, backend)(YulloExecutionContext(space_id=space_id, kb_ids=[kb_id]), 'Where can I request a prospectus?')
    assert pack.structured_facts[0]['subject'] == 'Morgan Stanley & Co. LLC'
    assert pack.structured_facts[0]['label'] == 'copies of the prospectus'
    assert pack.structured_facts[0]['relationship'] == 'third_party'
    assert pack.structured_facts[0]['source_item_id'] == str(source_id)
    assert pack.structured_facts[0]['source_page'] == 12


def test_action_url_must_occur_in_cited_chunk():
    data = {'facts': [], 'entities': [{
        'entity_type': 'action', 'chunk_index': 0, 'schema_version': 1,
        'payload_json': {'label': 'Read details', 'kind': 'external_link', 'destination_url': 'https://example.com/details'},
        'evidence_locators': [{'evidence_excerpt': 'Read details'}],
    }]}
    assert extraction._validate_batch(data, [chunk('Read details https://example.com/other')], 'doc', config=get_source_extraction_options()).entities == []
    assert len(extraction._validate_batch(data, [chunk('Read details https://example.com/details')], 'doc', config=get_source_extraction_options()).entities) == 1


@pytest.mark.asyncio
async def test_duplicate_entities_keep_all_chunk_references(monkeypatch):
    one, two = chunk(), chunk()
    two['id'], two['metadata']['page'] = 'chunk-2', 13
    monkeypatch.setattr(extraction, 'get_vector_store', lambda: SimpleNamespace(get_doc_chunks=lambda *args: [one, two]))
    data = output()
    import copy
    duplicate = copy.deepcopy(data['entities'][0])
    duplicate['chunk_index'] = 1
    data['entities'].append(duplicate)
    monkeypatch.setattr(extraction, '_complete', AsyncMock(return_value=data))
    monkeypatch.setattr(settings, 'YULLO_ENTITY_EXTRACTION_ENABLED', True)
    result = await extraction.extract_source_knowledge(space_id='space', doc_id='doc', space_name='SpaceX', config=get_source_extraction_options())
    assert len(result.entities) == 1
    assert [loc['page'] for loc in result.entities[0].evidence_locators] == [12, 13]
