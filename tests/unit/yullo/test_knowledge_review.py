from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.models.kb_fact import KBFact
from app.yullo.services.knowledge.review import apply_fact_review


def _fact(status: str = "extracted", verified: bool = False) -> KBFact:
    return KBFact(
        id=uuid4(),
        kb_id=uuid4(),
        space_id=uuid4(),
        subject="Opening hours",
        label="Monday",
        value="09:00–17:00",
        review_status=status,
        verified=verified,
    )


def test_confirm_fact_sets_legacy_verified_and_timestamp():
    fact = _fact()
    reviewed_at = datetime.now(UTC)

    assert apply_fact_review(fact, review_status="owner_confirmed", reviewed_at=reviewed_at) is True
    assert fact.review_status == "owner_confirmed"
    assert fact.verified is True
    assert fact.last_verified_at == reviewed_at


def test_reject_fact_clears_legacy_verified_and_timestamp():
    fact = _fact("owner_confirmed", True)
    fact.last_verified_at = datetime.now(UTC)

    assert apply_fact_review(fact, review_status="rejected", reviewed_at=datetime.now(UTC)) is True
    assert fact.review_status == "rejected"
    assert fact.verified is False
    assert fact.last_verified_at is None


@pytest.mark.parametrize("status", ["source_authoritative", "superseded"])
def test_locked_fact_cannot_be_reviewed_in_owner_source_flow(status: str):
    fact = _fact(status, status == "source_authoritative")

    with pytest.raises(ValueError):
        apply_fact_review(
            fact,
            review_status="owner_confirmed",
            reviewed_at=datetime.now(UTC),
        )
