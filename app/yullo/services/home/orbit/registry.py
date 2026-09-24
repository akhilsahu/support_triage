from typing import Tuple
from app.yullo.services.home.orbit.base import OrbitProvider
from app.yullo.services.home.orbit.pulse import PulseProvider
from app.yullo.services.home.orbit.momentum import MomentumProvider
from app.yullo.services.home.orbit.null_nearby import NullNearbyProvider
from app.yullo.services.home.orbit.null_connection import NullConnectionProvider

def build_orbit_providers(config: dict) -> Tuple[OrbitProvider, ...]:
    providers = []
    
    # Check config to see which ones are enabled
    # "Enablement is orbit.providers.pulse=true,momentum=true,nearby=false,connection=false"
    orbit_config = config.get("orbit", {}).get("providers", {})
    
    if orbit_config.get("pulse", True):
        providers.append(PulseProvider())
        
    if orbit_config.get("momentum", True):
        providers.append(MomentumProvider())
        
    if orbit_config.get("nearby", False):
        # Even if enabled, currently we only have Null provider
        providers.append(NullNearbyProvider())
        
    if orbit_config.get("connection", False):
        providers.append(NullConnectionProvider())
        
    # If explicitly enabled or we just return default empty providers if not configured
    # but the plan says "enabled unavailable providers still return no fabricated data", which is exactly what Null providers do.
    # To be safe, if the keys are absent, we can assume the defaults.
    if "nearby" not in orbit_config:
        providers.append(NullNearbyProvider())
    if "connection" not in orbit_config:
        providers.append(NullConnectionProvider())
        
    return tuple(providers)
