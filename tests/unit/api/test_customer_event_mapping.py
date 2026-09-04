from app.api.customer import _answer_event_data


def test_answer_event_data_excludes_customer_content_and_reasoning() -> None:
    data = _answer_event_data(
        {
            "reply": "customer-facing content",
            "reasoning": "private chain of thought",
            "agent": "support",
            "intent": "troubleshooting",
            "rag_hit": True,
            "citations": [{"id": "one"}, {"id": "two"}],
            "model": "openai/gpt-4o-mini",
            "reasoning_effort": "medium",
        },
        250,
        transport="sse",
    )

    dumped = data.model_dump()
    assert dumped["agent"] == "support"
    assert dumped["source_count"] == 2
    assert dumped["response_ms"] == 250
    assert dumped["metadata"] == {"transport": "sse"}
    assert "reply" not in dumped
    assert "reasoning" not in dumped
