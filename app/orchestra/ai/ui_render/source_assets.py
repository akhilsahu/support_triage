"""Request-local compact references; destinations never need model-generated copies."""
import json
import re

from app.orchestra.ai.knowledge.retrieval.images_retrieval import safe_image_url


class SourceAssetReferences:
    def __init__(self):
        self.destinations = {}
        self.aliases = {}
        self.ids = {}
        self.images = {}
        self.counters = {'link': 0, 'image': 0}

    def register(self, url, kind='link', identifier=None, *, distinct=False):
        if not safe_image_url(url):
            return None
        kind = 'image' if kind == 'image' else 'link'
        key = (kind, url)
        if distinct or key not in self.aliases:
            prefix = 'I' if kind == 'image' else 'L'
            self.counters[kind] += 1
            alias = prefix + str(self.counters[kind])
            self.aliases[key] = alias
            self.destinations[alias] = url
        alias = self.aliases[key]
        if isinstance(identifier, str) and identifier:
            self.ids[identifier] = alias
        return alias

    def collect(self, value, kind='link'):
        if isinstance(value, dict):
            local_kind = value.get('kind') if value.get('kind') in ('link', 'image') else kind
            url = value.get('url')
            if url:
                self.register(url, local_kind, value.get('asset_id'))
            for key, child in value.items():
                if key in ('image_url', 'src'):
                    self.register(child, 'image', value.get('image_id'))
                elif key in ('destination_url', 'destinationUrl', 'href', 'link_url', 'sourceUrl', 'source_locator'):
                    self.register(child, identifier=value.get('destination_id'))
                elif isinstance(child, (dict, list)):
                    self.collect(child, 'image' if key == 'images' else local_kind)
        elif isinstance(value, list):
            for child in value:
                self.collect(child, kind)

    def bind_images(self, images):
        for image in images:
            alias = self.ids.get(image['id'])
            if alias is None:
                alias = self.register(image['url'], 'image', image['id'], distinct=True)
            self.aliases[('image', image['url'])] = alias
            self.images[alias] = image['id']

    def image_id(self, identifier):
        if not isinstance(identifier, str):
            return identifier
        return self.images.get(identifier, identifier)

    @property
    def image_urls(self):
        return {f'image:{alias}': identifier for alias, identifier in self.images.items()}

    def compact(self, value, kind='link'):
        if isinstance(value, dict):
            result = {}
            local_kind = value.get('kind') if value.get('kind') in ('link', 'image') else kind
            for key, child in value.items():
                if key in ('asset_refs', 'asset_refs_json'):
                    continue
                target_kind = 'image' if key in ('images', 'image_url', 'src') else local_kind
                if key in ('destination_url', 'destinationUrl', 'href', 'link_url', 'sourceUrl', 'source_locator'):
                    target_kind = 'link'
                alias = self.aliases.get((target_kind, child)) if isinstance(child, str) else None
                result[key] = (('image:' if target_kind == 'image' else 'link:') + alias
                               if alias else self.compact(child, target_kind))
            return result
        if isinstance(value, list):
            return [self.compact(child, kind) for child in value]
        if not isinstance(value, str):
            return value
        if value in self.ids:
            return self.ids[value]
        # Literal replacement preserves punctuation and query strings. Longer
        # URLs go first so a homepage prefix cannot corrupt a product reference.
        replacements = {}
        for (asset_kind, url), alias in self.aliases.items():
            if url not in replacements or asset_kind == 'link':
                replacements[url] = ('image:' if asset_kind == 'image' else 'link:') + alias
        for url in sorted(replacements, key=len, reverse=True):
            value = re.sub(re.escape(url) + r'(?=$|[\s\"\'<>\]\)])',
                           lambda _match: replacements[url], value)
        for identifier, alias in self.ids.items():
            value = value.replace(identifier, alias)
        return value

    def format_passage(self, passage, formatter):
        payload = json.loads(formatter(passage))
        self.collect(payload)
        return json.dumps(self.compact(payload), ensure_ascii=False)


class LinkReferencePresentation:
    """Resolve complete Markdown references across stream boundaries, outside code."""
    def __init__(self, references):
        self.references = references
        self.pending = ''
        self.code = None

    def feed(self, text, final=False):
        self.pending += text
        output = []
        while self.pending:
            marker = re.match(r'`+|~{3,}', self.pending)
            if marker:
                token = marker.group()
                if len(token) == len(self.pending) and not final:
                    break
                if self.code is None:
                    self.code = token
                elif self.code == token:
                    self.code = None
                output.append(token)
                self.pending = self.pending[len(token):]
                continue
            if self.code is not None or self.pending[0] != '[':
                output.append(self.pending[0])
                self.pending = self.pending[1:]
                continue
            label_end = self.pending.find(']')
            if label_end < 0 or len(self.pending) <= label_end + 1:
                if not final and len(self.pending) < 4096:
                    break
                output.append(self.pending)
                self.pending = ''
                break
            if self.pending[label_end + 1] != '(':
                output.append('[')
                self.pending = self.pending[1:]
                continue
            close = self.pending.find(')', label_end + 2)
            if close < 0:
                if not final and len(self.pending) < 4096:
                    break
                target = self.pending[label_end + 2:]
                output.append(self.pending[1:label_end] if target.startswith('link:') else self.pending)
                self.pending = ''
                break
            target = self.pending[label_end + 2:close].strip().split(' "', 1)[0].strip('<>')
            if not target.startswith('link:'):
                output.append(self.pending[:close + 1])
            else:
                label = self.pending[1:label_end]
                alias = target[5:]
                url = self.references.destinations.get(alias) if re.fullmatch(r'L\d+', alias) else None
                if url:
                    destination = url.replace('<', '%3C').replace('>', '%3E')
                    output.append(f'[{label}](<{destination}>)')
                else:
                    output.append(label)
            self.pending = self.pending[close + 1:]
        return ''.join(output)
