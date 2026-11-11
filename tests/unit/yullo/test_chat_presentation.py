from functools import partial
from app.orchestra.ai.inference.streaming import prepare_response
from app.orchestra.ai.prompts.yullo.composer import compose_reply_messages
from app.orchestra.ai.config import OrchestraConfig
import json
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.yullo.schemas.retrieval import EvidencePack, YulloExecutionContext
from app.orchestra.ai.ui_render.source_images import ChatImagePresentation

from app.orchestra.ai.inference.streaming import generate_response


def test_image_parser_handles_split_chunks_and_only_authorized_urls():
    parser = ChatImagePresentation([{'id': 'approved', 'url': 'https://example.com/jeans.jpg'}])
    output = ''.join(parser.feed(part) for part in [
        'These jeans are listed in the source. !', '[Men jeans](https://example.com/',
        'jeans.jpg)\n\n[View selection](https://example.com/jeans)',
        '![Unknown](https://invented.invalid/image)',
    ]) + parser.feed('', final=True)
    assert parser.image_ids == ['approved']
    assert '![' not in output and 'invented.invalid' not in output
    assert '[View selection](https://example.com/jeans)' in output


@pytest.mark.asyncio
async def test_product_markdown_image_becomes_a_verified_chat_card(monkeypatch):
    image = {'id': 'a' * 64, 'url': 'https://example.com/jeans.jpg', 'caption': 'Men jeans', 'sourceTitle': 'Jeans collection'}
    retrieval = AsyncMock()
    retrieval.retrieve.return_value = EvidencePack(images=[image], passages=[{'content': 'Jeans collection', 'meta': {}}])
    async def stream(_message):
        for text in ['Here is the collection. ![Men ', 'jeans](https://example.com/jeans.jpg)', '\n[View jeans](https://example.com/jeans)']:
            yield ('content', text)
    monkeypatch.setattr('app.orchestra.ai.inference.factory.build_prepared_executor',
                        lambda **kwargs: NS(stream=stream, last_output=None))
    from app.yullo.schemas.inference import SpaceChatProfile
    monkeypatch.setattr('app.services.ai_usage.record_usage_event', AsyncMock())
    prepare = partial(
        prepare_response, retrieve=retrieval.retrieve, expand=retrieval.expand,
        load_profile=AsyncMock(return_value=SpaceChatProfile()), load_entities=AsyncMock(return_value=[]),
        compose=compose_reply_messages, gallery_limit=4,
    )
    events = [json.loads(chunk) async for chunk in generate_response(YulloExecutionContext(space_id=uuid4(), kb_ids=[]), 'Show jeans', [], prepare=prepare, execution={'cfg': OrchestraConfig(), 'history': NS(db=None, session_id='test', user_id='test')})]
    text = ''.join(e['delta'] for e in events if e['type'] == 'text.delta')
    assert '![' not in text and 'preview unavailable' not in text
    assert '[View jeans](https://example.com/jeans)' in text
    assert {'type': 'ui.add', 'node': {'type': 'images', 'imageIds': [image['id']]}} in events
    assert events[-1]['type'] == 'message.done'


def test_markdown_image_examples_inside_code_remain_code():
    parser = ChatImagePresentation([{'id': 'approved', 'url': 'https://example.com/image'}])
    chunks = ['Example: `', '``markdown\n![Example](https://example.com/image)\n``', '`\nDone!']
    output = ''.join(parser.feed(chunk) for chunk in chunks) + parser.feed('', final=True)
    assert output == ''.join(chunks)
    assert parser.image_ids == []
