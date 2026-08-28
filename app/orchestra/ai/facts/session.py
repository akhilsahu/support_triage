import json
from typing import List, Dict, Any, Optional
from app.core.redis import get_redis

def _get_redis_key(doc_id: str) -> str:
    return f"v2_facts:{doc_id}"

async def get_chat_history(doc_id: str) -> List[Dict[str, Any]]:
    """Retrieve the current chat history from Redis."""
    redis = await get_redis()
    state_str = await redis.get(_get_redis_key(doc_id))
    if not state_str:
        return []
    state = json.loads(state_str)
    return state.get("chat_history", [])

async def sync_chat_history(doc_id: str, chat_history: List[Dict[str, Any]]) -> None:
    """Overwrite the chat history in Redis."""
    redis = await get_redis()
    key = _get_redis_key(doc_id)
    state_str = await redis.get(key)
    if not state_str:
        state = {"status": "none"}
    else:
        state = json.loads(state_str)
    state["chat_history"] = chat_history
    await redis.set(key, json.dumps(state))
