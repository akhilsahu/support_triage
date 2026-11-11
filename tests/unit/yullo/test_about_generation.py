import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

from app.orchestra.ai.data_generation.identity_generate import (
    collect_about_context,
    validate_about_context,
    build_about_prompt,
    validate_about_candidate,
    suggest_about
)

@pytest.mark.asyncio
async def test_validate_about_context_empty():
    context = {"space_name": "", "space_type": "business", "excerpts": []}
    assert validate_about_context(context) is False

@pytest.mark.asyncio
async def test_validate_about_context_valid():
    context = {
        "space_name": "Test Space",
        "space_type": "business",
        "excerpts": []
    }
    assert validate_about_context(context) is True

def test_build_about_prompt():
    context = {
        "space_name": "Northstar Studio",
        "space_type": "business",
        "excerpts": [{"title": "Overview", "text": "We build brands for startups."}]
    }
    messages, fingerprint, valid_source_ids = build_about_prompt(context)
    assert len(messages) == 2
    assert "Northstar Studio" in messages[1]["content"]
    assert fingerprint is not None
    assert valid_source_ids == ["source-1"]

def test_validate_about_candidate():
    valid_candidate = {
        "status": "ready",
        "description": "A grounded About description.",
        "claims": [{"text": "Fact 1", "source_id": "source-1"}]
    }
    assert validate_about_candidate(valid_candidate, ["source-1"]) is True

    invalid_candidate = {
        "status": "ready", 
        "description": "a" * 281,
        "claims": []
    }
    assert validate_about_candidate(invalid_candidate, ["source-1"]) is False

@pytest.mark.asyncio
async def test_suggest_about_insufficient_context():
    mock_db = AsyncMock()
    # Mock no space name found and no excerpts found
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect:
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "",
            "space_type": "business",
            "excerpts": []
        }
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "insufficient_context"
        assert res["description"] is None

@pytest.mark.asyncio
async def test_suggest_about_ready():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Northstar Studio",
            "space_type": "business",
            "excerpts": [{"title": "Doc 1", "text": "We build visual identities for early-stage startups."}]
        }
        mock_gen.return_value = {
            "status": "ready",
            "description": "Visual identity design for early-stage startups.",
            "claims": [{"source_id": "source-1", "text": "Visual identity design"}],
            "clarification": None
        }
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "ready"
        assert res["description"] == "Visual identity design for early-stage startups."

@pytest.mark.asyncio
async def test_suggest_about_unavailable_on_failure():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Northstar Studio",
            "space_type": "business",
            "excerpts": [{"title": "Doc 1", "text": "We build visual identities for early-stage startups."}]
        }
        mock_gen.return_value = None
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "unavailable"
        assert res["description"] is None

def test_build_about_prompt_with_search_candidates():
    context = {
        "space_name": "Acme Robotics",
        "space_type": "business",
        "excerpts": [],
        "search_candidates": [
            {"title": "Acme Robotics Official", "url": "https://acmerobotics.com", "description": "Autonomous systems"}
        ]
    }
    messages, fingerprint, valid_source_ids = build_about_prompt(context)
    assert len(messages) == 2
    assert "Acme Robotics Official" in messages[1]["content"]
    assert "https://acmerobotics.com" in messages[1]["content"]
    assert fingerprint is not None

@pytest.mark.asyncio
async def test_suggest_about_fallback_clarification_on_insufficient_context():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "My Space",
            "space_type": "business",
            "excerpts": []
        }
        mock_gen.return_value = {
            "status": "insufficient_context",
            "description": None,
            "category": None,
            "claims": [],
            "clarification": None
        }
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "insufficient_context"
        assert res["clarification"] is not None
        assert "not enough to determine your presence" in res["clarification"]

@pytest.mark.asyncio
async def test_suggest_about_needs_clarification_preserved():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Amazon",
            "space_type": "business",
            "excerpts": []
        }
        mock_gen.return_value = {
            "status": "needs_clarification",
            "description": None,
            "category": None,
            "claims": [],
            "clarification": "We found online matches for Amazon Business (https://business.amazon.com). Please confirm if this is your space."
        }
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "needs_clarification"
        assert "Amazon Business" in res["clarification"]
        assert res["candidate_match"] is not None
        assert res["candidate_match"]["url"] == "https://business.amazon.com"

