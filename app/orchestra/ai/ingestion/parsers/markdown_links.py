"""Read Markdown content and local media/link relationships."""
import html
import re
import structlog
from urllib.parse import urlsplit

from markdown_it import MarkdownIt
from app.orchestra.ai.ingestion.core.text_utils import clean_prose_lines

logger = structlog.get_logger(__name__)


_NOISE_BLOCKS = (
    re.compile(r"carousel\s+(previous|next)\s+slide", re.I),
    re.compile(r"video player is loading\.?", re.I),
    re.compile(r"(beginning|end) of dialog window(?:\..*)?", re.I),
    re.compile(r"escape will cancel and close the window\.?", re.I),
)


def _web_url(value):
    if not isinstance(value, str):
        return None
    value = html.unescape(value).replace(r"\&", "&").strip()
    try:
        parsed = urlsplit(value)
        if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password:
            return value
    except ValueError:
        pass
    return None


def _clean_text(parts):
    text = " ".join(part.strip() for part in parts if part and part.strip())
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _image_alt(value):
    """Ignore clear placeholders; meaningful short labels such as 'XL' survive."""
    value = _clean_text([value or ''])
    if re.fullmatch(r'(?:alt|test|image|placeholder|logo|banner)(?:[-_]?\d+|[-_]\w+)?', value, re.I):
        return ''
    return value


def _has_semantic_text(value):
    return bool(value and any(character.isalnum() for character in value))


def _coalesce_links(links):
    """One destination per block, retaining all distinct useful labels."""
    by_url = {}
    for link in links:
        current = by_url.setdefault(link["url"], dict(link))
        if link["title"] not in current["title"].split(" — "):
            current["title"] = f'{current["title"]} — {link["title"]}'[:240]
        if link.get("image_url") and not current.get("image_url"):
            current["image_url"] = link["image_url"]
        for span in link.get('text_spans', []):
            if span not in current.setdefault('text_spans', []):
                current['text_spans'].append(span)
    return list(by_url.values())


def _coalesce_images(images):
    """Deduplicate equal occurrences without merging different item destinations."""
    unique = {}
    for image in images:
        key = (image['url'], image.get('destination_url'), image.get('alt'), image.get('title'))
        current = unique.setdefault(key, dict(image))
        for span in image.get('text_spans', []):
            if span not in current.setdefault('text_spans', []):
                current['text_spans'].append(span)
    return list(unique.values())


