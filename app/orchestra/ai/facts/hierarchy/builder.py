import logging
from typing import List
import json

from app.core.llm_provider import get_async_openai_clients
from app.orchestra.ai.facts.schemas import ExtractedFact
from app.orchestra.ai.facts.hierarchy.schemas import ProductNode, HierarchyTree
from app.orchestra.ai.facts.hierarchy.prompts import get_hierarchy_prompt

logger = logging.getLogger(__name__)

async def build_hierarchy_tree(subjects: List[str], domain_category: str = "credit_card", override_model: str = None, override_provider: str = None) -> HierarchyTree:
    """
    Takes a list of raw extracted subjects and asks an LLM to build a hierarchy tree.
    """
    if not subjects:
        return HierarchyTree(nodes=[])
        
    logger.info("Building hierarchy tree from subjects", extra={"subject_count": len(subjects)})
    
    # We will use the modal deployment for our custom trained hierarchy extractor
    target_provider = override_provider or "modal"
    clients = get_async_openai_clients(override_model=override_model)
    clients = [c for c in clients if c[0] == target_provider]
        
    if not clients:
        logger.error("No LLM clients available for hierarchy building.")
        raise RuntimeError("No LLM clients available")
        
    last_error = None
    for provider, client, model_name in clients:
        logger.info(f"Trying {provider} with model {model_name} for hierarchy building")
        try:
            # Construct prompt based on domain
            system_prompt = get_hierarchy_prompt(domain_category=domain_category)
            
            response = await client.beta.chat.completions.parse(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Here are the subjects:\n\n{json.dumps(subjects, indent=2)}"}
                ],
                response_format=HierarchyTree,
                temperature=0.1,
                max_tokens=6000
            )
            tree = response.choices[0].message.parsed
            if tree:
                logger.info("Successfully built hierarchy tree", extra={"node_count": len(tree.nodes), "provider": provider})
                return tree
            else:
                logger.error(f"{provider} returned empty parsed response")
                return HierarchyTree(nodes=[])
        except Exception as e:
            logger.warning(f"Failed to build hierarchy tree with {provider}: {e}")
            last_error = e
            continue
            
    logger.error(f"All LLM clients failed to build hierarchy tree. Last error: {last_error}")
    # Fallback empty tree
    return HierarchyTree(nodes=[])

def apply_hierarchy_to_facts(facts: List[ExtractedFact], tree: HierarchyTree) -> List[ExtractedFact]:
    """
    Applies the hierarchy tree to a list of facts, updating the 'subject' of each fact
    to its canonical product_name based on the aliases mapping.
    """
    if not tree.nodes:
        return facts
        
    # Build a lookup map: alias -> canonical name
    alias_map = {}
    for node in tree.nodes:
        # A node's canonical name is an alias to itself effectively
        alias_map[node.product_name.lower()] = node.product_name
        for alias in node.aliases:
            alias_map[alias.lower()] = node.product_name
            
    updated_facts = []
    updated_count = 0
    
    for fact in facts:
        # We don't mutate the original, we create a copy
        subject_lower = fact.subject.lower()
        if subject_lower in alias_map:
            canonical_name = alias_map[subject_lower]
            if fact.subject != canonical_name:
                updated_fact = fact.model_copy(update={"subject": canonical_name})
                # Optionally add a note or metadata about parent product here if needed
                updated_facts.append(updated_fact)
                updated_count += 1
            else:
                updated_facts.append(fact)
        else:
            # Not found in map, leave as is
            updated_facts.append(fact)
            
    logger.info("Applied hierarchy to facts", extra={"updated_count": updated_count, "total_facts": len(facts)})
    return updated_facts
