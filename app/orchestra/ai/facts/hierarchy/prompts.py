"""
Prompts for the Hierarchy Builder.
"""

BASE_HIERARCHY_PROMPT = """
You are an expert ontology architect. You will receive a list of entity names (subjects) extracted from a document.
Your task is to build a strict, clean hierarchy (canonical names, variants/children, and exact aliases).

CRITICAL RULES:
1. STRICT ALIASING: An alias MUST be the EXACT SAME entity. Do NOT cluster distinct entities as aliases. If two entities have different features, fees, or identifiers, they are NOT aliases.
2. UNIQUENESS: A subject can only appear as an alias under EXACTLY ONE canonical name.
3. PARENT/CHILD RELATIONSHIPS: If a subject is clearly a variant, tier, or sub-product of another, create a separate canonical node for it and set its `parent_product` to the base product.
4. GENERAL TERMS: Leave generic terms as their own canonical nodes without aliases.

Return a structured JSON output matching the requested schema.
"""

DOMAIN_SPECIFIC_PROMPTS = {
    "credit_card": """
DOMAIN RULES (credit_card):
- Check for relations on how entities can fit into each other (e.g., base product vs variant).
- Group different tiers of the same product family under the base product.
- Treat standalone unique products as their own canonical nodes.
- Do not use hardcoded examples; apply these relation heuristics strictly based on the text.
    """
}

def get_hierarchy_prompt(domain_category: str = None) -> str:
    """
    Constructs the final system prompt by appending the domain specific rules
    to the base prompt, matching the structure the fine-tuned model expects.
    """
    prompt = BASE_HIERARCHY_PROMPT.strip()
    if domain_category and domain_category in DOMAIN_SPECIFIC_PROMPTS:
         prompt += "\n\n" + DOMAIN_SPECIFIC_PROMPTS[domain_category].strip()
    return prompt
