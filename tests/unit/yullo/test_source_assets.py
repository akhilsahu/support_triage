import uuid
from datetime import datetime
import pytest
from app.orchestra.ai.ingestion.scraper.asset_extractor import extract_page_assets
from app.schemas.yullo_onboarding import SpaceSourceResponse

SAMPLE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Acme Studio | Creative Design & Tech</title>
    <link rel="icon" type="image/png" href="/assets/icons/favicon-32x32.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta property="og:title" content="Acme Studio">
    <meta property="og:description" content="We build intelligent spaces and web experiences.">
    <meta property="og:image" content="https://cdn.example.com/images/og-hero-banner.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Acme Studio",
      "url": "https://acme.example.com",
      "logo": "https://acme.example.com/assets/brand-logo.svg"
    }
    </script>
</head>
<body>
    <header>
        <img src="/images/logo-header.png" alt="Acme Logo" class="header-logo" width="120" height="40">
        <nav>
            <a href="/about">About</a>
            <a href="/downloads/company-profile-2026.pdf">Download Company Profile (PDF)</a>
            <a href="/files/pricing_guide.docx">Pricing Guide</a>
        </nav>
    </header>
    <main>
        <h1>Welcome to Acme</h1>
        <p>Explore our latest project gallery:</p>
        <figure>
            <img src="/media/project-alpha.webp" alt="Project Alpha Dashboard" width="800" height="600">
            <figcaption>The newly redesigned dashboard for Project Alpha.</figcaption>
        </figure>
        <img src="https://cdn.example.com/photos/team-photo.jpg" alt="Our Core Team" width="600" height="400">
        <!-- Tracking pixel to be ignored -->
        <img src="https://analytics.example.com/pixel.gif?id=123" width="1" height="1" alt="">
    </main>
</body>
</html>
"""


def test_extract_page_assets_comprehensive():
    base_url = "https://acme.example.com/portfolio/case-study"
    assets = extract_page_assets(SAMPLE_HTML, base_url)

    # 1. Favicon resolved to absolute URL
    assert assets["favicon_url"] == "https://acme.example.com/assets/icons/favicon-32x32.png"

    # 2. OpenGraph preview banner
    assert assets["preview_image_url"] == "https://cdn.example.com/images/og-hero-banner.jpg"

    # 3. Logo extracted from JSON-LD schema
    assert assets["logo_url"] == "https://acme.example.com/assets/brand-logo.svg"

    # 4. Meta description
    assert assets["description"] == "We build intelligent spaces and web experiences."

    # 5. Content images (tracking pixel filtered out)
    images = assets["images"]
    image_urls = [img["url"] for img in images]
    assert "https://acme.example.com/media/project-alpha.webp" in image_urls
    assert "https://cdn.example.com/photos/team-photo.jpg" in image_urls
    assert not any("pixel.gif" in u for u in image_urls)

    # Verify caption, context text and section
    alpha_img = next(img for img in images if "project-alpha" in img["url"])
    assert alpha_img["alt"] == "Project Alpha Dashboard"
    assert "redesigned dashboard" in alpha_img["caption"]
    assert "Welcome to Acme" in alpha_img["section"]
    assert "Project Alpha" in alpha_img["context_text"]

    # 6. Linked downloadable documents and contextual text
    documents = assets["documents"]
    assert len(documents) == 2
    doc_urls = [d["url"] for d in documents]
    assert "https://acme.example.com/downloads/company-profile-2026.pdf" in doc_urls
    assert "https://acme.example.com/files/pricing_guide.docx" in doc_urls

    pdf_doc = next(d for d in documents if d["file_type"] == "pdf")
    assert "Company Profile" in pdf_doc["title"]
    assert pdf_doc["context_text"] != ""
    assert "section" in pdf_doc

    # 7. Contextual links
    links = assets["links"]
    assert any("about" in l["url"] for l in links)


def test_extract_page_assets_minimal_fallback():
    minimal_html = "<html><head><title>Minimal</title></head><body><p>Hello world</p></body></html>"
    base_url = "https://minimal.example.com/about"
    assets = extract_page_assets(minimal_html, base_url)

    # Fallback favicon to root /favicon.ico
    assert assets["favicon_url"] == "https://minimal.example.com/favicon.ico"
    assert assets["preview_image_url"] is None
    assert assets["logo_url"] is None
    assert assets["images"] == []
    assert assets["documents"] == []


def test_space_source_response_schema_with_assets():
    source_id = uuid.uuid4()
    response = SpaceSourceResponse(
        id=source_id,
        source_type="url",
        content_ref="https://acme.example.com",
        status="ready",
        title="Acme Studio",
        favicon_url="https://acme.example.com/favicon.ico",
        preview_image_url="https://cdn.example.com/images/og-hero.jpg",
        assets={
            "favicon_url": "https://acme.example.com/favicon.ico",
            "preview_image_url": "https://cdn.example.com/images/og-hero.jpg",
            "images": [{"url": "https://cdn.example.com/img1.jpg", "alt": "Studio"}],
            "documents": [{"url": "https://acme.example.com/guide.pdf", "title": "Guide", "file_type": "pdf"}],
        },
        created_at=datetime.utcnow()
    )

    data = response.model_dump()
    assert data["favicon_url"] == "https://acme.example.com/favicon.ico"
    assert data["preview_image_url"] == "https://cdn.example.com/images/og-hero.jpg"
    assert len(data["assets"]["images"]) == 1
    assert len(data["assets"]["documents"]) == 1
