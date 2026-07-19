"""
Standalone check for the homepage-sections renderengine -- no FastAPI server
or DB required. Exercises the real LLM path (reads provider keys from .env),
so this is the fast way to manually verify things like the timeout budget or
provider latency without spinning up the full app and hitting the live
customer-chat endpoint.

Run:
    python -m app.renderengine.democheck
    python -m app.renderengine.democheck --space "HDFC Life" --description "..." --device mobile --visitor returning
    python -m app.renderengine.democheck --override '{"sections": ["hero", "faq"]}'
    python -m app.renderengine.democheck --twice   # same call twice, to show cache-hit timing
    python -m app.renderengine.democheck --data-block --space "HDFC Life Credit Card"
        # Exercises get_data_block() -- real web search + LLM agent call, requires
        # agno + duckduckgo-search installed and a provider key in .env. Not covered
        # by the mocked unit test the other renderengine modules have, so this is
        # the only way to verify it end to end before it's live.
"""
from __future__ import annotations

import argparse
import asyncio
import time
import uuid
from pathlib import Path

# ── Load .env before any app imports (same pattern as app/orchestra/ai/run.py) ──
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

from app.renderengine.homepage_sections import (  # noqa: E402
    ALLOWED_SECTIONS,
    DEFAULT_SECTIONS,
    get_homepage_sections,
)


class _FakeAgent:
    """Minimal stand-in for ResolvedAgent -- only the attributes _generate() reads
    (slug/name/description/agent_type), so this script doesn't need a DB."""
    def __init__(self, slug: str, name: str, description: str, agent_type: str):
        self.slug = slug
        self.name = name
        self.description = description
        self.agent_type = agent_type


_DEMO_AGENTS = [
    _FakeAgent("triage", "Triage", "", "builtin"),
    _FakeAgent("finance", "Finance Agent", "Handles policy, premium, and claims questions", "builtin"),
]


async def _run_data_block(chatbot_id, args) -> None:
    from app.renderengine.data_block import get_data_block

    t0 = time.monotonic()
    block = await get_data_block(
        chatbot_id=chatbot_id,
        space_name=args.space,
        description=args.description,
        active_agents=_DEMO_AGENTS,
    )
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    if block:
        print(f"  -> block_type={block['block_type']!r} title={block['title']!r}   [{elapsed_ms}ms]")
        print(f"     disclaimer: {block['disclaimer']}")
        print(f"     content: {block['content']}")
    else:
        print(f"  -> None (no validated block -- see warnings above)   [{elapsed_ms}ms]")


async def _run_once(chatbot_id, args) -> None:
    t0 = time.monotonic()
    sections = await get_homepage_sections(
        chatbot_id=chatbot_id,
        space_name=args.space,
        description=args.description,
        active_agents=_DEMO_AGENTS,
        device=args.device,
        visitor_type=args.visitor,
        override_raw=args.override,
    )
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    tag = "DEFAULT (fallback)" if sections == DEFAULT_SECTIONS else "AI/override"
    print(f"  -> {sections}   [{elapsed_ms}ms]   ({tag})")


async def main() -> None:
    class Args:
        space = "HDFC Life"
        description = "Ask me about your HDFC Life policies, premiums, claims, and renewals."
        device = "mobile"
        visitor = "returning"
        override = None
        twice = False
        data_block = False

    args = Args()

    try:
        from app.core.redis import redis_client
        await redis_client.connect()
        print("Redis: connected")
    except Exception as e:
        print(f"Redis: unavailable ({e}) -- cache checks will no-op, every call hits the LLM")

    # Same chatbot_id across calls in this run so --twice can actually land on
    # the same cache segment (renderengine:homepage_sections:{chatbot_id}:{device}:{visitor_type}).
    chatbot_id = uuid.uuid4()

    if args.data_block:
        print(f"\nchatbot_id={chatbot_id}")
        print(f"space={args.space!r} description={args.description!r}\n")
        print("Call 1 (data_block -- real web search + LLM agent, can take several seconds):")
        await _run_data_block(chatbot_id, args)
        if args.twice:
            print("Call 2 (same segment -- should hit cache if Redis is connected):")
            await _run_data_block(chatbot_id, args)
    else:
        print(f"\nALLOWED_SECTIONS = {ALLOWED_SECTIONS}")
        print(f"chatbot_id={chatbot_id}")
        print(f"space={args.space!r} device={args.device} visitor={args.visitor} override={args.override!r}\n")

        print("Call 1:")
        await _run_once(chatbot_id, args)

        if args.twice:
            print("Call 2 (same segment -- should hit cache if Redis is connected):")
            await _run_once(chatbot_id, args)

    try:
        from app.core.redis import redis_client
        await redis_client.disconnect()
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
