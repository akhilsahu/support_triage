"""AI usage recorder + usage-extraction tests. No DB needed."""
from app.services.ai_usage import build_usage_event, estimate_tokens


def test_estimate_tokens_chars_over_four():
    assert estimate_tokens("x" * 40) == 10
    assert estimate_tokens("") == 0


def test_build_usage_event_with_real_tokens():
    ev = build_usage_event(kind="chat", provider="openai", model="gpt-4o-mini",
                           latency_ms=100,
                           usage={"prompt_tokens": 3, "completion_tokens": 2},
                           estimated=False)
    assert ev.kind == "chat"
    assert ev.ok is True
    assert ev.total_tokens == 5
    assert ev.estimated is False


def test_build_usage_event_estimated_flags_row():
    ev = build_usage_event(kind="embedding", provider="openai", model="text-embedding-3-small",
                           latency_ms=20,
                           usage={"prompt_tokens": 12, "completion_tokens": 0},
                           estimated=True)
    assert ev.estimated is True and ev.total_tokens == 12
    assert ev.kb_id is None  # no attribution context set in this test


def test_build_usage_event_error_row():
    ev = build_usage_event(kind="chat", provider="anthropic", model="claude-3-5-sonnet",
                           latency_ms=8000, usage=None, ok=False,
                           error_type="RateLimitError")
    assert ev.ok is False and ev.error_type == "RateLimitError"
    assert ev.total_tokens is None
