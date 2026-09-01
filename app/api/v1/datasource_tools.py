"""Tenant-scoped management API for REST-backed agent tools."""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import asdict
from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.core.encryption import encrypt
from app.models.agent_tool_assignment import AgentToolAssignment, DataSourceTestRun
from app.models.chatbot import Chatbot
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool
from app.models.space import BuiltinAgentCatalog, ChatbotCustomAgent, CustomAgent, SpaceBuiltinAgentConfig
from app.schemas.datasource import (
    AssignmentReplace,
    ConnectionCreate,
    ConnectionUpdate,
    ExecuteTestRequest,
    DataSourceAnalyzeRequest,
    DataSourceImportRequest,
    DraftExecuteTestRequest,
    ToolCreate,
    ToolUpdate,
)
from app.services.datasource.contracts import DataSourceDraft, DraftConnection, DraftTool, ExecutionContext, ToolConfig
from app.services.datasource.analyzer import analyze_sample
from app.services.datasource.executor import DataSourceExecutor
from app.services.datasource.importer import DataSourceImportError, parse_curl, parse_openapi
from app.services.datasource.sanitizer import sanitize_mapping
from app.services.datasource.security import UnsafeDestinationError, validate_static_headers
from app.services.datasource.validator import ToolValidationError, validate_tool_config

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/data-sources", tags=["Data Sources"])


def _draft(req) -> DataSourceDraft:
    return DataSourceDraft(
        source_type=req.source_type,
        connection=DraftConnection(**req.connection.model_dump()),
        tool=DraftTool(**req.tool.model_dump()),
        warnings=tuple(req.warnings),
    )


@router.post("/import")
async def import_draft(req: DataSourceImportRequest, space=Depends(current_space)):
    """Parse configuration into reviewable drafts without saving anything."""
    del space
    try:
        if req.kind == "curl":
            if not isinstance(req.content, str):
                raise DataSourceImportError("cURL content must be text")
            drafts = [parse_curl(req.content)]
        else:
            document = req.content
            if isinstance(document, str):
                try:
                    import yaml
                    document = yaml.safe_load(document)
                except Exception as exc:
                    raise DataSourceImportError("OpenAPI content is not valid JSON or YAML") from exc
            drafts = parse_openapi(document, req.operation_id)
    except DataSourceImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"drafts": [asdict(draft) for draft in drafts]}


@router.post("/analyze")
async def analyze_draft(req: DataSourceAnalyzeRequest, space=Depends(current_space)):
    """Analyze a supplied response; this endpoint does not call the upstream API."""
    del space
    try:
        result = await analyze_sample(_draft(req.draft), req.sample, use_ai=req.use_ai)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return sanitize_mapping(asdict(result))


