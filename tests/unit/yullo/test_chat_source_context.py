from app.orchestra.ai.inference.streaming import prepare_response
from app.orchestra.ai.prompts.yullo.composer import compose_reply_messages
from app.orchestra.ai.config import OrchestraConfig
from app.orchestra.ai.ui_render.source_images import validated_image_node
import json
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.yullo.api.public import get_public_chat_image, stream_aura_chat
from app.yullo.schemas.inference import AuraInferenceRequest
from app.yullo.schemas.retrieval import YulloExecutionContext, EvidencePack
from app.orchestra.ai.db_utils.source_loader import published_doc_id, resolve_space_kb_ids, load_published_chat_sources
from app.yullo.services.sources.service import source_images
from app.orchestra.ai.knowledge.retrieval.images_retrieval import select_chat_images as select_images
from app.yullo.config.inference import get_chat_image_config
from functools import partial

select_chat_images = partial(select_images, images_for_source=source_images,
                             doc_id_for_source=published_doc_id, config=get_chat_image_config())



def source(**overrides):
    values = dict(id=uuid4(), space_id=uuid4(), kb_id=uuid4(), title='Projects', source_version=2,
        published_version=2, ingestion_status='ready', source_metadata={'is_confirmed': True, 'assets': {'images': [
            {'url': 'https://example.com/cafe.jpg', 'caption': 'Cafe interior wooden tables'},
            {'url': 'https://example.com/garden.jpg', 'caption': 'Garden outdoor flowers'},
        ]}})
    values.update(overrides)
    return NS(**values)


def test_images_follow_retrieved_source_and_question_not_all_space_images():
    item, unrelated = source(), source()
    passages = [{'content': 'Cafe interior with wooden tables', 'meta': {'doc_id': published_doc_id(item)}}]
    selected = select_chat_images([item, unrelated], passages, 'Show cafe interior')
    assert len(selected) == 1
    assert selected[0]['url'].endswith('cafe.jpg')
    assert selected[0]['sourceId'] == str(item.id)
    assert validated_image_node([selected[0]['id']], selected)['type'] == 'images'
    assert validated_image_node(['invented'], selected) is None
    assert validated_image_node([{}], selected) is None


@pytest.mark.parametrize('changes', [
    {'source_version': 3}, {'published_version': None}, {'ingestion_status': 'processing'},
    {'source_metadata': {'is_confirmed': False}},
    {'source_metadata': {'is_confirmed': True, 'visibility': 'private', 'assets': {'images': [{'url': 'https://example.com/image', 'caption': 'private'}]}}},
])
def test_unpublished_or_private_image_metadata_is_excluded(changes):
    assert source_images(source(**changes)) == []


def test_image_ids_are_space_and_version_bound_and_urls_are_safe():
    item = source()
    first = source_images(item)[0]['id']
    item.space_id = uuid4()
    assert source_images(item)[0]['id'] != first
    item.source_metadata['assets']['images'] = [
        {'url': 'javascript:alert(1)', 'caption': 'Bad'},
        {'url': 'https://user:secret@example.com/image', 'caption': 'Bad'},
        {'url': 'https://example.com/image', 'caption': 'Public', 'visibility': 'private'},
    ]
    assert source_images(item) == []


@pytest.mark.asyncio
async def test_scope_queries_require_active_space_kbs_and_published_confirmed_sources():
    db = AsyncMock()
    db.scalars.return_value = NS(all=lambda: [])
    space_id = uuid4()
    await resolve_space_kb_ids(db, space_id, product="yullo")
    statement = db.scalars.call_args.args[0]
    sql = str(statement.compile(compile_kwargs={'literal_binds': True}))
    assert str(space_id).replace('-', '') in sql.replace('-', '')
    assert 'knowledge_bases.active IS true' in sql and "spaces.product = 'yullo'" in sql
    await load_published_chat_sources(db, space_id, [uuid4()], product="yullo")
    sql = str(db.scalars.call_args.args[0].compile(compile_kwargs={'literal_binds': True}))
    assert "ingestion_status = 'ready'" in sql and 'published_version > 0' in sql and 'is_confirmed' in sql


