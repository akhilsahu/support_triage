import argparse
import asyncio
import os
import sys
import uuid
import time
from typing import Optional
from unittest.mock import MagicMock

# Setup environment before imports if needed
os.environ["INGESTION_VISION_ENABLED"] = "false"

# Mock broken import in dynamic_executor
import sys
sys.modules['app.orchestra.ai.rag'] = MagicMock()
sys.modules['app.orchestra.ai.rag.vectorstore_rag'] = MagicMock()

from app.orchestra.ai.ingestion.config import build_ingestion_config
from app.orchestra.ai.ingestion.parsers.html_parser import HtmlParser
from app.orchestra.ai.ingestion.scraper.base import ScraperConfig
from app.orchestra.ai.ingestion.scraper.firecrawl import fetch_firecrawl
from app.orchestra.ai.ingestion.ingestion import IngestionService
from app.rag.vector_store import get_vector_store
from app.models.space import Space
from app.agents.resolved_agent import ResolvedAgent
from app.agents.dynamic_executor import DynamicAgentExecutor

async def main() -> None:
    parser = argparse.ArgumentParser(description="Test E-commerce scraping and agent RAG.")
    parser.add_argument("--url", type=str, required=True, help="E-commerce URL to scrape")
    parser.add_argument("--query", type=str, default="What products are available?", help="Query to ask the agent")
    parser.add_argument("--firecrawl", action="store_true", help="Use Firecrawl instead of default HtmlParser")
    args = parser.parse_args()

    url = args.url
    query = args.query

    cfg = build_ingestion_config()
    
    print(f"\n{'='*60}")
    print(f"Scraping URL : {url}")
    print(f"{'='*60}")
    
    try:
        start_time = time.time()
        if args.firecrawl:
            print("Using Firecrawl...")
            scfg = ScraperConfig(provider="firecrawl", timeout_s=30, max_bytes=10*1024*1024, user_agent="", max_redirects=5, allow_private_hosts=False)
            fetched = await fetch_firecrawl(url, scfg)
            svc = IngestionService(cfg)
            doc = svc.parse(fetched.raw, fetched.filename)
        else:
            html_p = HtmlParser(cfg)
            doc = html_p.parse_url(url)
            
        elapsed = time.time() - start_time
        print(f"Scraped in {elapsed:.2f}s. Pages/Chunks generated: {len(doc.pages)}")
    except Exception as e:
        print(f"\nFAIL to scrape: {type(e).__name__}: {e}")
        sys.exit(1)

    if not doc.pages:
        print("No content found.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"Indexing into Vector Store")
    print(f"{'='*60}")
    
    store = get_vector_store()
    
    # Generate test identifiers
    client_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    doc_id = "test_doc_1"
    kb_id = "test_kb_1"
    
    chunks_for_db = []
    for page in doc.pages:
        # Truncate text to avoid OpenAI 8192 token limit in embedding
        safe_text = page.text[:25000]
        chunks_for_db.append({
            "chunk_index": page.page,
            "page": page.page,
            "section": page.section,
            "text": safe_text
        })
        
    store.upsert_client_chunks(
        client_id=client_id,
        session_id=session_id,
        doc_id=doc_id,
        filename=url,
        extension=".html",
        strategy="html_scrape",
        chunks=chunks_for_db,
        doc_type="general",
        kb_id=kb_id,
    )
    
    print(f"Indexed {len(chunks_for_db)} chunks under client_id {client_id}")
    
    print(f"\n{'='*60}")
    print(f"Configuring Agent & Querying")
    print(f"{'='*60}")
    print(f"Query: {query}")
    
    agent = ResolvedAgent(
        slug="ecom_agent",
        name="Test Ecom Agent",
        description="Test Agent for e-commerce data",
        agent_type="custom",
        is_builtin=False,
        system_prompt="You are a helpful assistant for this e-commerce store. Answer the customer's questions using ONLY the retrieved KNOWLEDGE BASE CONTEXT.",
        base_prompt="",
        temperature=0.1,
        max_tokens=1000,
        rag_enabled=True,
        rag_doc_types_list=["general"],
        rag_top_k=5,
        keywords_list=[],
        kb_ids=[],
        specific_doc_ids=[],
        kb_assignments=[{"kb_id": kb_id, "doc_ids": [doc_id]}],
        topics=[]
    )
    
    mock_space = Space(id=client_id, display_name="Test Ecom Brand")
    # Enable citations on the mock space
    mock_space.show_rag_citations = True

    executor = DynamicAgentExecutor(brand=mock_space, active_agents=[agent])
    
    result = await executor.run(
        message=query,
        session_id="new",
        conversation_id="test_conversation_1",
    )
    
    print(f"\nResponse from {result['agent']}:")
    print(f"{'-'*40}")
    print(result['reply'])
    print(f"{'-'*40}")
    
    if result.get('citations'):
        print("\nCitations Used:")
        for idx, citation in enumerate(result['citations'], 1):
            print(f"[{idx}] Score: {citation['score']:.2f}")
            print(f"    Excerpt: {citation['excerpt'][:150]}...")

if __name__ == "__main__":
    asyncio.run(main())
