from functools import partial
from app.orchestra.ai.inference.streaming import prepare_response
from app.orchestra.ai.prompts.yullo.composer import compose_reply_messages
from app.orchestra.ai.config import OrchestraConfig
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.orchestra.ai.prompts.yullo.base import BASE_PROMPT
from app.orchestra.ai.prompts.yullo.composer import compose_prompt
from app.orchestra.ai.prompts.yullo.composer import load_chat_profile
from app.yullo.schemas.inference import SpaceChatProfile
from app.orchestra.ai.knowledge.base import prepare_retrieval_query
from app.yullo.schemas.retrieval import YulloExecutionContext


def test_identity_is_data_and_common_instructions_do_not_select_a_domain():
    profile = SpaceChatProfile(name='Amazon', category='')
    prompt = compose_prompt(profile, ['show_ui_card'])
    assert 'Actual tools available for this reply: show_ui_card' in prompt
    assert '"name": "Amazon"' in prompt
    assert 'Domain:' not in prompt and 'Intent:' not in prompt
    assert BASE_PROMPT in prompt


def test_followup_uses_visitor_context_not_hallucinated_assistant_context():
    history = [NS(role='user', message='Show women shoes'), NS(role='assistant', message='Unrelated jeans')]
    query = prepare_retrieval_query('What about under 500?', history)
    assert 'women shoes' in query
    assert 'jeans' not in query
    assert prepare_retrieval_query('How do returns work?', history) == 'How do returns work?'
    assert 'women shoes' in prepare_retrieval_query("What's its price?", history)


@pytest.mark.asyncio
async def test_profile_load_is_read_only_space_scoped_and_ignores_suggested_category():
    space_id = uuid4()
    db = AsyncMock()
    db.execute.return_value = NS(first=lambda: (NS(display_name='My Space'), NS(purpose='business', parent_space_id=None), NS(settings={
        'identity': {'category': 'Real estate', 'category_source': 'aura', 'description': 'Approved saved description'},
    })))
    profile = await load_chat_profile(db, YulloExecutionContext(space_id=space_id, kb_ids=[]))
    assert profile.category == ''
    assert profile.description == 'Approved saved description'
    sql = str(db.execute.call_args.args[0].compile(compile_kwargs={'literal_binds': True}))
    assert str(space_id).replace('-', '') in sql.replace('-', '')
    assert "spaces.product = 'yullo'" in sql and "lifecycle_status = 'live'" in sql
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_space_does_not_get_a_fabricated_profile():
    db = AsyncMock()
    db.execute.return_value = NS(first=lambda: None)
    with pytest.raises(ValueError, match='Space is unavailable'):
        await load_chat_profile(db, YulloExecutionContext(space_id=uuid4(), kb_ids=[]))


@pytest.mark.asyncio
@pytest.mark.parametrize('question', ['Explain the company history', 'Show product photos'])
async def test_runtime_uses_common_prompt_and_authorized_images_without_intent_gate(monkeypatch, question):
    import json
    from app.yullo.schemas.retrieval import EvidencePack

    from app.orchestra.ai.inference.streaming import generate_response
    image = {'id': 'a' * 64, 'url': 'https://example.com/photo.jpg', 'caption': 'Product photo', 'sourceTitle': 'Catalog'}
    retriever = AsyncMock()
    retriever.retrieve.return_value = EvidencePack(images=[image])
    profile = SpaceChatProfile(name='Example shop', category='Online retail')
    monkeypatch.setattr('app.services.ai_usage.record_usage_event', AsyncMock())
    captured = {}
    async def stream(_message):
        yield ('content', 'Answer from context.')
    def executor(**kwargs):
        captured.update(kwargs)
        return NS(stream=stream, last_output=None)
    monkeypatch.setattr('app.orchestra.ai.inference.factory.build_prepared_executor', executor)
    prepare = partial(
        prepare_response, retrieve=retriever.retrieve, expand=retriever.expand,
        load_profile=AsyncMock(return_value=profile), load_entities=AsyncMock(return_value=[]),
        compose=compose_reply_messages, gallery_limit=4,
    )
    events = [json.loads(chunk) async for chunk in generate_response(YulloExecutionContext(space_id=uuid4(), kb_ids=[]), question, [], prepare=prepare, execution={'cfg': OrchestraConfig(), 'history': NS(db=None, session_id='test', user_id='test')})]
    assert events[-1]['type'] == 'message.done'
    request = captured
    prompt = '\n'.join(message['content'] for message in request['messages'])
    assert 'Domain:' not in prompt and 'Intent:' not in prompt
    assert image['id'] in prompt
    assert [tool.name for tool in request['tools']] == ['show_source_images']
