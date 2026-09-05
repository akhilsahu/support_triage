"""SSE reconnect dedup helper tests.

The stream endpoint is POST-based SSE via fetchSSE, so a dropped connection
resends the turn. _match_completed_turn decides whether the turn already
persisted (replay) or must run live (avoid duplicate LLM answers + cost).
"""
from app.api.customer import _match_completed_turn


class _Row:
    def __init__(self, role, message, timestamp=None):
        self.role = role
        self.message = message
        self.timestamp = timestamp


def test_replay_when_latest_turn_matches():
    rows = [
        _Row("assistant", "Here's your order status."),
        _Row("user", "where is my order"),
    ]
    assert _match_completed_turn(rows, "where is my order") == "Here's your order status."


def test_no_replay_when_latest_row_is_user():
    rows = [
        _Row("user", "where is my order"),
        _Row("assistant", "older reply"),
    ]
    assert _match_completed_turn(rows, "where is my order") is None


def test_no_replay_when_messages_differ():
    rows = [
        _Row("assistant", "reply to the first"),
        _Row("user", "first question"),
    ]
    # Client resent after a partial replication — but the stored message differs.
    assert _match_completed_turn(rows, "a totally different question") is None


def test_no_replay_when_insufficient_rows():
    assert _match_completed_turn([_Row("assistant", "lonely")], "hi") is None
    assert _match_completed_turn([], "hi") is None


def test_replay_ignores_whitespace_differences():
    rows = [
        _Row("assistant", "ok"),
        _Row("user", "  where   is my order  "),
    ]
    assert _match_completed_turn(rows, "where is my order") == "ok"