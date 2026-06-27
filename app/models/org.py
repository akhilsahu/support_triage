# Compatibility shim — all models moved to app.models.space / app.models.datasource
# This file can be removed once all imports are confirmed updated.
from app.models.space import *  # noqa: F401, F403
from app.models.space import (
    Space as Organization,
    SpaceBuiltinAgentConfig as OrgBuiltinAgentConfig,
)
from app.models.datasource import SpaceDataSource as OrgDataSource  # noqa: F401
