from typing import List, Tuple, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.orbit.base import OrbitProvider, OrbitCandidate
from app.yullo.services.home.orbit.registry import build_orbit_providers

class OrbitComposition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dominant: OrbitCandidate
    supporting: List[OrbitCandidate]

def collect_orbit_candidates(
    snapshot: HomeSnapshot, 
    config: dict, 
    now: datetime, 
    providers: Tuple[OrbitProvider, ...]
) -> List[OrbitCandidate]:
    candidates = []
    for provider in providers:
        candidates.extend(provider.collect(snapshot, config, now))
    return candidates

def compose_orbit(candidates: List[OrbitCandidate]) -> Optional[OrbitComposition]:
    if not candidates:
        return None
        
    # Deduplicate and sort
    # "sorts by priority desc, observedAt desc, stable id asc"
    sorted_candidates = sorted(
        candidates,
        key=lambda c: (c.priority, c.evidence.observedAt.timestamp() if c.evidence else 0, c.id),
        reverse=True
    )
    # Reverse=True on sorting flips the id order to desc. To fix, sort normally with negative keys
    sorted_candidates = sorted(
        candidates,
        key=lambda c: (-c.priority, -(c.evidence.observedAt.timestamp() if c.evidence else 0), c.id)
    )
    
    seen_spaces = set()
    seen_kinds = set()
    
    dominant = sorted_candidates[0]
    dominant.role = "dominant"
    
    seen_spaces.add(dominant.spaceId)
    seen_kinds.add(dominant.kind)
    
    supporting = []
    for c in sorted_candidates[1:]:
        if len(supporting) >= 3:
            break
            
        # Prefer different Spaces and different signal kinds for supporting slots
        # Actually the plan says "Prefer different Spaces...", it doesn't strictly exclude duplicates 
        # if no others are available, but usually filtering them is what "prefer" means in a simple rule.
        # Let's strictly exclude for variety unless we want to just penalize. 
        # A simple approach: only pick if space AND kind not already used, OR we run out of unique ones.
        # Let's just do a greedy unique selection first.
        if c.spaceId not in seen_spaces or c.kind not in seen_kinds:
            c.role = "supporting"
            supporting.append(c)
            seen_spaces.add(c.spaceId)
            seen_kinds.add(c.kind)
            
    # If we didn't fill 3 and there are remaining items that we skipped, we can append them
    # "fewer than 4 is valid"
    # To keep it simple, we just use the unique ones.
    
    return OrbitComposition(dominant=dominant, supporting=supporting)

def build_orbit(snapshot: HomeSnapshot, config: dict, now: datetime) -> Optional[OrbitComposition]:
    providers = build_orbit_providers(config)
    candidates = collect_orbit_candidates(snapshot, config, now, providers)
    return compose_orbit(candidates)
