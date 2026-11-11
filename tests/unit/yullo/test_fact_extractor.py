import json

import pytest

from app.orchestra.ai.knowledge.extraction.facts import extractor


@pytest.mark.asyncio
async def test_extract_facts_uses_source_text_and_keeps_distinct_values(monkeypatch):
    chunks = [
        {
            "id": "chunk-1",
            "text": "[Context: invented premium tier]\n\nNorthstar offices: Delhi and Mumbai.",
            "metadata": {
                "source_text": "Northstar offices: Delhi and Mumbai.",
                "filename": "company.pdf",
                "page": 2,
                "is_table": False,
                "is_table_row": False,
            },
        }
    ]

    class Store:
        def get_doc_chunks(self, _space_id, _doc_id):
            return chunks

    observed = {}

    async def complete(providers, body):
        observed["body"] = body
        return json.dumps(
            {
                "facts": [
                    {"subject": "Northstar", "label": "Office", "value": "Delhi", "note": "", "chunk_index": 0, "evidence_excerpt": "Northstar offices: Delhi and Mumbai."},
                    {"subject": "Northstar", "label": "Office", "value": "Mumbai", "note": "", "chunk_index": 0, "evidence_excerpt": "Northstar offices: Delhi and Mumbai."},
                ]
            }
        ), providers

    monkeypatch.setattr(extractor, "get_vector_store", lambda: Store())
    monkeypatch.setattr(extractor, "_providers", lambda: [("test", object(), "test")])
    monkeypatch.setattr(extractor, "_complete", complete)

    facts = await extractor.extract_facts("space-1", "doc-1")

    assert "invented premium tier" not in observed["body"]
    assert [fact["value"] for fact in facts] == ["Delhi", "Mumbai"]


def test_select_chunks_keeps_table_rows_and_prose():
    chunks = [
        {"id": "row", "metadata": {"is_table_row": True, "doc_id": "doc", "table_id": "table"}},
        {"id": "prose", "metadata": {}},
        {"id": "whole-table", "metadata": {"is_table": True, "doc_id": "doc", "table_id": "table"}},
    ]

    selected, mode = extractor._select_chunks(chunks)

    assert mode == "mixed"
    assert [chunk["id"] for chunk in selected] == ["row", "prose"]


@pytest.mark.asyncio
async def test_extract_facts_rejects_cross_row_subject_value_binding(monkeypatch):
    chunks = [
        {
            "id": "falcon-9",
            "text": "FALCON 9 — Payload Capacity to LEO: 23 Metric Tons.",
            "metadata": {"source_text": "FALCON 9 — Payload Capacity to LEO: 23 Metric Tons.", "is_table_row": True},
        },
        {
            "id": "falcon-heavy",
            "text": "FALCON HEAVY — Payload Capacity to LEO: 64 Metric Tons.",
            "metadata": {"source_text": "FALCON HEAVY — Payload Capacity to LEO: 64 Metric Tons.", "is_table_row": True},
        },
    ]

    class Store:
        def get_doc_chunks(self, _space_id, _doc_id):
            return chunks

    async def complete(providers, _body):
        return json.dumps({"facts": [{
            "subject": "FALCON 9",
            "label": "Payload Capacity to LEO",
            "value": "64 Metric Tons",
            "note": "",
            "chunk_index": 1,
            "evidence_excerpt": "FALCON HEAVY — Payload Capacity to LEO: 64 Metric Tons.",
        }]}), providers

    monkeypatch.setattr(extractor, "get_vector_store", lambda: Store())
    monkeypatch.setattr(extractor, "_providers", lambda: [("test", object(), "test")])
    monkeypatch.setattr(extractor, "_complete", complete)

    assert await extractor.extract_facts("space-1", "doc-1") == []


@pytest.mark.asyncio
async def test_prose_heading_evidence_and_invalid_duplicate_do_not_drop_good_fact(monkeypatch):
    class Store:
        def get_doc_chunks(self, *_):
            return [{"id": "prose", "text": "Starship\nA reusable system carrying crew and cargo.", "metadata": {}}]

    async def complete(providers, body):
        base = {"subject": "Starship", "label": "Capability", "value": "carrying crew and cargo",
                "chunk_index": 0, "subject_evidence_excerpt": "Starship"}
        return json.dumps({"facts": [
            {**base, "evidence_excerpt": "Invented passage"},
            {**base, "evidence_excerpt": "A reusable system carrying crew and cargo."},
        ]}), providers

    monkeypatch.setattr(extractor, "get_vector_store", lambda: Store())
    monkeypatch.setattr(extractor, "_providers", lambda: [("test", object(), "test")])
    monkeypatch.setattr(extractor, "_complete", complete)
    result = await extractor.extract_facts("space", "doc")
    assert len(result) == 1
    assert result.diagnostics["rejected"] == 1
    assert result.diagnostics["accepted"] == 1


def test_malformed_output_is_not_no_facts():
    with pytest.raises(ValueError):
        extractor._parse("not json")
    with pytest.raises(ValueError):
        extractor._parse('{"something_else": []}')
    assert extractor._parse('{"facts": []}') == []


@pytest.mark.asyncio
async def test_missing_indexed_chunks_is_failure(monkeypatch):
    class Store:
        def get_doc_chunks(self, *_):
            return []
    monkeypatch.setattr(extractor, "get_vector_store", lambda: Store())
    with pytest.raises(RuntimeError, match="No indexed chunks"):
        await extractor.extract_facts("space", "doc")
