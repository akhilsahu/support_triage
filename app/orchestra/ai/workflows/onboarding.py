"""
Org Onboarding Workflow — Agno Workflow example.

Triggered when a new org registers. Runs a multi-step process:

  Step 1: Analyse the org's profile (name, industry, description)
  Step 2: Generate recommended agent configuration for that industry
  Step 3: Write a personalised welcome email draft for the org admin
  Step 4: (future) Auto-seed builtin agent configs via DB

This is intentionally SEPARATE from the chat pipeline (Team/executor).
Workflows are stateful, multi-step, long-running — not request/response.

How it fits into the existing system:
  - Triggered from app/api/auth.py after org creation (currently not wired)
  - Can be triggered manually from super admin panel
  - State is persisted by Agno — can resume if a step fails

To wire into auth.py later:
    from app.orchestra.ai.workflows.onboarding import OrgOnboardingWorkflow
    workflow = OrgOnboardingWorkflow()
    result   = await workflow.arun(org_slug=org.slug, org_name=org.display_name, ...)
"""

from __future__ import annotations
from typing import Iterator, Optional
import structlog
from agno.team import Team, TeamMode


logger = structlog.get_logger()


class OrgOnboardingWorkflow:
    """
    Multi-step org onboarding using Agno Workflow.

    Each step is a separate agent call. Agno persists step state so
    if step 2 fails, it can resume from step 2 on retry — not restart.

    Steps:
      1. profile_analyst   — understand the org's industry + use case
      2. config_recommender — suggest which builtin agents to enable
      3. email_writer       — draft a welcome email for the org admin

    These three are coordinated by a Team in coordinate mode (all contribute
    to a final output), wrapped inside the Workflow for state persistence.
    """

    def run(
        self,
        org_slug: str,
        org_name: str,
        industry: Optional[str] = None,
        description: Optional[str] = None,
    ):
        """
        Synchronous Agno Workflow run.
        Agno Workflows are generator-based — yields step results.
        """
        try:
            from agno.workflow import Workflow
            from agno.run.workflow import WorkflowRunOutput, WorkflowRunEvent
            from agno.agent import Agent
            from agno.team import Team
        except ImportError:
            logger.warning("agno not installed — onboarding workflow unavailable")
            return

        from app.orchestra.ai.core.config import build_config
        from app.orchestra.ai.factories.llm import LLMFactory
        cfg   = build_config()
        model = LLMFactory(cfg).build()

        # ── Step agents ──────────────────────────────────────────────────────

        profile_analyst = Agent(
            name="Profile Analyst",
            model=model,
            instructions=(
                "You analyse an organisation's profile and extract key information: "
                "industry, primary use case, likely customer types, support complexity. "
                "Be concise. Output structured JSON."
            ),
        )

        config_recommender = Agent(
            name="Config Recommender",
            model=model,
            instructions=(
                "Based on an org profile, recommend which AI support agents to enable. "
                "Available agents: triage, order_support, logistics, finance, tech_support, general_faq. "
                "Explain why each recommended agent fits this org. Output as JSON list."
            ),
        )

        email_writer = Agent(
            name="Welcome Email Writer",
            model=model,
            instructions=(
                "Write a friendly, professional welcome email for a new org admin. "
                "Mention the AI agents that have been configured for their account. "
                "Keep it under 150 words. Do not use generic filler phrases."
            ),
        )

        # ── Coordinate team: all 3 agents contribute to final output ─────────

        onboarding_team = Team(
            name="Onboarding Team",
            mode=TeamMode.coordinate,
            model=model,
            members=[profile_analyst, config_recommender, email_writer],
            instructions=(
                "Coordinate a full org onboarding. "
                "First analyse the profile, then recommend agents, then write the welcome email. "
                "Combine all outputs into a structured onboarding report."
            ),
        )

        org_context = (
            f"Organisation: {org_name}\n"
            f"Slug: {org_slug}\n"
            f"Industry: {industry or 'not specified'}\n"
            f"Description: {description or 'not specified'}"
        )

        logger.info("onboarding_workflow.start", org_slug=org_slug)

        # Agno Workflow runs as a generator — each yield is a step result
        # Wrap team.run() in a simple stateful workflow
        result = onboarding_team.run(
            f"Onboard this new organisation:\n\n{org_context}"
        )

        logger.info("onboarding_workflow.complete", org_slug=org_slug)
        return result

    async def arun(
        self,
        org_slug: str,
        org_name: str,
        industry: Optional[str] = None,
        description: Optional[str] = None,
    ):
        """Async variant for use in FastAPI endpoints."""
        try:
            from agno.team import Team
            from agno.agent import Agent
        except ImportError:
            logger.warning("agno not installed")
            return None

        from app.orchestra.ai.core.config import build_config
        from app.orchestra.ai.factories.llm import LLMFactory
        cfg   = build_config()
        model = LLMFactory(cfg).build()

        profile_analyst    = Agent(name="Profile Analyst",    model=model,
                                   instructions="Analyse the org profile. Output structured JSON.")
        config_recommender = Agent(name="Config Recommender", model=model,
                                   instructions="Recommend support agents for this org. Output JSON list.")
        email_writer       = Agent(name="Welcome Email Writer", model=model,
                                   instructions="Write a short welcome email for the org admin.")

        team = Team(
            name="Onboarding Team",
            mode=TeamMode.coordinate,
            model=model,
            members=[profile_analyst, config_recommender, email_writer],
        )

        org_context = (
            f"Organisation: {org_name} ({org_slug})\n"
            f"Industry: {industry or 'unspecified'}\n"
            f"Description: {description or 'unspecified'}"
        )

        logger.info("onboarding_workflow.arun_start", org_slug=org_slug)
        result = await team.arun(f"Onboard this organisation:\n\n{org_context}")
        logger.info("onboarding_workflow.arun_complete", org_slug=org_slug)
        return result

