"""Account and browser ownership for canonical Aura sessions and transcripts."""
import hashlib
import secrets
from datetime import timezone
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import select, tuple_, String
from app.models.chat import ChatSession
from app.models.space import ConversationLog


def proof_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def stored_citation(raw):
    """Retain delivered reference labels/links, without retrieved source snippets."""
    if not isinstance(raw, dict) or not isinstance(raw.get('id'), str) or not isinstance(raw.get('label'), str):
        return None
    result = {'id': raw['id'][:128], 'label': raw['label'][:240]}
    url = raw.get('sourceUrl')
    if isinstance(url, str) and len(url) <= 8192 and not any(ord(char) < 33 for char in url) and '\\' not in url:
        try:
            parsed = urlsplit(url)
            if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username and not parsed.password:
                result['sourceUrl'] = url
        except ValueError:
            pass
    return result


def browser_owns(session, token):
    return bool(session.guest_token_hash and token and len(token) == 64
                and secrets.compare_digest(session.guest_token_hash, proof_hash(token)))


async def authorize_session(db, *, space_id, session_id, user_id=None, guest_token=None,
                            lock=False, allow_legacy=False):
    statement = select(ChatSession).where(ChatSession.id == session_id, ChatSession.space_id == space_id,
                                         ChatSession.runtime_type == 'aura')
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    session = await db.scalar(statement)
    if not session:
        raise HTTPException(404, 'Conversation not found.')
    permitted = (session.yullo_user_id == user_id if session.yullo_user_id else
                 browser_owns(session, guest_token) or (allow_legacy and not session.guest_token_hash))
    if not permitted:
        raise HTTPException(404, 'Conversation not found.')
    return session


async def claim_sessions(db, *, space_id, user_id, proofs):
    tokens = {proof.session_id: proof.token for proof in proofs}
    sessions = (await db.scalars(select(ChatSession).where(
        ChatSession.id.in_(tokens), ChatSession.space_id == space_id, ChatSession.runtime_type == 'aura',
    ).order_by(ChatSession.id).with_for_update().execution_options(populate_existing=True))).all()
    claimed = []
    for session in sessions:
        if session.yullo_user_id == user_id:
            claimed.append(str(session.id))
        elif session.yullo_user_id is None and browser_owns(session, tokens[session.id]):
            session.yullo_user_id = user_id
            session.guest_token_hash = None
            claimed.append(str(session.id))
    await db.flush()
    return claimed


async def list_sessions(db, *, space_id, user_id, before=None, limit=50):
    conditions = [ChatSession.space_id == space_id, ChatSession.yullo_user_id == user_id,
                  ChatSession.runtime_type == 'aura', ChatSession.message_count > 0]
    if before:
        anchor = await authorize_session(db, space_id=space_id, session_id=before, user_id=user_id)
        conditions.append(tuple_(ChatSession.last_message_at, ChatSession.id)
                          < tuple_(anchor.last_message_at, anchor.id))
    first_question = select(ConversationLog.message).where(
        ConversationLog.session_id == ChatSession.id.cast(String),
        ConversationLog.space_id == space_id, ConversationLog.runtime_type == 'aura', ConversationLog.role == 'user',
    ).order_by(ConversationLog.timestamp, ConversationLog.id).limit(1).scalar_subquery()
    rows = (await db.execute(select(ChatSession, first_question).where(*conditions).order_by(
        ChatSession.last_message_at.desc(), ChatSession.id.desc(),
    ).limit(limit + 1))).all()
    items = [{
        'id': str(session.id), 'title': (session.title or question or 'Chat')[:100],
        'updatedAt': int(session.last_message_at.replace(tzinfo=timezone.utc).timestamp() * 1000),
    } for session, question in rows[:limit]]
    return {'items': items, 'before': str(rows[limit - 1][0].id) if len(rows) > limit else None}


def _public_blocks(raw):
    blocks = []
    for node in raw if isinstance(raw, list) else []:
        if not isinstance(node, dict) or 'entity' in node or 'entities' in node:
            continue
        kind = node.get('type')
        if kind in ('service', 'portfolio', 'location') and isinstance(node.get('entityId'), str):
            blocks.append({'type': kind, 'entityId': node['entityId']})
        elif kind in ('images', 'actions'):
            key = 'imageIds' if kind == 'images' else 'entityIds'
            values = node.get(key)
            if isinstance(values, list) and all(isinstance(value, str) for value in values):
                blocks.append({'type': kind, key: values[:4]})
    return blocks


async def read_transcript(db, *, session, before=None, limit=100):
    conditions = [ConversationLog.space_id == session.space_id, ConversationLog.session_id == str(session.id),
                  ConversationLog.runtime_type == 'aura', ConversationLog.role.in_(('user', 'assistant'))]
    if before:
        anchor = await db.scalar(select(ConversationLog).where(*conditions, ConversationLog.id == before))
        if not anchor:
            raise HTTPException(404, 'Message not found.')
        conditions.append(tuple_(ConversationLog.timestamp, ConversationLog.id) < tuple_(anchor.timestamp, anchor.id))
    rows = list((await db.scalars(select(ConversationLog).where(*conditions).order_by(
        ConversationLog.timestamp.desc(), ConversationLog.id.desc(),
    ).limit(limit + 1))).all())
    selected = list(reversed(rows[:limit]))
    return {'messages': [{
        'id': str(row.id), 'role': 'user' if row.role == 'user' else 'aura', 'text': row.message or '',
        'ui': _public_blocks(row.blocks) if row.role == 'assistant' else [],
        'citations': [citation for value in (row.citations if isinstance(row.citations, list) else [])
                      if (citation := stored_citation(value))],
        'status': 'complete',
    } for row in selected], 'before': str(selected[0].id) if len(rows) > limit else None}
