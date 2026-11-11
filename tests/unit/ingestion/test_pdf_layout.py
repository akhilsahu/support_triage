from app.orchestra.ai.config import IngestionConfig
from app.orchestra.ai.ingestion.parsers.pdf_parser import (
    PdfParser,
    _sort_blocks_reading_order,
)
from app.orchestra.ai.core.document_models import ParsedDocument, ParsedPage


def _block(text: str, x: float, y: float, width: float = 80) -> dict:
    return {
        "type": 0,
        "bbox": (x, y, x + width, y + 12),
        "lines": [{"spans": [{"text": text}]}],
    }


def test_physical_page_count_wins_over_logical_fragments():
    document = ParsedDocument(
        filename="deck.pdf",
        extension=".pdf",
        pages=[ParsedPage(page=1, text="prose"), ParsedPage(page=1, text="table")],
        metadata={"page_count": 1},
    )

    assert document.page_count == 1


def test_reading_order_groups_nearly_equal_y_before_sorting_x():
    blocks = [
        _block("64 Metric Tons", 460, 852.9),
        _block("100 Metric Tons", 665, 852.9),
        _block("23 Metric Tons", 264, 853.0),
    ]

    ordered = _sort_blocks_reading_order(blocks)

    assert [block["lines"][0]["spans"][0]["text"] for block in ordered] == [
        "23 Metric Tons",
        "64 Metric Tons",
        "100 Metric Tons",
    ]


def test_borderless_column_table_becomes_atomic_fact_rows():
    parser = PdfParser(IngestionConfig(vision_enabled=False))
    blocks = [
        _block("FALCON 9", 266, 818),
        _block("FALCON HEAVY", 451, 818),
        _block("STARSHIP", 668, 818),
        _block("Payload Capacity to LEO", 40, 853, 130),
        _block("23 Metric Tons", 264, 852.9),
        _block("64 Metric Tons", 464, 852.9),
        _block("100 Metric Tons", 665, 852.9),
        _block("Total Number of Flights", 40, 888, 135),
        _block("~620", 284, 887.7),
        _block("11", 492, 887.7),
        _block("12", 693, 887.7),
    ]

    tables = parser._find_borderless_column_tables(
        blocks,
        [],
        page_width=826,
        pdf_page=3,
        boilerplate=set(),
    )

    assert len(tables) == 1
    assert "| FALCON 9 | Payload Capacity to LEO | 23 Metric Tons |" in tables[0]["text"]
    assert "| FALCON HEAVY | Payload Capacity to LEO | 64 Metric Tons |" in tables[0]["text"]
    assert "| STARSHIP | Total Number of Flights | 12 |" in tables[0]["text"]
