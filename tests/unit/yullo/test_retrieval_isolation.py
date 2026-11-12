import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import MagicMock

from app.yullo.schemas.retrieval import YulloExecutionContext
from app.models.space import Space
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.kb_fact import KBFact
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.knowledge.bundle import KnowledgeBundle

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def setup_two_spaces(db_session_fixture: AsyncSession):
    # Create Space 1 (Yullo)
    s1 = Space(
        id=uuid.uuid4(), slug=f"yullo-{uuid.uuid4().hex[:6]}", 
        display_name="Yullo Space", email=f"y-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fake", product="yullo"
    )
    db_session_fixture.add(s1)
    
    # Create Space 2 (Support247)
    s2 = Space(
        id=uuid.uuid4(), slug=f"s247-{uuid.uuid4().hex[:6]}", 
        display_name="Support Space", email=f"s-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fake", product="support247"
    )
    db_session_fixture.add(s2)
    await db_session_fixture.flush()
    
    # Create KBs
    kb1 = KnowledgeBase(id=uuid.uuid4(), space_id=s1.id, name="Yullo KB")
    kb2 = KnowledgeBase(id=uuid.uuid4(), space_id=s2.id, name="Support KB")
    db_session_fixture.add_all([kb1, kb2])
    await db_session_fixture.flush()
    db_session_fixture.add(KnowledgeBaseItem(
        space_id=s1.id, kb_id=kb1.id, item_type="doc", title="Yullo source",
        doc_id="yullo-test-doc", indexed_doc_id="yullo-test-doc",
        source_version=1, published_version=1, ingestion_status="ready",
        source_metadata={"chunks_enabled": True},
    ))
    await db_session_fixture.flush()
    
    # Add Facts
    f1 = KBFact(kb_id=kb1.id, space_id=s1.id, subject="Pricing", label="Cost", value="100", review_status="owner_confirmed", verified=True)
    f2 = KBFact(kb_id=kb2.id, space_id=s2.id, subject="Pricing", label="Cost", value="200", review_status="owner_confirmed", verified=True)
    
    db_session_fixture.add_all([f1, f2])
    await db_session_fixture.flush()
    
    return s1, kb1, s2, kb2

async def test_retrieval_space_isolation(db_session_fixture: AsyncSession, setup_two_spaces, retrieve_for):
    s1, kb1, s2, kb2 = setup_two_spaces
    
    # Mock backend
    mock_backend = MagicMock(spec=BaseKnowledgeBackend)
    mock_bundle = MagicMock(spec=KnowledgeBundle)
    mock_bundle.has_knowledge = True
    
    class MockDoc:
        def __init__(self, content):
            self.content = content
            self.meta_data = {"doc_id": "yullo-test-doc", "client_id": str(s1.id)}
            
    mock_knowledge = MagicMock()
    mock_knowledge.max_results = 12
    mock_knowledge.vector_db = None
    # Mock search to be synchronous because Agno's search is synchronous
    mock_knowledge.search.return_value = [MockDoc("Yullo passage")]
    
    mock_bundle.knowledge = mock_knowledge
    mock_bundle.filters = {"client_id": str(s1.id)}
    mock_backend.for_agent.return_value = mock_bundle
    
    retrieve = retrieve_for(db_session_fixture, mock_backend)
    
    context = YulloExecutionContext(
        space_id=s1.id,
        kb_ids=[kb1.id],
        published_version=1
    )
    
    evidence = await retrieve(context, query="What is the pricing?")
    
    # Verify Space 1's facts are returned
    assert len(evidence.structured_facts) == 1
    assert evidence.structured_facts[0]["value"] == "100"
    
    # Verify backend was called with correct space and KB filters
    mock_backend.for_agent.assert_called_once_with(
        space_id=str(s1.id),
        specific_doc_ids=["yullo-test-doc"]
    )
    
    # Verify passages were returned
    assert len(evidence.passages) == 1
    assert evidence.passages[0]["content"] == "Yullo passage"
    
    # Verify sufficiency
    assert evidence.sufficiency == "supported"

async def test_retrieval_empty_result(db_session_fixture: AsyncSession, setup_two_spaces, retrieve_for):
    s1, kb1, s2, kb2 = setup_two_spaces
    
    mock_backend = MagicMock(spec=BaseKnowledgeBackend)
    mock_bundle = MagicMock(spec=KnowledgeBundle)
    mock_bundle.has_knowledge = True
    
    mock_knowledge = MagicMock()
    mock_knowledge.search.return_value = [] # no docs
    mock_bundle.knowledge = mock_knowledge
    mock_backend.for_agent.return_value = mock_bundle
    
    retrieve = retrieve_for(db_session_fixture, mock_backend)
    
    # Use a dummy KB ID so no facts are found
    dummy_kb_id = uuid.uuid4()
    context = YulloExecutionContext(
        space_id=s1.id,
        kb_ids=[dummy_kb_id],
        published_version=1
    )
    
    evidence = await retrieve(context, query="Unknown")
    
    assert len(evidence.structured_facts) == 0
    assert len(evidence.passages) == 0
    assert evidence.sufficiency == "missing"
