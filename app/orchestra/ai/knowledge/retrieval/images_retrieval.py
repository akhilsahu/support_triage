"""Associate authorized source images with retrieved passages using injected product policy.

No ingestion or appearance mutations. Image IDs bind Space, source, revision and URL.
"""
import hashlib
import json
import re
from urllib.parse import urlsplit

import structlog


logger = structlog.get_logger()


def safe_image_url(value):
    if not isinstance(value, str) or re.search(r'[\s\\\x00-\x1f]', value):
        return None
    try:
        url = urlsplit(value)
        if url.scheme in ('https', 'http') and url.hostname and not url.username and not url.password:
            return value
    except ValueError:
        pass
    return None


_DECORATIVE = re.compile(r'\b(payment methods?|secure payments?|logo|sprite|spacer|tracking pixel|placeholder)\b', re.I)
_SERVICE_GRAPHIC = re.compile(r'\b(delivery|shipping|returns?)\b', re.I)
_QUERY_FILLER = {'show', 'images', 'image', 'photos', 'photo', 'pictures', 'picture', 'please', 'your', 'the', 'some', 'suggest', 'suggestions', 'recommend', 'recommendation', 'recommendations', 'something', 'anything', 'for', 'with', 'and', 'that', 'this', 'can', 'you', 'cool', 'nice', 'good', 'want', 'see', 'under', 'above', 'below'}


def image_destination(image, assets, source_url, *, asset_visible):
    # Accept links attached to this exact image
    for key in ('destination_url', 'link_url', 'href'):
        if safe_image_url(image.get(key)) and image[key] != image['url']:
            return image[key], 'item'
    context = str(image.get('context_text') or '')
    from app.orchestra.ai.ingestion import markdown_asset_blocks
    for block in markdown_asset_blocks(context):
        for candidate in block['images']:
            destination = candidate.get('destination_url')
            if candidate['url'] == image['url'] and safe_image_url(destination) and destination != image['url']:
                return destination, 'item'
    links = assets.get('links', []) if isinstance(assets.get('links'), list) else []
    for link in links:
        if (isinstance(link, dict) and link.get('image_url') == image['url']
                and asset_visible(link)):
            url = safe_image_url(link.get('url'))
            if url and url != image['url']:
                return url, 'item'

    # No explicit association: retain the source page rather than guess a destination.
    return source_url, 'source'


def query_terms(query):
    words = set(re.findall(r"[^\W\d_]{3,}", query.casefold())) - _QUERY_FILLER
    aliases = {'womens': 'women', 'woman': 'women', 'ladies': 'women', 'mens': 'men', 'man': 'men', 'shipping': 'delivery', 'return': 'returns', 'refund': 'returns', 'refunds': 'returns'}
    return {aliases.get(word, word) for word in words}


def build_source_images(source, *, config, asset_visible):
    """Build image evidence after the caller has authorized the source revision."""
    metadata = source.source_metadata or {}
    assets = metadata.get('assets') or {}
    raw_images = assets.get('images', []) if isinstance(assets, dict) else []
    if not isinstance(raw_images, list):
        return []
    results = []
    seen = set()
    for image in raw_images:
        if not asset_visible(image):
            continue
        url = safe_image_url(image.get('url'))
        if not url or url in seen:
            continue
        seen.add(url)
        parts = list(dict.fromkeys(str(image.get(key) or '').strip() for key in ('title', 'caption', 'alt', 'section', 'context_text')))
        caption = ' '.join(part for part in parts if part)
        own_description = ' '.join(str(image.get(key) or '') for key in ('title', 'caption', 'alt'))
        if _DECORATIVE.search(own_description) or _DECORATIVE.search(url.rsplit('/', 1)[-1].replace('_', ' ').replace('-', ' ')):
            continue
        service_topics = query_terms(' '.join(_SERVICE_GRAPHIC.findall(own_description + ' ' + url.rsplit('/', 1)[-1].replace('_', ' ').replace('-', ' '))))
        source_url = safe_image_url(getattr(source, 'source_locator', None))
        destination_url, link_kind = image_destination(image, assets, source_url, asset_visible=asset_visible)
        if not caption:
            continue  # No basis for the model to choose or describe this image.
        version = (source.source_metadata or {}).get('indexed_source_version') or source.published_version or source.source_version
        key = f'{source.space_id}:{source.id}:{version}:{url}'
        results.append({
            'id': hashlib.sha256(key.encode()).hexdigest(),
            'url': url,
            'caption': caption[:config.max_caption_characters],
            'sourceId': str(source.id),
            'title': next((part for part in parts if part), str(source.title or 'Source'))[:120],
            'sourceUrl': source_url,
            'destinationUrl': destination_url,
            'linkKind': link_kind,
            'matchText': own_description,
            'serviceTopics': sorted(service_topics),
            'sourceTitle': str(source.title or 'Source'),
            'sourceVersion': version,
        })
    return results