@router.post("/test")
async def test_draft(req: DraftExecuteTestRequest, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    """Execute a temporary reviewed draft without persisting configuration or history."""
    await _chatbot(db, space.id, req.chatbot_id)
    draft = _draft(req.draft)
    connection, tool = draft.connection, draft.tool
    config = ToolConfig(
        name=tool.name, method=tool.method, path=tool.path, input_schema=tool.input_schema,
        request_template=tool.request_template, record_path=tool.record_path,
        field_mapping=tool.output_mapping, base_url=connection.base_url,
        default_headers=connection.default_headers, auth_type=connection.auth_type,
        auth_header=connection.auth_header,
        encrypted_secret=encrypt(req.credential) if req.credential else None,
    )
    result = await DataSourceExecutor().execute(
        config, req.arguments, ExecutionContext(space_id=space.id, chatbot_id=req.chatbot_id)
    )
    return sanitize_mapping(asdict(result))


def _not_found(label: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{label} not found")


async def _commit(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A data source with these values already exists") from exc


def _post_commit_invalidate(space_id: UUID, chatbot_ids: Collection[UUID]) -> None:
    """Best-effort boundary for Task 6's targeted runner invalidation."""
    try:
        from app.orchestra.ai.session.pool import pool

        hook = getattr(pool, "invalidate_datasource_runners", None)
        if callable(hook):
            hook(str(space_id), [str(value) for value in chatbot_ids])
        elif chatbot_ids:
            pool.invalidate_bot_agents(str(space_id))
    except Exception:  # cache invalidation must not undo committed config
        logger.warning("datasource.pool_invalidate_failed", space_id=str(space_id))


async def _connection(db: AsyncSession, space_id: UUID, connection_id: UUID) -> DataSourceConnection:
    item = await db.scalar(select(DataSourceConnection).where(
        DataSourceConnection.id == connection_id, DataSourceConnection.space_id == space_id
    ))
    if item is None:
        raise _not_found("Connection")
    return item


async def _tool(db: AsyncSession, space_id: UUID, tool_id: UUID) -> DataSourceTool:
    item = await db.scalar(select(DataSourceTool).where(
        DataSourceTool.id == tool_id, DataSourceTool.space_id == space_id
    ))
    if item is None:
        raise _not_found("Tool")
    return item


async def _chatbot(db: AsyncSession, space_id: UUID, chatbot_id: UUID) -> Chatbot:
    item = await db.scalar(select(Chatbot).where(Chatbot.id == chatbot_id, Chatbot.space_id == space_id))
    if item is None:
        raise _not_found("Chatbot")
    return item


def _config(tool: DataSourceTool, connection: DataSourceConnection) -> ToolConfig:
    return ToolConfig(
        name=tool.name, method=tool.method, path=tool.path, input_schema=tool.input_schema,
        request_template=tool.request_template, record_path=tool.record_path,
        field_mapping=tool.output_mapping, max_records=tool.max_records,
        max_response_bytes=tool.max_response_bytes, risk_classification=tool.risk_classification,
        base_url=connection.base_url, default_headers=connection.default_headers,
        auth_type=connection.auth_type, auth_header=connection.auth_header,
        encrypted_secret=connection.encrypted_secret,
    )


def _validate(tool: DataSourceTool, connection: DataSourceConnection) -> None:
    try:
        validate_tool_config(_config(tool, connection))
    except (ToolValidationError, UnsafeDestinationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _public_tool(tool: DataSourceTool) -> dict:
    # Request templates are configuration, not a supported credential store,
    # but redact defensively in case a legacy/imported row contains one.
    payload = sanitize_mapping(tool.to_dict())
    headers = payload.get("request_template", {}).get("headers")
    if isinstance(headers, dict):
        payload["request_template"]["headers"] = {key: "[REDACTED]" for key in headers}
    return payload


async def _affected_chatbots(db: AsyncSession, tool_id: UUID) -> set[UUID]:
    result = await db.execute(select(AgentToolAssignment.chatbot_id).where(AgentToolAssignment.tool_id == tool_id))
    return set(result.scalars().all())


@router.get("/connections")
async def list_connections(db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    result = await db.execute(select(DataSourceConnection).where(
        DataSourceConnection.space_id == space.id
    ).order_by(DataSourceConnection.created_at.desc()))
    return [item.to_dict() for item in result.scalars().all()]


@router.post("/connections", status_code=status.HTTP_201_CREATED)
async def create_connection(req: ConnectionCreate, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    try:
        validate_static_headers(req.default_headers)
    except UnsafeDestinationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    item = DataSourceConnection(
        space_id=space.id, name=req.name, base_url=req.base_url, auth_type=req.auth_type,
        auth_header=req.auth_header, encrypted_secret=encrypt(req.secret) if req.secret is not None else None,
    )
    item.default_headers = req.default_headers
    db.add(item)
    await _commit(db)
    await db.refresh(item)
    _post_commit_invalidate(space.id, ())
    return item.to_dict()


@router.get("/connections/{connection_id}")
async def get_connection(connection_id: UUID, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    return (await _connection(db, space.id, connection_id)).to_dict()


@router.patch("/connections/{connection_id}")
async def update_connection(connection_id: UUID, req: ConnectionUpdate, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    item = await _connection(db, space.id, connection_id)
    values = req.model_dump(exclude_unset=True)
    secret_present = "secret" in values
    secret = values.pop("secret", None)
    if "default_headers" in values:
        try:
            validate_static_headers(values["default_headers"])
        except UnsafeDestinationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    for field in ("name", "base_url", "auth_type", "auth_header", "status"):
        if field in values:
            setattr(item, field, values[field])
    if "default_headers" in values:
        item.default_headers = values["default_headers"]
    if secret_present:
        item.encrypted_secret = encrypt(secret) if secret else None
    tool_ids = (await db.execute(select(DataSourceTool.id).where(DataSourceTool.connection_id == item.id))).scalars().all()
    chatbot_ids: set[UUID] = set()
    for tool_id in tool_ids:
        chatbot_ids.update(await _affected_chatbots(db, tool_id))
    await _commit(db)
    await db.refresh(item)
    _post_commit_invalidate(space.id, chatbot_ids)
    return item.to_dict()


@router.delete("/connections/{connection_id}", status_code=204)
async def delete_connection(connection_id: UUID, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    item = await _connection(db, space.id, connection_id)
    tool_ids = (await db.execute(select(DataSourceTool.id).where(DataSourceTool.connection_id == item.id))).scalars().all()
    if tool_ids:
        raise HTTPException(status_code=409, detail="Delete the connection's tools first")
    await db.delete(item)
    await _commit(db)
    _post_commit_invalidate(space.id, ())
    return Response(status_code=204)


@router.get("/tools")
async def list_tools(connection_id: UUID | None = None, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    query = select(DataSourceTool).where(DataSourceTool.space_id == space.id)
    if connection_id is not None:
        await _connection(db, space.id, connection_id)
        query = query.where(DataSourceTool.connection_id == connection_id)
    result = await db.execute(query.order_by(DataSourceTool.created_at.desc()))
    return [_public_tool(item) for item in result.scalars().all()]


@router.post("/tools", status_code=status.HTTP_201_CREATED)
async def create_tool(req: ToolCreate, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    connection = await _connection(db, space.id, req.connection_id)
    item = DataSourceTool(space_id=space.id, connection_id=connection.id)
    for key, value in req.model_dump().items():
        setattr(item, key, value)
    _validate(item, connection)
    db.add(item)
    await _commit(db)
    await db.refresh(item)
    return _public_tool(item)


@router.get("/tools/{tool_id}")
async def get_tool(tool_id: UUID, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    return _public_tool(await _tool(db, space.id, tool_id))


async def _has_current_success(db: AsyncSession, tool: DataSourceTool) -> bool:
    result = await db.execute(select(DataSourceTestRun).where(
        DataSourceTestRun.space_id == tool.space_id,
        DataSourceTestRun.tool_id == tool.id,
        DataSourceTestRun.outcome == "success",
    ).order_by(DataSourceTestRun.created_at.desc()))
    return any(run.diagnostics.get("tool_revision") == tool.revision for run in result.scalars().all())


@router.patch("/tools/{tool_id}")
async def update_tool(tool_id: UUID, req: ToolUpdate, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    item = await _tool(db, space.id, tool_id)
    values = req.model_dump(exclude_unset=True)
    connection = await _connection(db, space.id, values.get("connection_id", item.connection_id))
    requested_status = values.pop("status", None)
    config_changed = bool(values)
    for key, value in values.items():
        setattr(item, key, value)
    if config_changed:
        item.revision += 1
        if item.status == "active":
            item.status = "draft"
    _validate(item, connection)
    if requested_status == "active" and not await _has_current_success(db, item):
        await db.rollback()
        raise HTTPException(status_code=409, detail="Current tool revision must pass a test before activation")
    if requested_status is not None:
        item.status = requested_status
    chatbot_ids = await _affected_chatbots(db, item.id)
    await _commit(db)
    await db.refresh(item)
    _post_commit_invalidate(space.id, chatbot_ids)
    return _public_tool(item)


@router.delete("/tools/{tool_id}", status_code=204)
async def delete_tool(tool_id: UUID, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    item = await _tool(db, space.id, tool_id)
    assignment = await db.scalar(select(AgentToolAssignment.id).where(AgentToolAssignment.tool_id == item.id).limit(1))
    test_run = await db.scalar(select(DataSourceTestRun.id).where(DataSourceTestRun.tool_id == item.id).limit(1))
    if assignment is not None or test_run is not None:
        raise HTTPException(status_code=409, detail="Remove assignments and test history before deleting this tool")
    await db.delete(item)
    await _commit(db)
    _post_commit_invalidate(space.id, ())
    return Response(status_code=204)


async def _validate_assignment(db: AsyncSession, space_id: UUID, chatbot_id: UUID, kind: str, agent_id: UUID) -> None:
    if kind == "builtin":
        valid = await db.scalar(
            select(SpaceBuiltinAgentConfig.id)
            .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
            .where(
                SpaceBuiltinAgentConfig.id == agent_id,
                SpaceBuiltinAgentConfig.space_id == space_id,
                SpaceBuiltinAgentConfig.chatbot_id == chatbot_id,
                SpaceBuiltinAgentConfig.enabled.is_(True),
                BuiltinAgentCatalog.platform_enabled.is_(True),
                BuiltinAgentCatalog.agent_type != "triage",
            )
        )
    else:
        valid = await db.scalar(
            select(CustomAgent.id).join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id).where(
                CustomAgent.id == agent_id, CustomAgent.space_id == space_id, CustomAgent.active.is_(True),
                ChatbotCustomAgent.chatbot_id == chatbot_id,
            )
        )
    if valid is None:
        raise HTTPException(status_code=422, detail="Agent is inactive, unavailable, or outside this chatbot")


@router.get("/tools/{tool_id}/assignments")
async def list_assignments(tool_id: UUID, chatbot_id: UUID | None = None, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    await _tool(db, space.id, tool_id)
    query = select(AgentToolAssignment).where(
        AgentToolAssignment.space_id == space.id, AgentToolAssignment.tool_id == tool_id
    )
    if chatbot_id is not None:
        await _chatbot(db, space.id, chatbot_id)
        query = query.where(AgentToolAssignment.chatbot_id == chatbot_id)
    result = await db.execute(query)
    return [item.to_dict() for item in result.scalars().all()]


@router.put("/tools/{tool_id}/assignments")
async def replace_assignments(tool_id: UUID, req: AssignmentReplace, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    await _tool(db, space.id, tool_id)
    await _chatbot(db, space.id, req.chatbot_id)
    identities = [(value.agent_kind, value.agent_id) for value in req.assignments]
    if len(identities) != len(set(identities)):
        raise HTTPException(status_code=409, detail="Duplicate agent assignment")
    for value in req.assignments:
        await _validate_assignment(db, space.id, req.chatbot_id, value.agent_kind, value.agent_id)
    await db.execute(delete(AgentToolAssignment).where(
        AgentToolAssignment.space_id == space.id,
        AgentToolAssignment.tool_id == tool_id,
        AgentToolAssignment.chatbot_id == req.chatbot_id,
    ))
    replacements = [AgentToolAssignment(
        space_id=space.id, chatbot_id=req.chatbot_id, tool_id=tool_id,
        agent_kind=value.agent_kind, agent_id=value.agent_id, enabled=value.enabled,
    ) for value in req.assignments]
    db.add_all(replacements)
    await _commit(db)
    _post_commit_invalidate(space.id, {req.chatbot_id})
    return {"chatbot_id": str(req.chatbot_id), "assignments": [item.to_dict() for item in replacements]}


@router.post("/tools/{tool_id}/execute-test")
async def execute_test(tool_id: UUID, req: ExecuteTestRequest, db: AsyncSession = Depends(get_db), space=Depends(current_space)):
    tool = await _tool(db, space.id, tool_id)
    await _chatbot(db, space.id, req.chatbot_id)
    connection = await _connection(db, space.id, tool.connection_id)
    result = await DataSourceExecutor().execute(
        _config(tool, connection), req.arguments,
        ExecutionContext(space_id=space.id, chatbot_id=req.chatbot_id),
    )
    run = DataSourceTestRun(
        space_id=space.id, connection_id=connection.id, tool_id=tool.id,
        outcome="success" if result.succeeded else "failure",
        failure_category=result.failure.code if result.failure else None,
        message=result.failure.message if result.failure else "Test completed successfully",
        latency_ms=result.latency_ms, status_code=result.status_code,
    )
    run.diagnostics = {"tool_revision": tool.revision, "record_count": len(result.records)}
    db.add(run)
    connection.last_health_status = run.outcome
    connection.last_health_message = run.message
    connection.last_health_checked_at = datetime.utcnow()
    await _commit(db)
    payload = {
        "outcome": run.outcome, "records": result.records if result.succeeded else [],
        "failure": ({"code": result.failure.code, "message": result.failure.message,
                     "retryable": result.failure.retryable} if result.failure else None),
        "status_code": result.status_code, "latency_ms": result.latency_ms,
        "tool_revision": tool.revision,
    }
    return sanitize_mapping(payload)
