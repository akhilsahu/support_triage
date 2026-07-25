"""Serve brand dashboard HTML pages and public org info."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

router = APIRouter(prefix="/space", tags=["Space UI"])

_UI_DIR = Path(__file__).parent.parent / "org_ui"


def _html(name: str) -> HTMLResponse:
    return HTMLResponse((_UI_DIR / name).read_text())


@router.get("/login", response_class=HTMLResponse)
async def brand_login():
    return _html("login.html")


@router.get("/dashboard", response_class=HTMLResponse)
async def brand_dashboard():
    return _html("dashboard.html")


@router.get("/", response_class=RedirectResponse)
async def brand_root():
    return RedirectResponse("/api/v1/space/login")


@router.get("/search")
async def org_search(q: str = ""):
    """Public org search — returns matching active orgs by name or slug."""
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    from sqlalchemy import or_, func
    if not q or len(q.strip()) < 1:
        return {"results": []}
    db = AsyncSessionLocal()
    try:
        term = f"%{q.strip().lower()}%"
        result = await db.execute(
            select(Space)
            .where(
                Space.active == True,
                or_(
                    func.lower(Space.display_name).like(term),
                    func.lower(Space.slug).like(term),
                )
            )
            .limit(6)
        )
        orgs = result.scalars().all()
        return {"results": [
            {"name": o.display_name, "slug": o.slug, "logo_url": o.logo_url, "theme_color": o.theme_color or "#4f46e5"}
            for o in orgs
        ]}
    finally:
        await db.close()


async def build_homepage_fields(
    db, org, chatbot, *,
    name: str, description: str,
    resolved_device: str, resolved_visitor_type: str,
    blocking: bool,
) -> dict:
    """
    Assemble the homepage-section fields for a chatbot: the section id list plus
    each section's content (key_benefits, faq, stat_band, comparison, data_block,
    process_steps, capabilities) and admin force-includes (quick_topics,
    trust_badges, promo/section_overrides, admin stat_band/comparison).

    Shared by two callers:
      - the live public endpoint (blocking=False -- the slow web-grounded
        sections serve cached-or-warm-in-background so the welcome stays fast);
      - the admin 'generate snapshot' endpoint (blocking=True -- wait for the
        real generated content so it can be frozen into a snapshot, never None).

    Returns a dict of homepage keys to merge into the public response. Never
    raises: best-effort, logs failures, and returns whatever it assembled.
    """
    import structlog
    hp: dict = {}
    slug = org.slug
    try:
        from app.api.customer import _get_active_agents_cached
        from app.renderengine.homepage_sections import get_homepage_sections

        active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
        hp["homepage_sections"] = await get_homepage_sections(
            chatbot_id=chatbot.id,
            space_name=name,
            description=description,
            active_agents=active_agents,
            device=resolved_device,
            visitor_type=resolved_visitor_type,
            override_raw=chatbot.homepage_sections_override,
        )

        # quick_topics is admin-authored, not AI-selected -- force-include it
        # whenever the admin has configured topics, regardless of the AI/override
        # decision. Isolated so a parse issue can't remove already-decided sections.
        try:
            from app.renderengine.quick_topics import parse_quick_topics
            topics = parse_quick_topics(chatbot.quick_topics)
            if topics:
                hp["quick_topics"] = topics
                if "quick_topics" not in hp["homepage_sections"]:
                    hp["homepage_sections"] = hp["homepage_sections"] + ["quick_topics"]
        except Exception:
            structlog.get_logger().warning("build_homepage.quick_topics_failed", slug=slug)

        # trust_badges -- same admin-authored, force-include treatment.
        try:
            from app.renderengine.trust_badges import parse_trust_badges
            badges = parse_trust_badges(chatbot.trust_badges)
            if badges:
                hp["trust_badges"] = badges
                if "trust_badges" not in hp["homepage_sections"]:
                    hp["homepage_sections"] = hp["homepage_sections"] + ["trust_badges"]
        except Exception:
            structlog.get_logger().warning("build_homepage.trust_badges_failed", slug=slug)

        # stat_band -- admin's OWN verified metrics take precedence over the
        # AI/web generator. When set, force-include and skip the AI fallback below.
        try:
            from app.renderengine.stat_band import admin_stat_band
            from app.models.chatbot import ChatbotStatMetric
            metric_rows = (await db.execute(
                select(ChatbotStatMetric)
                .where(ChatbotStatMetric.chatbot_id == chatbot.id)
                .order_by(ChatbotStatMetric.position)
            )).scalars().all()
            admin_stats = admin_stat_band(metric_rows)
            if admin_stats:
                hp["stat_band"] = admin_stats
                if "stat_band" not in hp["homepage_sections"]:
                    hp["homepage_sections"] = hp["homepage_sections"] + ["stat_band"]
        except Exception:
            structlog.get_logger().warning("build_homepage.stat_band_admin_failed", slug=slug)

        # comparison -- admin's OWN curated/cited competitor grid takes precedence.
        try:
            from app.renderengine.comparison import admin_comparison
            from app.models.chatbot import ChatbotComparison
            cmp_row = (await db.execute(
                select(ChatbotComparison).where(ChatbotComparison.chatbot_id == chatbot.id)
            )).scalar_one_or_none()
            admin_cmp = admin_comparison(cmp_row)
            if admin_cmp:
                hp["comparison"] = admin_cmp
                if "comparison" not in hp["homepage_sections"]:
                    hp["homepage_sections"] = hp["homepage_sections"] + ["comparison"]
        except Exception:
            structlog.get_logger().warning("build_homepage.comparison_admin_failed", slug=slug)

        # promo -- admin-authored banner via homepage_sections_override's "overrides".
        try:
            from app.renderengine.homepage_sections import parse_section_overrides
            section_overrides = parse_section_overrides(chatbot.homepage_sections_override)
            if section_overrides and section_overrides.get("promo", {}).get("text"):
                hp["section_overrides"] = section_overrides
                if "promo" not in hp["homepage_sections"]:
                    hp["homepage_sections"] = hp["homepage_sections"] + ["promo"]
            elif "promo" in hp["homepage_sections"]:
                hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != "promo"]
        except Exception:
            structlog.get_logger().warning("build_homepage.promo_failed", slug=slug)
            hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != "promo"]

        # capabilities -- deterministic, derived from active_agents. No LLM/cache.
        if "capabilities" in hp["homepage_sections"]:
            try:
                from app.renderengine.capabilities import get_capabilities
                caps = get_capabilities(active_agents)
                if caps:
                    hp["capabilities"] = caps
                else:
                    hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != "capabilities"]
            except Exception:
                structlog.get_logger().warning("build_homepage.capabilities_failed", slug=slug)
                hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != "capabilities"]

        # Cap total length BEFORE content generation so we don't pay for an LLM
        # call on a section that then gets trimmed. Override picks are protected.
        from app.renderengine.homepage_sections import _parse_override, cap_total_sections
        override_ids = set(_parse_override(chatbot.homepage_sections_override) or [])
        hp["homepage_sections"] = cap_total_sections(hp["homepage_sections"], protected_extra=override_ids)

        # Per-section content generation, isolated from the section-list decision.
        section_ids = hp["homepage_sections"]
        gen_specs = []

        if "key_benefits" in section_ids:
            from app.renderengine.key_benefits import get_key_benefits
            gen_specs.append(("key_benefits", get_key_benefits(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                description=description, active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "key_benefits"],
            )))

        if "faq" in section_ids:
            from app.renderengine.faq import get_faq
            gen_specs.append(("faq", get_faq(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "faq"],
            )))

        # data_block/stat_band/comparison are web-grounded and slow. blocking is
        # False on the live path (serve cached, warm in background) and True for
        # the admin generate path (wait for real content to freeze).
        if "data_block" in section_ids:
            from app.renderengine.data_block import get_data_block
            gen_specs.append(("data_block", get_data_block(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                description=description, active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "data_block"],
                blocking=blocking,
            )))

        if "stat_band" in section_ids and "stat_band" not in hp:
            from app.renderengine.stat_band import get_stat_band
            gen_specs.append(("stat_band", get_stat_band(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                description=description, active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "stat_band"],
                blocking=blocking,
            )))

        if "comparison" in section_ids and "comparison" not in hp:
            from app.renderengine.comparison import get_comparison
            gen_specs.append(("comparison", get_comparison(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                description=description, active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "comparison"],
                blocking=blocking,
            )))

        if "process_steps" in section_ids:
            from app.renderengine.process_steps import get_process_steps
            gen_specs.append(("process_steps", get_process_steps(
                chatbot_id=chatbot.id, space_id=org.id, space_name=name,
                active_agents=active_agents,
                other_sections=[s for s in section_ids if s != "process_steps"],
            )))

        if gen_specs:
            import asyncio
            results = await asyncio.gather(*(coro for _, coro in gen_specs), return_exceptions=True)
            _droppable = {"data_block", "stat_band", "process_steps", "comparison"}
            for (section_id, _), result in zip(gen_specs, results):
                if isinstance(result, Exception):
                    structlog.get_logger().warning(
                        f"build_homepage.{section_id}_failed", slug=slug, error=str(result)
                    )
                    if section_id in _droppable:
                        hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != section_id]
                    continue
                if section_id in _droppable:
                    if result:
                        hp[section_id] = result
                    else:
                        hp["homepage_sections"] = [s for s in hp["homepage_sections"] if s != section_id]
                else:
                    hp[section_id] = result

    except Exception:
        structlog.get_logger().warning("build_homepage.failed", slug=slug)
    return hp


@router.get("/public/{slug}")
async def org_public_info(
    request: Request,
    slug: str,
    chatbot_slug: str | None = Query(None, alias="chatbot"),
    device: str | None = Query(None),
    visitor_type: str | None = Query(None, alias="visitor"),
):
    """
    Public org branding info for the customer chat UI.

    chatbot_slug selects a specific chatbot's branding (name/logo/theme, each
    falling back to the org's); omitted or unknown → the default chatbot.

    device/visitor_type feed the renderengine's homepage-section recommendation
    (see app/renderengine/homepage_sections.py). Frontend doesn't send them yet —
    this endpoint derives safe defaults so the field is always populated ahead
    of the frontend wiring landing.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    from app.models.chatbot import Chatbot
    db = AsyncSessionLocal()
    try:
        result = await db.execute(
            select(Space).where(Space.slug == slug, Space.active == True)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Not found")

        base = select(Chatbot).where(Chatbot.space_id == org.id, Chatbot.active == True)
        chatbot = None
        if chatbot_slug:
            chatbot = (await db.execute(base.where(Chatbot.slug == chatbot_slug))).scalar_one_or_none()
        if chatbot is None:
            chatbot = (await db.execute(base.where(Chatbot.is_default == True))).scalar_one_or_none()

        # Effective logo: chatbot logo → org logo → none (frontend falls back to icon).
        # show_logo=False on the chatbot always forces the icon.
        if chatbot is not None:
            effective_logo = (chatbot.logo_url or org.logo_url) if chatbot.show_logo else None
        else:
            effective_logo = org.logo_url

        # A specific chatbot shows its own name/theme (falling back to the org's).
        name  = org.display_name
        theme = org.theme_color or "#4f46e5"
        if chatbot is not None and chatbot_slug:
            name  = chatbot.display_name or org.display_name
            theme = chatbot.theme_color or org.theme_color or "#4f46e5"

        response = {
            "name":                   name,
            "slug":                   org.slug,
            "description":            (chatbot.description if chatbot else "") or "",
            "logo_url":               effective_logo,
            "theme_color":            theme,
            "human_transfer_enabled": chatbot.human_transfer_enabled if chatbot else True,
            # Customer-login gate: null = never, 0 = before the first message,
            # N = N free messages then sign-in. The widget uses it to show the
            # Google gate at the right moment; the server enforces it regardless.
            "login_after_messages": chatbot.login_after_messages if chatbot else None,
        }

        # ── Homepage section recommendation ──
        # Two-factor gate, admin-config driven only -- no env var or build
        # flag. Factor 1 (platform-wide, super admin): PlatformSettings.
        # homepage_sections_platform_enabled. Factor 2 (per-bot, space admin):
        # Chatbot.homepage_sections_enabled. Both must be True. The key is
        # simply absent from the response otherwise. Any failure here must
        # never affect the response above.
        if chatbot is not None and chatbot.homepage_sections_enabled:
            platform_enabled = False
            try:
                from app.models.space import PlatformSettings
                ps_result = await db.execute(select(PlatformSettings).limit(1))
                ps = ps_result.scalar_one_or_none()
                platform_enabled = bool(ps and ps.homepage_sections_platform_enabled)
            except Exception:
                import structlog
                structlog.get_logger().warning("org_public_info.platform_settings_read_failed", slug=slug)

            if platform_enabled:
                # Published-snapshot short-circuit: if an admin has generated,
                # (optionally edited) and PUBLISHED this chatbot's welcome UI,
                # serve that frozen payload verbatim and skip every live LLM/web
                # call below. A draft-only snapshot (published_payload NULL) is
                # ignored here -- it's preview-only until published.
                try:
                    from app.models.chatbot import ChatbotHomepageSnapshot
                    snap = (await db.execute(
                        select(ChatbotHomepageSnapshot).where(
                            ChatbotHomepageSnapshot.chatbot_id == chatbot.id
                        )
                    )).scalar_one_or_none()
                    if snap and isinstance(snap.published_payload, dict):
                        response.update(snap.published_payload)
                        return response
                except Exception:
                    import structlog
                    structlog.get_logger().warning("org_public_info.snapshot_read_failed", slug=slug)

                resolved_device = device or (
                    "mobile" if "Mobile" in request.headers.get("user-agent", "") else "desktop"
                )
                resolved_visitor_type = visitor_type or "new"
                hp = await build_homepage_fields(
                    db, org, chatbot,
                    name=name, description=response["description"],
                    resolved_device=resolved_device,
                    resolved_visitor_type=resolved_visitor_type,
                    blocking=False,
                )
                response.update(hp)

        return response
    finally:
        await db.close()
