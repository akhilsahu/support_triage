import uuid

import pytest

from app.yullo.api.public import stream_aura_chat
from app.yullo.schemas.inference import AuraInferenceRequest


class _Runtime:
    async def __call__(self, _request):
        yield '{"type":"message.start","messageId":"m1"}\n'
        yield '{"type":"message.done"}\n'


class _DB:
    async def scalar(self, _statement):
        return True

    async def scalars(self, _statement):
        from types import SimpleNamespace
        return SimpleNamespace(all=lambda: [])


@pytest.mark.asyncio
async def test_public_chat_frames_runtime_json_as_sse():
    space_id = uuid.uuid4()
    session_id = uuid.uuid4()
    request = AuraInferenceRequest(
        space_id=space_id,
        session_id=str(session_id),
        message="Hello",
    )

    response = await stream_aura_chat(
        space_id=space_id,
        session_id=session_id,
        request=request,
        db=_DB(),
        chat=_Runtime(),
    )
    chunks = [chunk async for chunk in response.body_iterator]

    assert chunks == [
        'data: {"type":"message.start","messageId":"m1"}\n\n',
        'data: {"type":"message.done"}\n\n',
    ]