def _is_noise_block(text, links, images):
    """Remove only high-confidence, whole UI-control blocks."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if images:
        return False
    if any(pattern.fullmatch(normalized) for pattern in _NOISE_BLOCKS):
        return True
    if links and re.fullmatch(r"carousel\s+(previous|next)\s+slide", normalized, re.I):
        return all(urlsplit(link["url"]).fragment or link["url"].rstrip("/").endswith("#") for link in links)
    return False


def _inline_segments(children):
    """Split a Markdown paragraph on source line breaks without breaking links."""
    segments = []
    current = {"text_parts": [], "links": [], "images": [], "has_inline_code": False}
    active_link = None

    def finish_segment():
        nonlocal current
        if current["text_parts"] or current["links"] or current["images"]:
            segments.append(current)
        current = {"text_parts": [], "links": [], "images": [], "has_inline_code": False}

    for child in children or []:
        if child.type == "link_open":
            active_link = {"url": _web_url(child.attrGet("href")), "title_parts": [], "image_url": None}
        elif child.type == "link_close":
            if active_link and active_link["url"]:
                title = _clean_text(active_link["title_parts"])
                if _has_semantic_text(title):
                    link = {"url": active_link["url"], "title": title}
                    if active_link["image_url"]:
                        link["image_url"] = active_link["image_url"]
                    current["links"].append(link)
            active_link = None
        elif child.type == "image":
            image_url = _web_url(child.attrGet("src"))
            alt = _image_alt(child.content)
            if alt:
                current["text_parts"].append(alt)
            if active_link and alt:
                active_link["title_parts"].append(alt)
            if image_url:
                current["images"].append({
                    "url": image_url,
                    "alt": alt,
                    "title": _clean_text([child.attrGet("title") or ""]),
                    "destination_url": active_link["url"] if active_link else None,
                })
                if active_link:
                    active_link["image_url"] = image_url
        elif child.type in ("text", "code_inline"):
            # Markdown parsing already resolves escapes. Remove only isolated
            # escape debris in prose; inline code, paths and URLs stay literal.
            content = child.content if child.type == 'code_inline' or active_link else clean_prose_lines(child.content)
            current["text_parts"].append(content)
            if child.type == 'code_inline':
                current['has_inline_code'] = True
            if active_link:
                active_link["title_parts"].append(child.content)
        elif child.type in ("softbreak", "hardbreak"):
            if active_link:
                active_link["title_parts"].append(" ")
                current["text_parts"].append(" ")
            else:
                finish_segment()
    finish_segment()
    return segments


def _markdown_content_blocks(text):
    """Yield clean semantic blocks with only their structurally local assets."""
    headings = []
    heading_instance = 0
    after_video_loading = False
    tokens = MarkdownIt().parse(text)
    for index, token in enumerate(tokens):
        if token.type in ("fence", "code_block"):
            code = token.content.strip()
            if code:
                yield {
                    "text": code,
                    "section": headings[-1][1] if headings else "",
                    "heading_path": [heading for _, heading in headings],
                    "block_type": "code",
                    "heading_instance": heading_instance,
                    "links": [],
                    "images": [],
                }
            after_video_loading = False
            continue
        if token.type != "inline":
            continue
        if index and tokens[index - 1].type == "heading_open":
            heading_instance += 1
            level = int(tokens[index - 1].tag[1:])
            while headings and headings[-1][0] >= level:
                headings.pop()
            headings.append((level, _clean_text([token.content])))
            continue

        for segment in _inline_segments(token.children):
            links = segment["links"]
            images = segment["images"]
            semantic_text = _clean_text(segment["text_parts"])
            section = headings[-1][1] if headings else ""
            if not semantic_text and images:
                semantic_text = _clean_text([
                    *(image.get("alt") or image.get("title") or "" for image in images),
                    section,
                ])
            if not _has_semantic_text(semantic_text):
                continue
            if after_video_loading and not images and not links and re.fullmatch(r"(pause|play|mute|unmute)", semantic_text, re.I):
                after_video_loading = False
                continue
            is_video_loading = bool(re.fullmatch(r"video player is loading\.?", semantic_text, re.I))
            if _is_noise_block(semantic_text, links, images):
                after_video_loading = is_video_loading
                continue
            after_video_loading = False

            # Offsets refer to the clean block text, not Markdown delimiters.
            for assets, label_field in ((links, 'title'), (images, 'alt')):
                cursor = 0
                for asset in assets:
                    label = asset.get(label_field) or ''
                    start = semantic_text.find(label, cursor) if label else -1
                    if start >= 0:
                        asset['text_spans'] = [{'start': start, 'end': start + len(label)}]
                        cursor = start + len(label)
            unique_links = _coalesce_links(links)
            unique_images = _coalesce_images(images)
            yield {
                "text": semantic_text,
                "section": section,
                "heading_path": [heading for _, heading in headings],
                "block_type": "media" if unique_images else "linked_text" if unique_links else "text",
                "links": unique_links,
                "images": unique_images,
                "has_inline_code": segment['has_inline_code'],
                "heading_instance": heading_instance,
            }


def markdown_content_blocks(text):
    """Deduplicate adjacent equal prose while preserving distinct asset targets."""
    pending = None
    deduplicated = 0
    for block in _markdown_content_blocks(text):
        same = (pending and block['block_type'] != 'code' and pending['block_type'] != 'code'
                and not pending.get('has_inline_code') and not block.get('has_inline_code')
                and pending['heading_instance'] == block['heading_instance']
                and block['text'] == pending['text'] and block['heading_path'] == pending['heading_path'])
        if same:
            deduplicated += 1
            # Equal labels on two separate cards are not duplicate knowledge.
            for key, identity in (('links', 'url'), ('images', 'url')):
                left = {item[identity] for item in pending[key]}
                right = {item[identity] for item in block[key]}
                if left and right and left != right:
                    same = False
            destinations = {image.get('destination_url') for image in pending['images'] + block['images']
                            if image.get('destination_url')}
            if len(destinations) > 1:
                same = False
        if same:
            for key in ('links', 'images'):
                pending[key].extend(item for item in block[key] if item not in pending[key])
            pending['block_type'] = 'media' if pending['images'] else 'linked_text' if pending['links'] else 'text'
            continue
        if pending is not None:
            yield pending
        pending = block
    if pending is not None:
        yield pending
    if deduplicated:
        logger.info('ingestion.markdown.deduplicated', blocks=deduplicated)


def markdown_asset_blocks(text):
    headings = []
    tokens = MarkdownIt().parse(text)
    for index, token in enumerate(tokens):
        if token.type != 'inline':
            continue
        if index and tokens[index - 1].type == 'heading_open':
            level = int(tokens[index - 1].tag[1:])
            while headings and headings[-1][0] >= level:
                headings.pop()
            headings.append((level, token.content))
        images, links = [], []
        active = None
        for child in token.children or []:
            if child.type == 'link_open':
                active = {'url': child.attrGet('href'), 'title': ''}
            elif child.type == 'link_close':
                if active:
                    active['title'] = active['title'].strip()
                    links.append(active)
                active = None
            elif child.type == 'image':
                image = {'url': child.attrGet('src'), 'alt': child.content,
                         'title': child.attrGet('title') or '',
                         'destination_url': active['url'] if active else None}
                images.append(image)
                if active:
                    active['title'] += child.content
            elif active and child.type in ('text', 'code_inline'):
                active['title'] += child.content
            elif active and child.type in ('softbreak', 'hardbreak'):
                active['title'] += ' '
        if images or links:
            yield {'context': token.content, 'path': [heading for _, heading in headings] or ['Overview'],
                   'images': images, 'links': links}


def markdown_links(text):
    """Chunk metadata accepts only absolute web destinations, in source order."""
    seen = set()
    for block in markdown_asset_blocks(text):
        for link in block['links']:
            url = link['url'] or ''
            normalized = _web_url(url)
            if normalized and normalized not in seen:
                seen.add(normalized)
                yield {**link, "url": normalized}
