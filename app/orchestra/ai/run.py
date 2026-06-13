"""
Standalone chatbot demo — no database, no Redis, no FastAPI required.

Run:
    python -m app.orchestra.ai.run

Keys are read from the project .env automatically.
Priority: OPENAI_API_KEY > WATSONX_API_KEY > ANTHROPIC_API_KEY

What this exercises:
    AgnoConfig          — built directly from env (no app.config import)
    LLMFactory          — picks the right model from env
    AgentFactory        — builds Agno Agents
    TeamFactory         — wraps agents in a Team (or returns single Agent)
    SessionPool         — caches the runner across messages
    AgnoOrchestrator    — run() / stream() / close()
    RAG                 — set RAG_BACKEND=vectorstore in .env to enable
                          (requires ChromaDB to be populated; default=none for demo)
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

# ── Load .env before any app imports ─────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)

from app.orchestra.ai.core.config import build_config  # noqa: E402


def _get_agents():
    """Hardcoded agents for the demo — no DB needed."""
    from app.agents.resolved_agent import ResolvedAgent

    return [
        ResolvedAgent(
            slug="general_faq",
            name="FAQ Agent",
            description="Answers general product and policy questions.",
            base_prompt="You are a helpful FAQ assistant for a retail brand.",
            system_prompt=(
                "Answer customer questions concisely and accurately. "
                "If you don't know, say so clearly."
            ),
            agent_type="builtin",
            is_builtin=True,
            rag_enabled=False,
            rag_doc_types_list=[],
            rag_top_k=5,
            temperature=0.4,
            max_tokens=400,
            keywords_list=["faq", "policy", "return", "refund", "help"],
            skills_list=[],
        ),
        ResolvedAgent(
            slug="order_support",
            name="Order Support Agent",
            description="Handles order status, returns, and shipping queries.",
            base_prompt="You are an order support specialist for a retail brand.",
            system_prompt=(
                "Help customers with order-related questions. "
                "Be direct, empathetic, and solution-focused."
            ),
            agent_type="builtin",
            is_builtin=True,
            rag_enabled=False,
            rag_doc_types_list=[],
            rag_top_k=5,
            temperature=0.3,
            max_tokens=400,
            keywords_list=["order", "shipping", "track", "delivery", "return", "cancel"],
            skills_list=[],
        ),
    ]


class DemoRunner:
    """
    Runs the agent orchestra interactively from the terminal.
    No database, Redis, or FastAPI required.
    """

    def __init__(self):
        self.session_id = str(uuid.uuid4())
        self.space_id     = str(uuid.uuid4())
        self.org_name   = "Demo Brand"
        self.cfg        = build_config(standalone=True)
        self._executor  = None

    def setup(self):
        from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator
        self._executor = AgnoOrchestrator(
            space_id        = self.space_id,
            org_name      = self.org_name,
            active_agents = _get_agents(),
            session_id    = self.session_id,
            cfg           = self.cfg,
            mcp_server    = None,
        )
        self._print_header()

    async def chat(self, message: str) -> dict:
        if not self._executor:
            raise RuntimeError("Call setup() first.")
        return await self._executor.run(message)

    async def stop(self):
        if self._executor:
            await self._executor.close()

    async def run_interactive(self):
        from app.orchestra.ai.session.pool import pool

        print("\n  Type your message and press Enter.")
        print("  Commands:  quit — exit  |  pool — show pool size  |  info — session info\n")

        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break

            if not user_input:
                continue

            cmd = user_input.lower()
            if cmd == "quit":
                break
            if cmd == "pool":
                print(f"  [pool size: {pool.size()}]\n")
                continue
            if cmd == "info":
                print(f"  session_id : {self.session_id}")
                print(f"  space_id     : {self.space_id}")
                print(f"  provider   : {self.cfg.llm_provider} / {self.cfg.llm_model}")
                print(f"  rag        : {self.cfg.rag_backend}\n")
                continue

            try:
                result = await self.chat(user_input)
                print(f"\nAgent [{result.get('agent', '?')}]: {result.get('reply', '')}")
                if result.get("rag_hit"):
                    print(f"  (RAG: {len(result.get('citations', []))} source(s))")
                print()
            except Exception as exc:
                print(f"\n  [error] {exc}\n")

        await self.stop()
        print(f"\n  Closed. Pool size: {pool.size()}\n")

    def _print_header(self):
        from app.orchestra.ai.session.pool import pool
        print("\n" + "=" * 56)
        print("  Agno Orchestra — chatbot demo")
        print("=" * 56)
        print(f"  Provider  : {self.cfg.llm_provider}")
        print(f"  Model     : {self.cfg.llm_model}")
        print(f"  Team mode : {self.cfg.team_mode}")
        print(f"  RAG       : {self.cfg.rag_backend}")
        print(f"  Memory    : {self.cfg.memory_enabled}")
        print(f"  Session   : {self.session_id[:8]}...")
        print(f"  Pool size : {pool.size()}")
        print("=" * 56)


async def _sweep_loop():
    from app.orchestra.ai.session.pool import pool
    while True:
        await asyncio.sleep(600)
        await pool.sweep_expired()


async def main():
    runner = DemoRunner()
    runner.setup()
    sweep_task = asyncio.create_task(_sweep_loop())
    try:
        await runner.run_interactive()
    finally:
        sweep_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
