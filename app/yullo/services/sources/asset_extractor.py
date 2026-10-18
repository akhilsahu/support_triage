"""
Asset extraction service for scraped web sources.
Extracts brand assets (favicon, logo, Open Graph images),
prominent content images with related context, and linked resource documents/links
while maintaining relational context (surrounding text, section headings, captions).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)

# Common tracking / icon tokens to ignore when collecting content images
_IGNORE_IMAGE_PATTERNS = re.compile(
    r"(tracking|pixel|beacon|spacer|1x1|clear\.gif|analytics|adserver|banner-ad)",
    re.IGNORECASE,
)

# Common document extensions to detect downloadable assets
_DOC_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "doc",
    ".xlsx": "xlsx",
    ".xls": "xls",
    ".pptx": "pptx",
    ".csv": "csv",
}


def _is_valid_http_url(url: str) -> bool:
    """Verifies that a URL has an http or https scheme and a valid network location."""
    if not url or not isinstance(url, str):
        return False
    parsed = urlparse(url)
    return parsed.scheme.lower() in ("http", "https") and bool(parsed.netloc)


def _safe_resolve_url(base_url: str, relative_path: str) -> Optional[str]:
    """Safely joins relative URLs to base_url and verifies HTTP(S) protocol."""
    if not relative_path or not isinstance(relative_path, str):
        return None
    trimmed = relative_path.strip()
    if trimmed.startswith("javascript:") or trimmed.startswith("data:image"):
        return None
    try:
        resolved = urljoin(base_url, trimmed)
        if _is_valid_http_url(resolved):
            return resolved
    except Exception as exc:
        logger.debug("Failed to resolve URL '%s' against '%s': %s", relative_path, base_url, exc)
    return None


def _find_nearest_heading(element: Tag) -> str:
    """Traverses backwards from element to find the nearest preceding heading."""
    curr = element
    while curr:
        # Check previous siblings
        for prev in curr.find_all_previous(["h1", "h2", "h3", "h4"]):
            heading_text = prev.get_text(separator=" ", strip=True)
            if heading_text:
                return heading_text[:100]
        curr = curr.parent
    return ""


def _get_surrounding_context(element: Tag, max_chars: int = 280) -> str:
    """
    Finds the surrounding contextual text for an element (e.g. enclosing paragraph,
    figure caption, or block container).
    """
    # 1. Check direct enclosing semantic container
    container = element.find_parent(["p", "li", "figure", "blockquote", "td", "dd"])
    if container:
        text = container.get_text(separator=" ", strip=True)
        if text:
            # Clean up whitespace
            cleaned = " ".join(text.split())
            return cleaned[:max_chars]

    # 2. Check parent element
    parent = element.parent
    if parent and isinstance(parent, Tag):
        text = parent.get_text(separator=" ", strip=True)
        if text:
            cleaned = " ".join(text.split())
            return cleaned[:max_chars]

    return ""


def extract_page_assets(raw_html: bytes | str, base_url: str) -> Dict[str, Any]:
    """
    Extracts brand and media assets from HTML with their surrounding contextual text:
    - favicon_url: Website favicon or apple touch icon
    - preview_image_url: OpenGraph / Twitter card image
    - logo_url: Candidate company or site logo
    - description: Meta description or OpenGraph description
    - images: List of prominent content images with alt text, caption, context_text, and section
    - documents: List of linked downloadable assets (PDFs, docs) with context_text and section
    - links: List of prominent external or navigation links with related context_text and section
    """
    results: Dict[str, Any] = {
        "favicon_url": None,
        "preview_image_url": None,
        "logo_url": None,
        "description": None,
        "images": [],
        "documents": [],
        "links": [],
    }

    if not raw_html:
        return results

    try:
        soup = BeautifulSoup(raw_html, "html.parser")
    except Exception as exc:
        logger.warning("Failed to parse HTML with BeautifulSoup for '%s': %s", base_url, exc)
        return results

    parsed_base = urlparse(base_url)
    default_favicon = f"{parsed_base.scheme}://{parsed_base.netloc}/favicon.ico" if parsed_base.netloc else None

    # 1. Favicon Extraction
    for rel in ["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"]:
        icon_tag = soup.find("link", rel=lambda r: r and rel in r.lower() if isinstance(r, (str, list)) else False)
        if icon_tag and icon_tag.get("href"):
            resolved = _safe_resolve_url(base_url, icon_tag["href"])
            if resolved:
                results["favicon_url"] = resolved
                break

    if not results["favicon_url"] and default_favicon:
        results["favicon_url"] = default_favicon

    # 2. OpenGraph / Twitter Card & Meta Description Extraction
    og_image = soup.find("meta", property=re.compile(r"^og:image(:url)?$", re.IGNORECASE))
    if og_image and og_image.get("content"):
        results["preview_image_url"] = _safe_resolve_url(base_url, og_image["content"])

    if not results["preview_image_url"]:
        tw_image = soup.find("meta", attrs={"name": re.compile(r"^twitter:image(:src)?$", re.IGNORECASE)})
        if tw_image and tw_image.get("content"):
            results["preview_image_url"] = _safe_resolve_url(base_url, tw_image["content"])

    # Meta description
    og_desc = soup.find("meta", property="og:description")
    if og_desc and og_desc.get("content"):
        results["description"] = og_desc["content"].strip()[:400]
    else:
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            results["description"] = meta_desc["content"].strip()[:400]

    # 3. Logo Extraction (Schema.org JSON-LD or <img> attributes)
    for script in soup.find_all("script", type="application/ld+json"):
        if not script.string:
            continue
        try:
            ld_data = json.loads(script.string.strip())
            items = ld_data if isinstance(ld_data, list) else [ld_data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                logo = item.get("logo")
                if isinstance(logo, str):
                    resolved = _safe_resolve_url(base_url, logo)
                    if resolved:
                        results["logo_url"] = resolved
                        break
                elif isinstance(logo, dict) and logo.get("url"):
                    resolved = _safe_resolve_url(base_url, logo["url"])
                    if resolved:
                        results["logo_url"] = resolved
                        break
            if results["logo_url"]:
                break
        except Exception:
            continue

    # Fallback logo from <img> tags if not found in JSON-LD
    if not results["logo_url"]:
        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src")
            if not src:
                continue
            alt = (img.get("alt") or "").lower()
            cls = " ".join(img.get("class", [])).lower() if isinstance(img.get("class"), list) else str(img.get("class") or "").lower()
            img_id = str(img.get("id") or "").lower()
            itemprop = str(img.get("itemprop") or "").lower()

            if "logo" in alt or "logo" in cls or "logo" in img_id or itemprop == "logo":
                resolved = _safe_resolve_url(base_url, src)
                if resolved:
                    results["logo_url"] = resolved
                    break

    # 4. Content Images Extraction (Up to 12 distinct content images with related context)
    seen_image_urls = set()
    if results["preview_image_url"]:
        seen_image_urls.add(results["preview_image_url"])
    if results["logo_url"]:
        seen_image_urls.add(results["logo_url"])
    if results["favicon_url"]:
        seen_image_urls.add(results["favicon_url"])

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue

        width_str = img.get("width")
        height_str = img.get("height")
        try:
            if width_str and int(width_str) <= 10:
                continue
            if height_str and int(height_str) <= 10:
                continue
        except (ValueError, TypeError):
            pass

        if _IGNORE_IMAGE_PATTERNS.search(src):
            continue

        resolved = _safe_resolve_url(base_url, src)
        if not resolved or resolved in seen_image_urls:
            continue

        alt_text = (img.get("alt") or "").strip()
        title_text = (img.get("title") or "").strip()

        # Capture caption if nested in <figure>
        caption_text = ""
        parent_figure = img.find_parent("figure")
        if parent_figure:
            figcaption = parent_figure.find("figcaption")
            if figcaption:
                caption_text = figcaption.get_text(strip=True)

        # Capture surrounding contextual paragraph and nearest section heading
        context_text = _get_surrounding_context(img)
        section_name = _find_nearest_heading(img)

        results["images"].append({
            "url": resolved,
            "alt": alt_text,
            "title": title_text,
            "caption": caption_text,
            "context_text": context_text,
            "section": section_name,
        })
        seen_image_urls.add(resolved)
        if len(results["images"]) >= 12:
            break

    # 5. Linked Downloadable Documents Extraction (Up to 10 documents with related context)
    seen_doc_urls = set()
    seen_link_urls = set()

    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        parsed_href = urlparse(href)
        path = parsed_href.path.lower()
        
        doc_type = None
        for ext, kind in _DOC_EXTENSIONS.items():
            if path.endswith(ext):
                doc_type = kind
                break

        link_text = a_tag.get_text(separator=" ", strip=True)
        if not link_text and not doc_type:
            continue

        resolved = _safe_resolve_url(base_url, href)
        if not resolved:
            continue

        # Extract surrounding context sentence/paragraph and section
        context_text = _get_surrounding_context(a_tag)
        section_name = _find_nearest_heading(a_tag)

        if doc_type:
            if resolved in seen_doc_urls:
                continue
            filename = path.rsplit("/", 1)[-1] if "/" in path else path
            results["documents"].append({
                "url": resolved,
                "title": link_text or filename or "Document",
                "file_type": doc_type,
                "filename": filename,
                "context_text": context_text,
                "section": section_name,
            })
            seen_doc_urls.add(resolved)
        elif len(results["links"]) < 10 and resolved not in seen_link_urls:
            # Capture prominent informational links with context (excluding internal jump anchors)
            if not resolved.endswith("#") and len(link_text) >= 3 and resolved != base_url:
                results["links"].append({
                    "url": resolved,
                    "title": link_text,
                    "context_text": context_text,
                    "section": section_name,
                })
                seen_link_urls.add(resolved)

    logger.info(
        "Extracted assets for '%s': favicon=%s preview_image=%s logo=%s images=%d documents=%d links=%d",
        base_url,
        bool(results["favicon_url"]),
        bool(results["preview_image_url"]),
        bool(results["logo_url"]),
        len(results["images"]),
        len(results["documents"]),
        len(results["links"]),
    )
    return results
