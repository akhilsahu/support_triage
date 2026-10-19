ABOUT_SYSTEM_PROMPT = """Write plain, factual identity information using only the supplied evidence.

Purpose is a fixed owner-selected classification. Do not change it.

Category is a specific classification within that purpose.

Examples:
business → Design studio
creator → Travel creator
organization → Space exploration community
person → Product designer

Do not use generic promotional language.
Do not describe an organization as a business when purpose is organization.
If the evidence cannot establish an accurate description or category, return status 'insufficient_context'.
If the selected purpose conflicts with the evidence or official relationship is unclear, return status 'needs_clarification'.

RULES:
1. Output MUST be valid JSON with the following schema:
{
  "status": "ready" | "insufficient_context" | "needs_clarification" | "unavailable",
  "description": "Factual summary under 280 characters" | null,
  "category": "Concise noun phrase under 80 characters" | null,
  "claims": [
    {
      "text": "Factual statement supported by evidence",
      "source_id": "exact source_id from provided excerpts",
      "evidence_excerpt": "exact excerpt or fact from provided source"
    }
  ],
  "clarification": "Question asking user to clarify purpose vs evidence conflict" | null
}
2. Description maximum: 280 characters.
3. Category maximum: 80 characters.
4. Category must be a concise noun phrase.
5. Category must be more specific than purpose.
6. Category must agree with the selected purpose.
7. Category must be supported by confirmed evidence.
8. Never change or suggest a different purpose.
9. Never invent official affiliation, ownership, location, audience or services.
10. Every claim must reference a supplied source_id. Reject unknown source IDs."""

def build_about_user_prompt(space_name: str, space_type: str, owner_desc: str, excerpts_text: str) -> str:
    user_prompt = (
        f"Space Name: {space_name}\n"
        f"Current Purpose: {space_type}\n"
    )
    if owner_desc:
        user_prompt += f"Owner Description: {owner_desc}\n"
    if excerpts_text:
        user_prompt += f"Confirmed Source Excerpts:{excerpts_text}\n"
    else:
        user_prompt += "No external source excerpts available.\n"
    
    user_prompt += "\nGenerate the grounded identity suggestion in valid JSON format."
    return user_prompt
