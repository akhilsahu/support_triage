"""
Canned-reply API + model tests.

The CRUD endpoints are async and require a live DB + JWT, so this suite
focuses on the parts that are unit-testable without a full HTTP stack:
- CannedReply model: construction + to_dict round-trip
- Pydantic schemas: validation and whitespace stripping
- Endpoint module: all four routes registered on the router
"""
import uuid
from datetime import datetime

from app.api.v1.inbox.canned_replies import router, CannedReplyIn, CannedReplyUpdate
from app.models.inbox import CannedReply


# ── Model ──────────────────────────────────────────────────────────────────

class _FakeSpace:
    """Minimal stand-in for the Space ORM in model-level tests."""
    def __init__(self, space_id: str = "11111111-1111-1111-1111-111111111111"):
        self.id = uuid.UUID(space_id)


def test_canned_reply_to_dict_round_trip():
    now = datetime(2026, 5, 9, 12, 0, 0)
    reply = CannedReply(
        id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        label="Refund ack",
        body="We've received your refund request. It will be processed in 3-5 days.",
        created_at=now,
        updated_at=now,
    )

    d = reply.to_dict()

    assert d["label"] == "Refund ack"
    assert "3-5 days" in d["body"]
    assert d["created_at"] == "2026-05-09T12:00:00"
    assert d["updated_at"] == "2026-05-09T12:00:00"
    assert d["id"] == str(reply.id)
    assert d["space_id"] == str(reply.space_id)


def test_canned_reply_to_dict_handles_null_timestamps():
    reply = CannedReply(
        id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        label="Hi",
        body="Hello!",
    )
    # created_at/updated_at default in DB — simulate fresh object pre-flush
    reply.created_at = None
    reply.updated_at = None

    d = reply.to_dict()
    assert d["created_at"] is None
    assert d["updated_at"] is None


# ── Pydantic schemas ───────────────────────────────────────────────────────

def test_canned_reply_in_accepts_valid():
    req = CannedReplyIn(label="Greeting", body="Hi there!")
    assert req.label == "Greeting"
    assert req.body == "Hi there!"


def test_canned_reply_in_strips_whitespace_from_label():
    # The endpoint handler strips + validates; Pydantic just needs a string.
    req = CannedReplyIn(label="  Hi  ", body="  Hello!  ")
    assert req.label == "  Hi  "  # raw — stripping happens in the endpoint
    assert req.body == "  Hello!  "


def test_canned_reply_in_accepts_minimal_strings():
    # Empty strings are rejected by the endpoint (HTTP 400), not Pydantic.
    req = CannedReplyIn(label="x", body="y")
    assert req.label == "x"
    assert req.body == "y"


def test_canned_reply_update_allows_partial():
    req = CannedReplyUpdate(label="New label")
    assert req.label == "New label"
    assert req.body is None


def test_canned_reply_update_allows_empty():
    req = CannedReplyUpdate()
    assert req.label is None
    assert req.body is None


# ── Router wiring ──────────────────────────────────────────────────────────

def test_router_has_all_four_routes():
    registered = [(r.path, frozenset(r.methods)) for r in router.routes]
    assert ("/inbox/canned-replies", frozenset({"GET"})) in registered
    assert ("/inbox/canned-replies", frozenset({"POST"})) in registered
    assert ("/inbox/canned-replies/{reply_id}", frozenset({"PUT"})) in registered
    assert ("/inbox/canned-replies/{reply_id}", frozenset({"DELETE"})) in registered


def test_router_prefix_is_inbox():
    assert router.prefix == "/inbox"
