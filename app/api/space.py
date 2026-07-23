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
                try:
                    resolved_device = device or (
                        "mobile" if "Mobile" in request.headers.get("user-agent", "") else "desktop"
                    )
                    resolved_visitor_type = visitor_type or "new"

                    from app.api.customer import _get_active_agents_cached
                    from app.renderengine.homepage_sections import get_homepage_sections

                    active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
                    response["homepage_sections"] = await get_homepage_sections(
                        chatbot_id=chatbot.id,
                        space_name=name,
                        description=response["description"],
                        active_agents=active_agents,
                        device=resolved_device,
                        visitor_type=resolved_visitor_type,
                        override_raw=chatbot.homepage_sections_override,
                    )

                    # quick_topics is admin-authored, not AI-selected (see
                    # _AI_SELECTABLE_SECTIONS) -- force-include it whenever the
                    # admin has actually configured topics, regardless of what
                    # the AI/override decided, so "I configured topics" always
                    # means "topics show up." Isolated so a parse issue here
                    # can't remove sections already successfully decided.
                    try:
                        from app.renderengine.quick_topics import parse_quick_topics
                        topics = parse_quick_topics(chatbot.quick_topics)
                        if topics:
                            response["quick_topics"] = topics
                            if "quick_topics" not in response["homepage_sections"]:
                                response["homepage_sections"] = response["homepage_sections"] + ["quick_topics"]
                    except Exception:
                        import structlog
                        structlog.get_logger().warning("org_public_info.quick_topics_failed", slug=slug)

                    # trust_badges -- same admin-authored, force-include treatment as quick_topics above.
                    try:
                        from app.renderengine.trust_badges import parse_trust_badges
                        badges = parse_trust_badges(chatbot.trust_badges)
                        if badges:
                            response["trust_badges"] = badges
                            if "trust_badges" not in response["homepage_sections"]:
                                response["homepage_sections"] = response["homepage_sections"] + ["trust_badges"]
                    except Exception:
                        import structlog
                        structlog.get_logger().warning("org_public_info.trust_badges_failed", slug=slug)

                    # stat_band -- admin's OWN verified metrics take precedence
                    # over the AI/web generator (accurate, instant, compliance-safe
                    # for a regulated brand). When set, force-include and skip the
                    # AI fallback below. Same force-include pattern as trust_badges.
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
                            response["stat_band"] = admin_stats
                            if "stat_band" not in response["homepage_sections"]:
                                response["homepage_sections"] = response["homepage_sections"] + ["stat_band"]
                    except Exception:
                        import structlog
                        structlog.get_logger().warning("org_public_info.stat_band_admin_failed", slug=slug)

                    # comparison -- admin's OWN curated/cited competitor grid takes
                    # precedence over the AI/web generator (verified, compliance-safe
                    # for comparative claims about named competitors). When set,
                    # force-include and skip the AI fallback below.
                    try:
                        from app.renderengine.comparison import admin_comparison
                        from app.models.chatbot import ChatbotComparison
                        cmp_row = (await db.execute(
                            select(ChatbotComparison).where(ChatbotComparison.chatbot_id == chatbot.id)
                        )).scalar_one_or_none()
                        admin_cmp = admin_comparison(cmp_row)
                        if admin_cmp:
                            response["comparison"] = admin_cmp
                            if "comparison" not in response["homepage_sections"]:
                                response["homepage_sections"] = response["homepage_sections"] + ["comparison"]
                    except Exception:
                        import structlog
                        structlog.get_logger().warning("org_public_info.comparison_admin_failed", slug=slug)

                    # promo -- admin-authored banner via homepage_sections_override's
                    # "overrides" sub-object (optional; None when never configured).
                    # Same force-include treatment as quick_topics/trust_badges above,
                    # but sourced from the override JSON rather than a dedicated column.
                    try:
                        from app.renderengine.homepage_sections import parse_section_overrides
                        section_overrides = parse_section_overrides(chatbot.homepage_sections_override)
                        if section_overrides and section_overrides.get("promo", {}).get("text"):
                            response["section_overrides"] = section_overrides
                            if "promo" not in response["homepage_sections"]:
                                response["homepage_sections"] = response["homepage_sections"] + ["promo"]
                        elif "promo" in response["homepage_sections"]:
                            # Selected (e.g. via a manual sections override) but no
                            # usable text -- don't leave a dead section id in the
                            # list the frontend has to guard against.
                            response["homepage_sections"] = [
                                s for s in response["homepage_sections"] if s != "promo"
                            ]
                    except Exception:
                        import structlog
                        structlog.get_logger().warning("org_public_info.promo_failed", slug=slug)
                        response["homepage_sections"] = [
                            s for s in response["homepage_sections"] if s != "promo"
                        ]

                    # capabilities -- deterministic, derived directly from
                    # active_agents (see app/renderengine/capabilities.py). No
                    # LLM/cache involved, so this runs synchronously alongside
                    # the force-include blocks above rather than the gather below.
                    if "capabilities" in response["homepage_sections"]:
                        try:
                            from app.renderengine.capabilities import get_capabilities
                            caps = get_capabilities(active_agents)
                            if caps:
                                response["capabilities"] = caps
                            else:
                                response["homepage_sections"] = [
                                    s for s in response["homepage_sections"] if s != "capabilities"
                                ]
                        except Exception:
                            import structlog
                            structlog.get_logger().warning("org_public_info.capabilities_failed", slug=slug)
                            response["homepage_sections"] = [
                                s for s in response["homepage_sections"] if s != "capabilities"
                            ]

                    # Apply the total-length cap BEFORE running any content
                    # generation -- otherwise we'd fire (and pay for) an LLM call
                    # for a section that then gets trimmed off the page. Sections
                    # an admin explicitly listed in their override are protected
                    # from the trim so force-included admin content can never
                    # silently evict the admin's own chosen sections.
                    from app.renderengine.homepage_sections import _parse_override, cap_total_sections
                    override_ids = set(_parse_override(chatbot.homepage_sections_override) or [])
                    response["homepage_sections"] = cap_total_sections(
                        response["homepage_sections"], protected_extra=override_ids
                    )

                    # Content generation for individual sections is isolated from
                    # the section-list decision above -- a failure here must not
                    # remove sections that were already successfully decided.
                    # key_benefits/faq/data_block are independent LLM calls --
                    # run them concurrently so total latency is bounded by the
                    # slowest one, not their sum.
                    section_ids = response["homepage_sections"]
                    gen_specs = []

                    if "key_benefits" in section_ids:
                        from app.renderengine.key_benefits import get_key_benefits
                        gen_specs.append(("key_benefits", get_key_benefits(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            description=response["description"],
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "key_benefits"],
                        )))

                    if "faq" in section_ids:
                        from app.renderengine.faq import get_faq
                        # active_agents is already chatbot_id-scoped (via
                        # _get_active_agents_cached above) -- get_faq derives
                        # doc types from these agents' own rag_doc_types_list,
                        # not from the whole space's document set.
                        gen_specs.append(("faq", get_faq(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "faq"],
                        )))

                    # data_block + stat_band are web-grounded and slow -- run them
                    # non-blocking (blocking=False): serve cached, else warm in the
                    # background and populate next load, so the welcome stays fast.
                    if "data_block" in section_ids:
                        from app.renderengine.data_block import get_data_block
                        gen_specs.append(("data_block", get_data_block(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            description=response["description"],
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "data_block"],
                            blocking=False,
                        )))

                    # AI/web stat_band only when the admin hasn't supplied verified
                    # figures above (response already has "stat_band" in that case).
                    if "stat_band" in section_ids and "stat_band" not in response:
                        from app.renderengine.stat_band import get_stat_band
                        gen_specs.append(("stat_band", get_stat_band(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            description=response["description"],
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "stat_band"],
                            blocking=False,
                        )))

                    # AI/web comparison only when the admin hasn't curated a grid.
                    if "comparison" in section_ids and "comparison" not in response:
                        from app.renderengine.comparison import get_comparison
                        gen_specs.append(("comparison", get_comparison(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            description=response["description"],
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "comparison"],
                            blocking=False,
                        )))

                    if "process_steps" in section_ids:
                        from app.renderengine.process_steps import get_process_steps
                        gen_specs.append(("process_steps", get_process_steps(
                            chatbot_id=chatbot.id,
                            space_id=org.id,
                            space_name=name,
                            active_agents=active_agents,
                            other_sections=[s for s in section_ids if s != "process_steps"],
                        )))

                    if gen_specs:
                        import asyncio
                        results = await asyncio.gather(
                            *(coro for _, coro in gen_specs), return_exceptions=True
                        )
                        # Sections whose generator returns a dict-or-None: an
                        # empty/failed result must drop the section id so the
                        # frontend never gets a dead id to guard against.
                        _droppable = {"data_block", "stat_band", "process_steps", "comparison"}
                        for (section_id, _), result in zip(gen_specs, results):
                            if isinstance(result, Exception):
                                import structlog
                                structlog.get_logger().warning(
                                    f"org_public_info.{section_id}_failed", slug=slug, error=str(result)
                                )
                                if section_id in _droppable:
                                    response["homepage_sections"] = [
                                        s for s in response["homepage_sections"] if s != section_id
                                    ]
                                continue
                            if section_id in _droppable:
                                if result:
                                    response[section_id] = result
                                else:
                                    response["homepage_sections"] = [
                                        s for s in response["homepage_sections"] if s != section_id
                                    ]
                            else:
                                response[section_id] = result

                except Exception:
                    import structlog
                    structlog.get_logger().warning("org_public_info.homepage_sections_failed", slug=slug)

        return response
    finally:
        await db.close()