@pytest.mark.asyncio
async def test_public_chat_replaces_caller_kbs_with_space_kbs(monkeypatch):
    space_id, own_kb, foreign_kb = uuid4(), uuid4(), uuid4()
    monkeypatch.setattr('app.yullo.api.public._require_public_space', AsyncMock())
    resolver = AsyncMock(return_value=[own_kb])
    monkeypatch.setattr('app.orchestra.ai.db_utils.source_loader.resolve_space_kb_ids', resolver)
    captured = []
    async def stream(request):
        captured.append(request.kb_ids)
        yield '{"type":"message.done"}'
    request = AuraInferenceRequest(space_id=space_id, session_id=str(uuid4()), message='Hi', kb_ids=[foreign_kb])
    response = await stream_aura_chat(space_id, request.session_id, request, db=AsyncMock(), chat=stream)
    _ = [chunk async for chunk in response.body_iterator]
    assert captured == [[own_kb]]
    resolver.assert_awaited_once()


@pytest.mark.asyncio
async def test_retrieval_combines_verified_facts_and_published_chunks(monkeypatch, retrieve_for):
    item = source(source_version=3, published_version=2)
    db = AsyncMock()
    db.scalars.side_effect = [NS(all=lambda: [item.kb_id]), NS(all=lambda: [item])]
    db.execute.return_value = NS(all=lambda: [])  # Contact evidence
    fact = NS(id=uuid4(), subject='Cafe', label='Hours', value='9–5', source_item_id=item.id, review_status='owner_confirmed')
    facts = AsyncMock(return_value=[fact])
    monkeypatch.setattr('app.orchestra.ai.db_utils.get_facts.get_authoritative_facts', facts)
    docs = [
        NS(content='Published cafe', meta_data={'doc_id': published_doc_id(item), 'client_id': str(item.space_id)}),
        NS(content='Draft cafe', meta_data={'doc_id': f'knowledge:{item.id}:v3', 'client_id': str(item.space_id)}),
        NS(content='Other tenant', meta_data={'doc_id': published_doc_id(item), 'client_id': str(uuid4())}),
    ]
    backend = MagicMock()
    backend.for_agent.return_value = NS(has_knowledge=True, knowledge=NS(search=MagicMock(return_value=docs)), filters={})
    pack = await retrieve_for(db, backend)(YulloExecutionContext(space_id=item.space_id, kb_ids=[]), 'Cafe')
    assert [p['content'] for p in pack.passages] == ['Published cafe']
    assert pack.structured_facts[0]['value'] == '9–5'
    assert pack.images == []  # New metadata cannot represent the previous published revision.
    backend.for_agent.assert_called_once_with(space_id=str(item.space_id), specific_doc_ids=[published_doc_id(item)])
    facts.assert_awaited_once_with(db, space_id=item.space_id, kb_id=item.kb_id)


@pytest.mark.asyncio
async def test_foreign_kb_subset_never_reaches_facts_or_vectors(retrieve_for):
    db = AsyncMock()
    db.scalars.return_value = NS(all=lambda: [uuid4()])
    backend = MagicMock()
    pack = await retrieve_for(db, backend)(YulloExecutionContext(space_id=uuid4(), kb_ids=[uuid4()]), 'Secret')
    assert not pack.passages and not pack.structured_facts
    backend.for_agent.assert_not_called()
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_chat_image_lookup_revalidates_source_and_space(monkeypatch):
    item = source()
    image = source_images(item)[0]
    monkeypatch.setattr('app.yullo.api.public._require_public_space', AsyncMock())
    monkeypatch.setattr('app.orchestra.ai.db_utils.source_loader.resolve_space_kb_ids', AsyncMock(return_value=[item.kb_id]))
    load = AsyncMock(return_value=[item])
    monkeypatch.setattr('app.orchestra.ai.db_utils.source_loader.load_published_chat_sources', load)
    response = await get_public_chat_image(item.space_id, image['id'], AsyncMock())
    assert json.loads(response.body)['url'] == image['url']
    assert response.headers['cache-control'] == 'no-store'
    item.source_metadata['is_confirmed'] = False
    with pytest.raises(HTTPException) as error:
        await get_public_chat_image(item.space_id, image['id'], AsyncMock())
    assert error.value.status_code == 404