def _chunk_images(metadata):
    raw = (metadata or {}).get('images_json')
    try:
        images = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return []
    return [image for image in images if isinstance(image, dict) and safe_image_url(image.get('url'))] if isinstance(images, list) else []


def _associate_chunk_image(image, candidates, *, max_caption_characters, whole_source=False):
    """Share association resolution; a whole source requires one destination/label."""
    destinations = {destination for candidate in candidates
                    if (destination := safe_image_url(candidate.get('destination_url')))
                    and destination != image['url']}
    if len(destinations) > 1 or (whole_source and not destinations):
        return None
    resolved = dict(image)
    if destinations:
        resolved['destinationUrl'] = next(iter(destinations))
        resolved['linkKind'] = 'item'
    local = next((candidate for candidate in candidates
                  if safe_image_url(candidate.get('destination_url')) in destinations), candidates[0])
    if whole_source:
        labels = {str(candidate.get('title') or candidate.get('alt') or '').strip()
                  for candidate in candidates if str(candidate.get('title') or candidate.get('alt') or '').strip()}
        title = next(iter(labels))[:120] if len(labels) == 1 else ''
    else:
        title = str(local.get('title') or local.get('alt') or '').strip()
    if title:
        resolved['title'] = title[:120]
        resolved['caption'] = title[:max_caption_characters]
        if not whole_source:
            resolved['matchText'] = title
    return resolved


def resolve_published_chunk_image(space_id: str, doc_id: str, image: dict, *, config) -> dict:
    """Apply an unambiguous published chunk association to a resolved image."""
    try:
        from app.orchestra.ai.knowledge.vector_store import get_vector_store

        result = get_vector_store().read_client_chunks(
            str(space_id), doc_id=str(doc_id), limit=None, content=False,
        )
    except Exception as exc:
        logger.warning("chat_image.chunk_metadata_lookup_failed", doc_id=str(doc_id), error=str(exc))
        return image

    matches = [candidate for metadata in result.get('metadatas') or []
               for candidate in _chunk_images(metadata) if candidate['url'] == image.get('url')]
    return _associate_chunk_image(image, matches, whole_source=True, max_caption_characters=config.max_caption_characters) or image


