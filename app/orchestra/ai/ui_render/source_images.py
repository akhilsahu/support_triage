"""Source-image tools, authorized-ID selection and streamed image presentation."""
import re

SHOW_SOURCE_IMAGES_TOOL = {
    'type': 'function', 'function': {
        'name': 'show_source_images',
        'description': 'Show relevant existing source images in chat. Select only IDs from the retrieved image context. Never invent URLs or claim generation.',
        'parameters': {
            'type': 'object', 'additionalProperties': False,
            'properties': {'image_ids': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 1, 'maxItems': 4}},
            'required': ['image_ids'],
        },
    },
}


def validated_image_node(ids, available, *, max_images=4):
    if not isinstance(ids, list) or not ids or len(ids) > max_images:
        return None
    allowed = {image['id'] for image in available}
    if any(not isinstance(id, str) or id not in allowed for id in ids):
        return None
    return {'type': 'images', 'imageIds': list(dict.fromkeys(ids))}


class ChatImagePresentation:
    """Hold only incomplete image Markdown while streaming ordinary text normally.

    Markdown images may appear despite tool instructions. Only exact retrieved URLs
    become image cards; unknown image references never become browser requests.
    """
    def __init__(self, images, references=None):
        self.pending = ''
        self.images = images
        self.image_ids = []
        self.code_delimiter = None
        self.references = references

    @property
    def by_url(self):
        return {**{image['url']: image['id'] for image in self.images},
                **(self.references.image_urls if self.references else {})}

    def _plain(self, text):
        for token in re.findall(r'`+|~{3,}', text):
            if self.code_delimiter is None:
                self.code_delimiter = token
            elif token == self.code_delimiter:
                self.code_delimiter = None
        return text

    def feed(self, text: str, final: bool = False) -> str:
        self.pending += text
        output = ''
        while self.pending:
            start = self.pending.find('![')
            if start < 0:
                # Preserve a possible image token split across provider chunks.
                suffix = re.search(r'(`+|~+|!)$', self.pending) if not final else None
                keep = len(suffix.group()) if suffix else 0
                output += self._plain(self.pending[:-keep] if keep else self.pending)
                self.pending = self.pending[-keep:] if keep else ''
                break
            output += self._plain(self.pending[:start])
            self.pending = self.pending[start:]
            if self.code_delimiter is not None:
                output += self.pending[:2]
                self.pending = self.pending[2:]
                continue
            alt_end = self.pending.find(']')
            if alt_end < 0:
                if final or len(self.pending) > 4096:
                    self.pending = ''
                break
            if len(self.pending) <= alt_end + 1:
                if final:
                    self.pending = ''
                break
            if self.pending[alt_end + 1] != '(':
                output += self.pending[:2]
                self.pending = self.pending[2:]
                continue
            # Balance parentheses in URLs rather than truncating legitimate paths.
            depth = 1
            end = alt_end + 2
            while end < len(self.pending) and depth:
                if self.pending[end] == '(':
                    depth += 1
                elif self.pending[end] == ')':
                    depth -= 1
                end += 1
            if depth:
                if final or len(self.pending) > 4096:
                    self.pending = ''
                break
            destination = self.pending[alt_end + 2:end - 1].strip()
            url = destination.split(' "', 1)[0].strip('<>')
            image_id = self.by_url.get(url)
            if image_id and image_id not in self.image_ids:
                self.image_ids.append(image_id)
            self.pending = self.pending[end:]
        return output