@pytest.mark.asyncio
async def test_model_receives_image_context_and_emits_only_valid_image_ids(monkeypatch):

    from app.orchestra.ai.inference.streaming import generate_response
    item = source()
    image = source_images(item)[0]
    retrieval = AsyncMock()
    retrieval.retrieve.return_value = EvidencePack(images=[image])
    captured = {}
    async def stream(_message):
        tool = next(tool for tool in captured['tools'] if tool.name == 'show_source_images')
        await tool.entrypoint(image_ids=[image['id']])
        yield ('content', '')
    def executor(**kwargs):
        captured.update(kwargs)
        return NS(stream=stream, last_output=None)
    monkeypatch.setattr('app.orchestra.ai.inference.factory.build_prepared_executor', executor)
    from app.yullo.schemas.inference import SpaceChatProfile
    monkeypatch.setattr('app.services.ai_usage.record_usage_event', AsyncMock())
    prepare = partial(
        prepare_response, retrieve=retrieval.retrieve, expand=retrieval.expand,
        load_profile=AsyncMock(return_value=SpaceChatProfile()), load_entities=AsyncMock(return_value=[]),
        compose=compose_reply_messages, gallery_limit=4,
    )
    events = [json.loads(chunk) async for chunk in generate_response(YulloExecutionContext(space_id=item.space_id, kb_ids=[]), 'Show cafe', [], prepare=prepare, execution={'cfg': OrchestraConfig(), 'history': NS(db=None, session_id='test', user_id='test')})]
    assert {'type': 'ui.add', 'node': {'type': 'images', 'imageIds': [image['id']]}} in events
    assert events[-1]['type'] == 'message.done'
    prompt = str(captured['messages'])
    assert image['id'] in prompt and image['caption'] in prompt
    assert image['url'] not in prompt


def test_images_use_all_retrieved_chunks_for_a_source():
    item = source()
    passages = [
        {'content': 'Cafe interior wooden tables', 'meta': {'doc_id': published_doc_id(item)}},
        {'content': 'Opening hours and menu', 'meta': {'doc_id': published_doc_id(item)}},
    ]
    selected = select_chat_images([item], passages, 'Show cafe images')
    assert len(selected) == 1 and selected[0]['url'].endswith('cafe.jpg')


def test_women_query_rejects_unrelated_page_context_and_delivery_badges():
    item = source()
    item.source_metadata['assets']['images'] = [
        {'url': 'https://example.com/badge.jpg', 'alt': 'Free delivery and easy returns'},
        {'url': 'https://example.com/bags.jpg', 'alt': 'Souled store Bewakoof', 'context_text': 'Women bags backpacks'},
        {'url': 'https://example.com/women.jpg', 'alt': 'Women cotton dresses'},
    ]
    passages = [{'content': 'Women bags dresses delivery returns', 'meta': {'doc_id': published_doc_id(item)}}]
    images = select_chat_images([item], passages, 'Suggest something for women')
    assert len(images) == 1 and images[0]['url'].endswith('women.jpg')
    assert len(source_images(item)) == 3  # Retained for explicit delivery/returns requests, not product suggestions.


def test_image_links_come_from_exact_source_association_not_guessed_urls():
    item = source(source_locator='https://www.amazon.in/')
    item.source_metadata['assets']['images'] = [{
        'url': 'https://images.example.com/dress.jpg', 'alt': 'Women dress',
        'context_text': '[![Women dress](https://images.example.com/dress.jpg)](https://www.amazon.in/dp/EXAMPLE)',
    }]
    image = source_images(item)[0]
    assert image['destinationUrl'] == 'https://www.amazon.in/dp/EXAMPLE'
    assert image['linkKind'] == 'item'
    item.source_metadata['assets']['images'][0]['context_text'] = 'Women dress'
    image = source_images(item)[0]
    assert image['destinationUrl'] == 'https://www.amazon.in/'
    assert image['linkKind'] == 'source'


@pytest.mark.parametrize('query, expected', [
    ('Show something cool', False),
    ('Suggest something for women', False),
    ('Show delivery options', True),
    ('Tell me about shipping', True),
    ('What is the return policy?', True),
    ('Returns for women clothing?', True),
])
def test_delivery_returns_graphics_require_a_matching_request(query, expected):
    item = source()
    item.source_metadata['assets']['images'] = [
        {'url': 'https://example.com/info.jpg', 'alt': 'Free delivery and easy returns'},
    ]
    passages = [{'content': 'Free delivery and easy returns', 'meta': {'doc_id': published_doc_id(item)}}]
    images = select_chat_images([item], passages, query)
    assert bool(images) == expected
    if images:
        # Query gating must not make a selected reference unresolvable by the image API.
        assert images[0]['id'] == source_images(item)[0]['id']
