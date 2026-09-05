from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import current_space
from app.core.encryption import encrypt
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool
from app.models.integration_package import IntegrationPackage, IntegrationPackageTool

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/")
async def list_active_integrations(db: AsyncSession = Depends(get_db)):
    """List all active integration packages for the tenant."""
    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(IntegrationPackage).where(IntegrationPackage.is_active == True).order_by(IntegrationPackage.name)
    )
    packages = result.scalars().all()
    return {
        "integrations": [
            {
                "id": str(p.id),
                "slug": p.slug,
                "name": p.name,
                "description": p.description,
                "icon_url": p.icon_url,
                "connection_template": p.connection_template
            }
            for p in packages
        ]
    }


class IntegrationInstallRequest(BaseModel):
    # This dictionary maps template variables (e.g., 'store_domain', 'access_token') to the user's provided values.
    credentials: dict[str, str]


class IntegrationInstallResponse(BaseModel):
    connection_id: UUID
    tool_ids: list[UUID]


@router.post("/{slug}/install", response_model=IntegrationInstallResponse)
async def install_integration(
    slug: str,
    req: IntegrationInstallRequest,
    db: AsyncSession = Depends(get_db),
    space = Depends(current_space)
):
    from sqlalchemy import select as sa_select
    
    # 1. Fetch package and verify it is active
    result = await db.execute(sa_select(IntegrationPackage).where(IntegrationPackage.slug == slug))
    package = result.scalar_one_or_none()
    
    if not package or not package.is_active:
        raise HTTPException(404, "Integration package not found or inactive.")
        
    conn_tpl = package.connection_template
    if not conn_tpl:
        raise HTTPException(400, "Integration package has no connection template.")
        
    # 2. Build Base URL safely
    try:
        base_url = conn_tpl["base_url_template"].format(**req.credentials)
    except KeyError as e:
        raise HTTPException(400, f"Missing required credential for template: {e}")
        
    # 3. Create Connection
    conn = DataSourceConnection(
        space_id=space.id,
        name=conn_tpl.get("name", package.name),
        base_url=base_url,
        auth_type=conn_tpl.get("auth_type"),
        auth_header=conn_tpl.get("auth_header"),
        encrypted_secret=encrypt(req.credentials.get("access_token", "")) if req.credentials.get("access_token") else None
    )
    conn.default_headers = conn_tpl.get("default_headers", {})
    
    db.add(conn)
    await db.flush()
    
    # 4. Fetch tools for package
    tools_res = await db.execute(
        sa_select(IntegrationPackageTool).where(IntegrationPackageTool.package_id == package.id)
    )
    package_tools = tools_res.scalars().all()
    
    # 5. Create Tools
    tool_ids = []
    for ptool in package_tools:
        tool = DataSourceTool(
            space_id=space.id,
            connection_id=conn.id,
            name=ptool.name,
            display_name=ptool.name,
            description=ptool.description,
            method=ptool.method,
            path=ptool.path,
            risk_classification=ptool.risk_classification,
            record_path=ptool.output_mapping.get("record_path") if ptool.output_mapping else None,
            max_records=10 # sensible default
        )
        tool.input_schema = ptool.input_schema or {}
        tool.request_template = ptool.request_template or {}
        tool.output_mapping = ptool.output_mapping or {}
        
        db.add(tool)
        await db.flush()
        tool_ids.append(tool.id)
        
    await db.commit()
    
    return IntegrationInstallResponse(
        connection_id=conn.id,
        tool_ids=tool_ids
    )
