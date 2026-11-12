import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.space import Space
from app.models.chat import ChatSession
from app.yullo.adapters.conversations import YulloConversationRepository
from app.models.chatbot import Chatbot

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def setup_space(db_session_fixture: AsyncSession):
    s = Space(
        id=uuid.uuid4(), slug=f"yullo-{uuid.uuid4().hex[:6]}", 
        display_name="Yullo Space", email=f"y-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fake", product="yullo"
    )
    db_session_fixture.add(s)
    await db_session_fixture.flush()
    return s

async def test_yullo_conversation_creates_scoped_session(db_session_fixture: AsyncSession, setup_space):
    repo = YulloConversationRepository(db_session_fixture)
    runtime_id = "test_aura_runtime"
    
    session = await repo.start(setup_space.id, runtime_id)
    assert session.runtime_type == "aura"
    assert session.runtime_id == runtime_id
    assert session.chatbot_id is None
    assert session.space_id == setup_space.id
    
    # Append User Message
    log1 = await repo.append_user(session, "Hello Aura")
    assert log1.role == "user"
    assert log1.runtime_type == "aura"
    assert log1.runtime_id == runtime_id
    
    # Append Aura Message
    log2 = await repo.append_aura(session, "Hello User", citations=[], blocks=[{"type": "text"}])
    assert log2.role == "assistant"
    assert log2.runtime_type == "aura"
    assert len(log2.blocks) == 1
    
    # Check history
    history = await repo.history(str(session.id))
    assert len(history) == 2
    assert history[0].id == log1.id
    assert history[1].id == log2.id

async def test_yullo_conversation_rejects_cross_product(db_session_fixture: AsyncSession, setup_space):
    repo = YulloConversationRepository(db_session_fixture)
    
    # Create a Support247 session manually
    chatbot = Chatbot(
        id=uuid.uuid4(),
        space_id=setup_space.id,
        slug="test-chatbot",
        display_name="Test Chatbot"
    )
    db_session_fixture.add(chatbot)
    await db_session_fixture.flush()
    
    support_session = ChatSession(
        id=uuid.uuid4(),
        space_id=setup_space.id,
        chatbot_id=chatbot.id,
        runtime_type="chatbot",
        runtime_id=str(chatbot.id),
        status="open",
        message_count=0
    )
    db_session_fixture.add(support_session)
    await db_session_fixture.flush()
    
    # Trying to append via Yullo repo should fail
    with pytest.raises(ValueError, match="Cannot append user message to non-Aura session"):
        await repo.append_user(support_session, "This should fail")
        
    with pytest.raises(ValueError, match="Cannot append Aura message to non-Aura session"):
        await repo.append_aura(support_session, "This should fail")
        
    # Trying to load history should fail
    with pytest.raises(ValueError, match="Session not found or not an Aura session"):
        await repo.history(str(support_session.id))

async def test_yullo_conversation_block_validation(db_session_fixture: AsyncSession, setup_space):
    repo = YulloConversationRepository(db_session_fixture)
    session = await repo.start(setup_space.id, "aura_runtime")
    
    with pytest.raises(ValueError, match="Invalid block format"):
        await repo.append_aura(session, "Message", blocks=[{"invalid": "block"}])
