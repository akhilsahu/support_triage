import uuid

import pytest
from pydantic import ValidationError

from app.orchestra.ai.contracts import (
    ConversationChannel,
    ConversationEventData,
    ConversationEventType,
    ConversationExecutionContext,
)


def test_execution_context_serializes_canonical_identifiers() -> None:
    space_id = uuid.uuid4()
    chatbot_id = uuid.uuid4()
    session_id = uuid.uuid4()

    context = ConversationExecutionContext(
        space_id=space_id,
        chatbot_id=chatbot_id,
        session_id=session_id,
        conversation_id="external-conversation",
        channel=ConversationChannel.WEB,
    )

    assert context.space_id_str == str(space_id)
    assert context.chatbot_id_str == str(chatbot_id)
    assert context.session_id_str == str(session_id)
    assert context.conversation_id == "external-conversation"


def test_execution_context_rejects_invalid_uuid() -> None:
    with pytest.raises(ValidationError):
        ConversationExecutionContext(
            space_id="not-a-uuid",
            chatbot_id=uuid.uuid4(),
            session_id=uuid.uuid4(),
        )


def test_execution_context_is_immutable() -> None:
    context = ConversationExecutionContext(
        space_id=uuid.uuid4(),
        chatbot_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
    )

    with pytest.raises(ValidationError):
        context.channel = ConversationChannel.WIDGET


def test_event_contract_uses_stable_wire_values() -> None:
    event = ConversationEventData(
        agent="support",
        intent="troubleshooting",
        rag_hit=True,
        response_ms=125,
        source_count=2,
    )

    assert ConversationEventType.MESSAGE_RECEIVED.value == "message.received"
    assert ConversationEventType.ANSWER_COMPLETED.value == "answer.completed"
    assert event.model_dump(exclude_none=True) == {
        "agent": "support",
        "intent": "troubleshooting",
        "rag_hit": True,
        "response_ms": 125,
        "source_count": 2,
        "metadata": {},
    }


def test_event_contract_rejects_sensitive_metadata_keys() -> None:
    with pytest.raises(ValidationError):
        ConversationEventData(metadata={"Authorization": "Bearer secret"})
