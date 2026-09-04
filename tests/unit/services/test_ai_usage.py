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


async def test_track_usage_estimates_watsonx_and_records(monkeypatch):
    """watsonx returns no usage — _track_usage must estimate and mark estimated."""
    import asyncio

    import app.services.ai_usage as mod
    captured = {}

    async def fake_record(ev):
        captured["ev"] = ev

    monkeypatch.setattr(mod, "record_usage_event", fake_record)

    from app.services.llm_service import llm_service

    llm_service._track_usage(
        provider="watsonx", model="ibm/granite-13b-chat-v2",
        messages=[{"role": "user", "content": "x" * 400}],
        system_prompt=None, content="y" * 80,
        usage=None, latency_ms=150, ok=True, error_type=None,
    )
    await asyncio.sleep(0)  # let the fire-and-forget task run

    ev = captured["ev"]
    assert ev.kind == "chat" and ev.provider == "watsonx"
    assert ev.estimated is True
    assert ev.prompt_tokens == 100 and ev.completion_tokens == 20
    assert ev.total_tokens == 120 and ev.ok is True


async def test_track_usage_openai_real_usage_not_estimated(monkeypatch):
    import asyncio

    import app.services.ai_usage as mod
    captured = {}

    async def fake_record(ev):
        captured["ev"] = ev

    monkeypatch.setattr(mod, "record_usage_event", fake_record)

    from app.services.llm_service import llm_service

    class _FakePydanticUsage:
        def model_dump(self):
            return {"prompt_tokens": 30, "completion_tokens": 10, "total_tokens": 40}

    llm_service._track_usage(
        provider="openai", model="gpt-4o-mini",
        messages=[{"role": "user", "content": "hi"}],
        system_prompt=None, content="hello",
        usage=_FakePydanticUsage(), latency_ms=90, ok=True, error_type=None,
    )
    await asyncio.sleep(0)

    ev = captured["ev"]
    assert ev.estimated is False and ev.prompt_tokens == 30
    assert ev.completion_tokens == 10 and ev.total_tokens == 40


async def test_tracked_embedding_function_records_usage(monkeypatch):
    """Chroma EF wrapper: passes vectors through, records estimated usage."""
    import asyncio

    import app.services.ai_usage as mod
    captured = {}

    async def fake_record(ev):
        captured["ev"] = ev

    monkeypatch.setattr(mod, "record_usage_event", fake_record)

    from app.orchestra.ai.embedding import service as emb_service

    calls = []

    def fake_inner(texts):
        calls.append(list(texts))
        return [[0.1, 0.2] for _ in texts]

    ef = emb_service._UsageTrackedEmbeddingFunction(
        fake_inner, provider="openai", model="text-embedding-3-small",
    )
    # attribute delegation to the inner EF still works
    fake_inner.fancy_attr = "kept"
    assert ef.fancy_attr == "kept"

    out = ef(["hello world", "second text"])
    await asyncio.sleep(0)  # let the fire-and-forget task run

    assert out == [[0.1, 0.2], [0.1, 0.2]]          # vectors untouched
    assert calls == [["hello world", "second text"]]
    ev = captured["ev"]
    assert ev.kind == "embedding" and ev.estimated is True
    assert ev.prompt_tokens == 5                    # 23 chars // 4
    assert ev.completion_tokens == 0 and ev.total_tokens == 5
    assert ev.meta == {"batch_size": 2}


