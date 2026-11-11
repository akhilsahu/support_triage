def test_preview_module_imports_asyncio():
    import app.yullo.services.sources.preview as preview_mod
    import asyncio
    assert hasattr(preview_mod, "asyncio")
    assert preview_mod.asyncio is asyncio


def test_html_link_preservation_grounds_entity_urls():
    from bs4 import BeautifulSoup
    from app.orchestra.ai.ingestion.scraper.asset_extractor import _safe_resolve_url
    from app.yullo.services.entities.extraction import _has_grounded_url, validate_link_context

    raw_html = """
    <html>
      <body>
        <h1>Online Shopping</h1>
        <p>Browse our catalog or <a href="/gp/cart">View Cart</a>.</p>
        <p>Need assistance? Visit <a href="https://support.amazon.in/help">Customer Help</a>.</p>
      </body>
    </html>
    """
    target_url = "https://amazon.in"
    soup = BeautifulSoup(raw_html, "html.parser")
    for a_tag in soup.find_all("a", href=True):
        if not a_tag.parent:
            continue
        href = a_tag.get("href")
        resolved = _safe_resolve_url(target_url, href)
        anchor_text = " ".join(a_tag.get_text(separator=" ", strip=True).split())
        if resolved:
            if anchor_text:
                a_tag.replace_with(f" [{anchor_text}]({resolved}) ")
            else:
                a_tag.replace_with(f" {resolved} ")

    clean_text = soup.get_text(separator=" ", strip=True)

    # Verify URLs are grounded in clean_text
    assert "https://amazon.in/gp/cart" in clean_text
    assert "https://support.amazon.in/help" in clean_text
    assert "[View Cart](https://amazon.in/gp/cart)" in clean_text

    # Verify entity validator accepts the destination URL
    assert _has_grounded_url("https://amazon.in/gp/cart", clean_text) is True
    assert _has_grounded_url("https://support.amazon.in/help", clean_text) is True
    assert _has_grounded_url("https://unrelated-fake.com/steal", clean_text) is False

    # Verify action entity candidate validation passes
    action_payload = {
        "action_type": "view_cart",
        "label": "View Cart",
        "destination_url": "https://amazon.in/gp/cart",
    }
    validated = validate_link_context(
        entity_type="action",
        payload=action_payload,
        source_text=clean_text,
        locators=[{"evidence_excerpt": "View Cart"}],
        space_name="Amazon India",
    )
    assert validated is not None
    assert validated["destination_url"] == "https://amazon.in/gp/cart"
