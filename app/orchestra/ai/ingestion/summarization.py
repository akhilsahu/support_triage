"""Optional document summary shared by ingestion entry points."""
import structlog

logger = structlog.get_logger()


async def generate_summary(content: str) -> str:
    """Generate a highly concise 1-2 sentence semantic summary of the text content."""
    if not content or not content.strip():
        return ""
    from app.services.llm_service import llm_service
    snippet = content[:6000].strip()
    system_prompt = (
        "You are an AI that writes extremely concise summaries for customer support documents. "
        "Write exactly one or two sentences summarizing the main topic or scope of this document. "
        "Do not include any intro, meta-commentary, or pleasantries."
    )
    try:
        res = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": f"Document content:\n{snippet}\n\nSummary:"}],
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=150,
        )
        if res and res.get("content"):
            return res["content"].strip()
    except Exception as e:
        logger.warning("Failed to generate semantic summary", error=str(e))
    return ""