def select_chat_images(sources, passages, query, *, images_for_source, doc_id_for_source, config):
    """Prefer exact chunk-image relationships, with legacy caption matching as fallback."""
    matched = {}
    associated = {}
    for passage in passages:
        doc_id = str(passage.get('meta', {}).get('doc_id'))
        matched[doc_id] = matched.get(doc_id, '') + '\n' + passage['content']
        associated.setdefault(doc_id, []).extend(_chunk_images(passage.get('meta')))
    terms = query_terms(query)
    ranked = []
    for source in sources:
        doc_id = doc_id_for_source(source)
        passage = matched.get(doc_id)
        if not passage:
            continue
        available = images_for_source(source)
        local_images = associated.get(doc_id, [])
        if local_images:
            available_by_url = {image['url']: image for image in available}
            local_by_url = {}
            for local in local_images:
                local_by_url.setdefault(local['url'], []).append(local)
            for position, (url, candidates) in enumerate(local_by_url.items()):
                image = available_by_url.get(url)
                if not image:
                    continue
                image = _associate_chunk_image(image, candidates, max_caption_characters=config.max_caption_characters)
                if image is None:
                    continue
                overlap = len(query_terms(image['matchText']) & terms)
                # An exact parser association outranks page-wide caption guesses;
                # source order breaks ties without inventing semantic labels.
                ranked.append((100 + overlap * 3 - position, image))
            continue

        passage_terms = set(re.findall(r'\w{3,}', passage.lower()))
        for image in available:
            service_topics = set(image['serviceTopics'])
            requested_service = service_topics & terms
            if service_topics and not requested_service:
                continue
            caption_terms = query_terms(image['matchText']) | service_topics
            overlap = len(caption_terms & terms)
            context_overlap = len(caption_terms & passage_terms)
            # Page-wide context cannot establish the category/audience of an image.
            audiences = terms & {'women', 'men', 'kids', 'children'}
            if audiences and not requested_service and not audiences.issubset(caption_terms):
                continue
            if terms and not overlap:
                continue
            ranked.append((overlap * 3 + context_overlap, image))
    ranked.sort(key=lambda item: item[0], reverse=True)
    unique = {}
    for _, image in ranked:
        unique.setdefault(image['url'], image)
    return list(unique.values())[:config.max_context_images]


def _normalized_link_text(value: str) -> str:
    """Normalize visible source text while dropping common legal suffixes."""
    value = re.sub(r"(?i)\*?\b(t&c\s*apply|terms\s*and\s*conditions\s*apply|sponsored)\b", " ", value)
    return " ".join(re.findall(r"[^\W_]+", value.casefold()))


def _link_belongs_to_passage(link: dict, passage: str) -> bool:
    """Require the source's own label or local context to occur in the hit."""
    normalized_passage = _normalized_link_text(passage)
    if not normalized_passage:
        return False
    for field in ("context_text", "title"):
        candidate = _normalized_link_text(str(link.get(field) or ""))
        if len(candidate) >= 4 and candidate in normalized_passage:
            return True
    return False


def attach_source_assets(sources_by_doc, query, pack, *, config, images_for_source, doc_id_for_source, asset_visible):
    items = list(sources_by_doc.values())
    pack.images = select_chat_images(
        items, pack.passages, query, config=config,
        images_for_source=images_for_source, doc_id_for_source=doc_id_for_source,
    )

    # Links accompany the retrieved chunks, not a separate category search.
    seen_urls = set()

    def add_link(link):
        if not isinstance(link, dict) or len(pack.links) >= 10:
            return
        if not asset_visible(link):
            return
        url = safe_image_url(link.get("url"))
        if not url or url in seen_urls:
            return
        seen_urls.add(url)
        pack.links.append({"title": str(link.get("title") or url), "url": url})

    for passage in pack.passages:
        raw_links = passage["meta"].get("links_json")
        try:
            links = json.loads(raw_links) if isinstance(raw_links, str) else raw_links
        except (TypeError, ValueError):
            links = []
        if isinstance(links, list):
            for link in links:
                add_link(link)

        # Some parsers keep visible text in the vector chunk and richer links
        # in source metadata. Rejoin only exact local text matches from the
        # same published source; never expose unrelated page navigation.
        source = sources_by_doc.get(passage["meta"].get("doc_id"))
        assets = (source.source_metadata or {}).get("assets", {}) if source else {}
        source_links = assets.get("links", []) if isinstance(assets, dict) else []
        for link in source_links if isinstance(source_links, list) else []:
            if _link_belongs_to_passage(link, passage["content"]):
                add_link(link)
    for image in pack.images:
        add_link({"title": image["title"], "url": image.get("destinationUrl")})
