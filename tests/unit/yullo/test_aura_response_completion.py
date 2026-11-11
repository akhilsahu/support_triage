import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.yullo.schemas.inference import AuraInferenceRequest
from app.yullo.adapters.conversations import YulloConversationRepository
from app.orchestra.ai.config import OrchestraConfig


def repository_for(events):
    repository = YulloConversationRepository(AsyncMock())
    repository.history = AsyncMock(return_value=[])
    repository.append_user = AsyncMock()
    repository.append_aura = AsyncMock()

    async def stream(*args, **kwargs):
        for event in events:
            yield json.dumps(event) + '\n'

    return repository, stream


@pytest.mark.asyncio
@pytest.mark.parametrize('complete', [True, False])
async def test_only_complete_responses_are_persisted_and_done_follows_commit(complete, monkeypatch):
    events = [{'type': 'text.delta', 'delta': 'Answer'}]
    events.append({'type': 'message.done'} if complete else {'type': 'error', 'message': 'Interrupted'})
    repository, generate = repository_for(events)
    native = SimpleNamespace(messages=lambda: [], publish=AsyncMock())
    monkeypatch.setattr('app.orchestra.ai.session.store.StagedHistory.open', AsyncMock(return_value=native))
    repository.db.execute.return_value = SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: object()))
    repository.history.return_value = []
    request = AuraInferenceRequest(space_id=uuid4(), session_id=str(uuid4()), message='Hello')
    received = []
    async for chunk in repository.stream_response(request, generate=generate, cfg=OrchestraConfig()):
        event = json.loads(chunk)
        if event['type'] == 'message.done':
            assert repository.db.commit.await_count == 2
            native.publish.assert_awaited_once()
        received.append(event)
    if complete:
        repository.append_aura.assert_awaited_once()
        assert received[-1]['type'] == 'message.done'
    else:
        repository.append_aura.assert_not_awaited()
        native.publish.assert_not_awaited()
        assert received[-1]['type'] == 'error'
