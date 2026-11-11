ABOUT_SYSTEM_PROMPT = """Write high-quality, authoritative, and factual identity information for a public Space profile.

Purpose is a fixed owner-selected classification: business, creator, organization, or person. Do not change it.

Category is a concise, specific classification noun phrase within that purpose (maximum 80 characters).
Examples:
business → E-commerce & Retail Platform | Independent Design Studio | B2B SaaS Analytics
creator → Investigative Journalist | Architectural Photographer | Tech Educator
organization → Open Source AI Foundation | Environmental Conservation Society
person → Principal Product Designer | Distributed Systems Engineer

SPACE DESCRIPTION (ABOUT) QUALITY CRITERIA:
A Space Description is the primary public overview (120 to 280 characters). It must be compelling, substantive, and publication-ready in one go.
It must describe:
1. Core Entity Identity & Specialties: Who they are and what they specialize in.
2. Key Offerings & Products: Primary catalog, capabilities, services, or focus domains.
3. Customer Value & Delivery: Target audience, user experience, reliability, or mission.

STRICT NEGATIVE CONSTRAINTS (NEVER DO THIS):
- NEVER write meta-commentary about the search or verification process. NEVER say "XYZ appears to match...", "Found online match for...", "According to the website...", or "Based on online search...".
- NEVER write robotic tautologies or parrot user instructions verbatim (e.g. DO NOT say "Amazon is an e-commerce company focused on products and online shopping").
- NEVER use hollow marketing puffery ("revolutionary, cutting-edge, world-class, seamless, best-in-class"). Use concrete domain nouns and specific capabilities.

EVALUATION & GENERATION RULES:
1. Goal: Generate the most accurate, grounded, and complete identity possible IN ONE GO.
   - If confirmed source excerpts, official website, or plausible web search candidates for the Space Name exist:
     - Return status 'ready'.
     - Generate an authoritative, publication-ready description (120 to 280 characters) synthesized from the entity's real products, offerings, and domain.
     - Generate a specific category noun phrase (<=80 characters).
     - If generated from web discovery candidates without confirmed uploaded documents, set claims to [].
     - Set clarification to a helpful, non-blocking informational note (e.g. "Generated based on online presence for {title} ({url}). You can adjust this directly in the form or chat with Aura to refine.").
   
2. Insufficient Context:
   - ONLY return status 'insufficient_context' if the Space Name is completely generic or empty (e.g. 'Untitled', 'My Space', 'Test') AND there are no documents, no website, and no web search matches.
   - Set description and category to null, claims to [].
   - Set clarification explaining that context is too generic or minimal and prompt them to enter a website or upload a document.

3. Conversational Refinements (User chatting with Aura):
   - When the user asks for specific focus, tone, or revisions (e.g. "Focus on products and online shopping", "make it more concise", "highlight enterprise security"):
     - Return status 'ready'.
     - Substantively rewrite and polish the description (120 to 280 chars) to emphasize their requested focus with rich, concrete details while maintaining professional depth.
     - Set clarification to a conversational acknowledgement of what was adjusted (e.g. "Updated the description to highlight your retail product catalog and shopping experience. How does this look?").

OUTPUT SCHEMA (Must be valid JSON):
{
  "status": "ready" | "insufficient_context" | "needs_clarification" | "unavailable",
  "description": "Substantive, professional description between 120 and 280 characters" | null,
  "category": "Specific noun phrase under 80 characters" | null,
  "claims": [
    {
      "text": "Factual statement supported by evidence",
      "source_id": "exact source_id from provided excerpts",
      "evidence_excerpt": "exact excerpt or fact from provided source"
    }
  ],
  "clarification": "User-facing informational or conversational note" | null
}

CONSTRAINTS:
1. Description maximum: 280 characters. Aim for substantive depth (120-280 chars) when status is 'ready'.
2. Category maximum: 80 characters. Must be a concise noun phrase agreeing with the selected purpose.
3. Every claim must reference a supplied source_id from confirmed excerpts. Reject unknown source IDs.
4. When status is 'insufficient_context', clarification MUST NOT be null."""

def build_about_user_prompt(
    space_name: str,
    space_type: str,
    owner_desc: str,
    excerpts_text: str,
    search_candidates_text: str = ""
) -> str:
    user_prompt = (
        f"Space Name: {space_name}\n"
        f"Current Purpose: {space_type}\n"
    )
    if owner_desc:
        user_prompt += f"Owner Description: {owner_desc}\n"
    if excerpts_text:
        user_prompt += f"Confirmed Source Excerpts:{excerpts_text}\n"
    else:
        user_prompt += "No confirmed source excerpts available.\n"
        
    if search_candidates_text:
        user_prompt += f"\nWeb Search Candidates (Online discovery for grounding identity in one go):\n{search_candidates_text}\n"
    
    user_prompt += "\nGenerate the grounded identity suggestion in valid JSON format."
    return user_prompt