@pytest.mark.asyncio
async def test_suggest_about_needs_clarification_with_search_candidates():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Amazon India",
            "space_type": "business",
            "excerpts": [],
            "search_candidates": [
                {
                    "title": "Amazon India",
                    "url": "https://amazon.in",
                    "description": "Online Shopping site in India: Shop Online for Mobiles, Books, Watches"
                }
            ]
        }
        mock_gen.return_value = {
            "status": "needs_clarification",
            "description": "Amazon India is an online shopping platform.",
            "category": "E-commerce Platform",
            "claims": [],
            "clarification": "We found online matches for 'Amazon India' (https://amazon.in). Please confirm if this is your space to generate a grounded identity, or provide your official website."
        }
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "needs_clarification"
        assert res["candidate_match"] is not None
        assert res["candidate_match"]["title"] == "Amazon India"
        assert res["candidate_match"]["url"] == "https://amazon.in"
        assert "Online Shopping" in res["candidate_match"]["snippet"]
        assert res["candidate_match"]["candidate_description"] == "Amazon India is an online shopping platform."
        assert res["candidate_match"]["candidate_category"] == "E-commerce Platform"

@pytest.mark.asyncio
async def test_suggest_about_multiturn_conversation():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Amazon India",
            "space_type": "business",
            "excerpts": [{"source_id": "draft-website", "title": "Owner Website", "url": "https://amazon.in", "text": "Website address: https://amazon.in"}],
            "search_candidates": []
        }
        mock_gen.return_value = {
            "status": "ready",
            "description": "Amazon India is an online shopping marketplace in India.",
            "category": "E-commerce Marketplace",
            "claims": [{"text": "Amazon India is an online shopping marketplace", "source_id": "draft-website", "evidence_excerpt": "Website address: https://amazon.in"}],
            "clarification": "Updated identity with your confirmed website https://amazon.in."
        }
        
        history = [
            {"role": "assistant", "content": "We found online matches for Amazon India (https://amazon.com). Please confirm if this is your space."}
        ]
        user_msg = "Actually our website is https://amazon.in and we specialize in the Indian market"
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4(), history=history, user_message=user_msg)
        assert res["status"] == "ready"
        assert res["description"] == "Amazon India is an online shopping marketplace in India."
        assert res["category"] == "E-commerce Marketplace"
        assert "https://amazon.in" in res["clarification"]

@pytest.mark.asyncio
async def test_suggest_about_ready_in_one_go_with_web_candidates():
    mock_db = AsyncMock()
    with patch("app.orchestra.ai.data_generation.identity_generate.collect_about_context") as mock_collect, \
         patch("app.orchestra.ai.data_generation.identity_generate.generate_about_candidate") as mock_gen:
        
        mock_collect.return_value = {
            "found_space": True,
            "space_name": "Amazon",
            "space_type": "business",
            "excerpts": [],
            "search_candidates": [
                {
                    "title": "Amazon.com: Online Shopping",
                    "url": "https://amazon.com",
                    "description": "Online shopping from a great selection of electronics, apparel, and books.",
                    "snippet": "Amazon offers millions of products with fast shipping."
                }
            ]
        }
        mock_gen.return_value = {
            "status": "ready",
            "description": "A global online retail marketplace and technology platform offering consumer electronics, everyday goods, and digital media with fast and dependable delivery.",
            "category": "E-commerce & Retail Platform",
            "claims": [],
            "clarification": "Generated based on online presence for Amazon (https://amazon.com)."
        }
        
        res = await suggest_about(mock_db, user_id=uuid.uuid4())
        assert res["status"] == "ready"
        assert len(res["description"]) >= 120
        assert "Amazon appears to match" not in res["description"]
        assert res["candidate_match"] is not None
        assert res["candidate_match"]["url"] == "https://amazon.com"
        assert res["candidate_match"]["title"] == "Amazon.com: Online Shopping"



