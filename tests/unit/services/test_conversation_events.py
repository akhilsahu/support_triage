import asyncio
import uuid
from unittest.mock import patch

from app.orchestra.ai.contracts import (
    ConversationEventData,
    ConversationEventType,
    ConversationExecutionContext,
)
from app.services.conversation_events import record_conversation_event


class _FakeSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.fail_commit = fail_commit
        self.added = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def add(self, row) -> None:
        self.added.append(row)

    async def commit(self) -> None:
        if self.fail_commit:
            raise RuntimeError("event store unavailable")


def _context() -> ConversationExecutionContext:
    return ConversationExecutionContext(
        space_id=uuid.uuid4(),
        chatbot_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
    )


def test_record_conversation_event_commits_redacted_event() -> None:
    session = _FakeSession()
    context = _context()

    with patch("app.services.conversation_events.AsyncSessionLocal", return_value=session):
        recorded = asyncio.run(
            record_conversation_event(
                context=context,
                event_type=ConversationEventType.ANSWER_COMPLETED,
                data=ConversationEventData(
                    agent="support",
                    rag_hit=True,
                    response_ms=40,
                    metadata={"transport": "sse"},
                ),
            )
        )

    assert recorded is True
    assert len(session.added) == 1
    event = session.added[0]
    assert event.space_id == context.space_id
    assert event.event_type == "answer.completed"
    assert event.event_metadata == {"transport": "sse"}


def test_record_conversation_event_fails_open() -> None:
    session = _FakeSession(fail_commit=True)

    with patch("app.services.conversation_events.AsyncSessionLocal", return_value=session):
        recorded = asyncio.run(
            record_conversation_event(
                context=_context(),
                event_type=ConversationEventType.MESSAGE_RECEIVED,
            )
        )

    assert recorded is False
