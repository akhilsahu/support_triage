"""Authenticated, tenant-scoped APIs for deterministic chatbot evaluations."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.models.chatbot import Chatbot
from app.models.evaluation import EvaluationCase, EvaluationResult, EvaluationRun, EvaluationSuite
from app.models.space import Space
from app.schemas.evaluation import (
    EvaluationActual,
    EvaluationCaseCreate,
    EvaluationCaseOut,
    EvaluationCheck,
    EvaluationExpectation,
    EvaluationGrade,
    EvaluationGradeRequest,
    EvaluationGradeResponse,
    EvaluationMessage,
    EvaluationResultOut,
    EvaluationRunOut,
    EvaluationRunRequest,
    EvaluationSuiteCreate,
    EvaluationSuiteOut,
)
from app.services.evaluation_service import grade_evaluation
from app.services.evaluation_runner import EvaluationExecutionError, execute_evaluation_case


logger = structlog.get_logger()
router = APIRouter(prefix="/evaluations", tags=["Evaluations"])


async def _get_suite(db: AsyncSession, space_id: UUID, suite_id: UUID) -> EvaluationSuite | None:
    return (
        await db.execute(
            select(EvaluationSuite).where(
                EvaluationSuite.id == suite_id,
                EvaluationSuite.space_id == space_id,
            )
        )
    ).scalar_one_or_none()


async def _get_case(
    db: AsyncSession,
    space_id: UUID,
    suite_id: UUID,
    case_id: UUID,
) -> EvaluationCase | None:
    return (
        await db.execute(
            select(EvaluationCase).where(
                EvaluationCase.id == case_id,
                EvaluationCase.suite_id == suite_id,
                EvaluationCase.space_id == space_id,
            )
        )
    ).scalar_one_or_none()


async def _get_run(db: AsyncSession, space_id: UUID, run_id: UUID) -> EvaluationRun | None:
    return (
        await db.execute(
            select(EvaluationRun).where(
                EvaluationRun.id == run_id,
                EvaluationRun.space_id == space_id,
            )
        )
    ).scalar_one_or_none()


def _suite_out(suite: EvaluationSuite) -> EvaluationSuiteOut:
    return EvaluationSuiteOut(
        id=suite.id,
        chatbot_id=suite.chatbot_id,
        name=suite.name,
        description=suite.description,
        critical=suite.critical,
        created_at=suite.created_at,
        updated_at=suite.updated_at,
    )


def _case_out(case: EvaluationCase) -> EvaluationCaseOut:
    return EvaluationCaseOut(
        id=case.id,
        suite_id=case.suite_id,
        name=case.name,
        question=case.question,
        history=[EvaluationMessage.model_validate(message) for message in case.history],
        customer_context=case.customer_context,
        expectation=EvaluationExpectation.model_validate(case.expectations),
        enabled=case.enabled,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def _run_out(run: EvaluationRun) -> EvaluationRunOut:
    return EvaluationRunOut(
        id=run.id,
        suite_id=run.suite_id,
        target=run.target,
        status=run.status,
        total_cases=run.total_cases,
        passed_cases=run.passed_cases,
        failed_cases=run.failed_cases,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


def _result_out(result: EvaluationResult) -> EvaluationResultOut:
    return EvaluationResultOut(
        id=result.id,
        run_id=result.run_id,
        case_id=result.case_id,
        passed=result.passed,
        checks=result.checks,
        failures=result.failures,
        actual_response=result.actual_response,
        actual_agent=result.actual_agent,
        actual_source_ids=result.actual_source_ids,
        actual_rag_hit=result.actual_rag_hit,
        actual_escalated=result.actual_escalated,
        response_ms=result.response_ms,
        created_at=result.created_at,
    )


@router.post("/suites", response_model=EvaluationSuiteOut, status_code=status.HTTP_201_CREATED)
async def create_suite(
    payload: EvaluationSuiteCreate,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if payload.chatbot_id is not None:
        chatbot = (
            await db.execute(
                select(Chatbot.id).where(
                    Chatbot.id == payload.chatbot_id,
                    Chatbot.space_id == space.id,
                )
            )
        ).scalar_one_or_none()
        if chatbot is None:
            raise HTTPException(status_code=404, detail="Chatbot not found in this space.")

    suite = EvaluationSuite(
        space_id=space.id,
        chatbot_id=payload.chatbot_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        critical=payload.critical,
    )
    db.add(suite)
    await db.commit()
    await db.refresh(suite)
    logger.info("evaluation_suite.created", space_id=str(space.id), suite_id=str(suite.id))
    return _suite_out(suite)


@router.get("/suites", response_model=list[EvaluationSuiteOut])
async def list_suites(
    chatbot_id: UUID | None = Query(default=None),
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    statement = select(EvaluationSuite).where(EvaluationSuite.space_id == space.id)
    if chatbot_id is not None:
        statement = statement.where(EvaluationSuite.chatbot_id == chatbot_id)
    rows = (await db.execute(statement.order_by(EvaluationSuite.created_at.desc()))).scalars().all()
    return [_suite_out(row) for row in rows]


@router.post(
    "/suites/{suite_id}/cases",
    response_model=EvaluationCaseOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_case(
    suite_id: UUID,
    payload: EvaluationCaseCreate,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if await _get_suite(db, space.id, suite_id) is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found.")

    case = EvaluationCase(
        suite_id=suite_id,
        space_id=space.id,
        name=payload.name.strip(),
        question=payload.question.strip(),
        history=[message.model_dump() for message in payload.history],
        customer_context=payload.customer_context,
        expectations=payload.expectation.model_dump(),
        enabled=payload.enabled,
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    logger.info(
        "evaluation_case.created",
        space_id=str(space.id),
        suite_id=str(suite_id),
        case_id=str(case.id),
    )
    return _case_out(case)


@router.get("/suites/{suite_id}/cases", response_model=list[EvaluationCaseOut])
async def list_cases(
    suite_id: UUID,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if await _get_suite(db, space.id, suite_id) is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found.")
    rows = (
        await db.execute(
            select(EvaluationCase)
            .where(EvaluationCase.suite_id == suite_id, EvaluationCase.space_id == space.id)
            .order_by(EvaluationCase.created_at.asc())
        )
    ).scalars().all()
    return [_case_out(row) for row in rows]


@router.post(
    "/suites/{suite_id}/runs",
    response_model=EvaluationRunOut,
    status_code=status.HTTP_201_CREATED,
)
async def run_suite(
    suite_id: UUID,
    payload: EvaluationRunRequest,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Execute enabled cases against the current customer-serving runtime.

    Runs are synchronous and intentionally bounded while no dedicated worker
    queue exists. Individual provider failures become failed case results so a
    transient error cannot discard the rest of the suite's evidence.
    """

    suite = await _get_suite(db, space.id, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail="Evaluation suite not found.")
    if suite.chatbot_id is None:
        raise HTTPException(
            status_code=409,
            detail="Assign a chatbot to the suite before running it.",
        )

    chatbot = (
        await db.execute(
            select(Chatbot).where(
                Chatbot.id == suite.chatbot_id,
                Chatbot.space_id == space.id,
                Chatbot.active == True,
            )
        )
    ).scalar_one_or_none()
    if chatbot is None:
        raise HTTPException(status_code=409, detail="Suite chatbot is missing or inactive.")

    cases = (
        await db.execute(
            select(EvaluationCase)
            .where(
                EvaluationCase.suite_id == suite.id,
                EvaluationCase.space_id == space.id,
                EvaluationCase.enabled == True,
            )
            .order_by(EvaluationCase.created_at.asc())
            .limit(51)
        )
    ).scalars().all()
    if len(cases) > 50:
        raise HTTPException(
            status_code=422,
            detail="A synchronous evaluation run supports at most 50 enabled cases.",
        )

    run = EvaluationRun(
        suite_id=suite.id,
        space_id=space.id,
        target=payload.target,
        status="running",
        total_cases=len(cases),
        passed_cases=0,
        failed_cases=0,
        started_at=datetime.utcnow(),
    )
    db.add(run)
    # Commit the running marker before expensive provider calls. If the process
    # is interrupted, operators can distinguish an abandoned run from one that
    # was never accepted.
    await db.commit()
    await db.refresh(run)
    logger.info(
        "evaluation_run.started",
        space_id=str(space.id),
        suite_id=str(suite.id),
        run_id=str(run.id),
        total_cases=len(cases),
        target=payload.target,
    )

    passed_cases = 0
    failed_cases = 0
    for case in cases:
        try:
            actual = await execute_evaluation_case(
                db,
                space=space,
                chatbot=chatbot,
                case=case,
            )
            grade = grade_evaluation(
                EvaluationExpectation.model_validate(case.expectations),
                actual,
            )
        except EvaluationExecutionError as exc:
            # Store only the stable code. The runner logs provider details but
            # intentionally excludes them from tenant-visible persisted data.
            actual = EvaluationActual(response="")
            grade = EvaluationGrade(
                passed=False,
                checks=[
                    EvaluationCheck(
                        name="execution",
                        status="failed",
                        detail=f"Execution failed with code: {exc.code}.",
                    )
                ],
                failures=["execution"],
            )

        result = EvaluationResult(
            run_id=run.id,
            case_id=case.id,
            space_id=space.id,
            passed=grade.passed,
            checks=[check.model_dump() for check in grade.checks],
            failures=grade.failures,
            actual_response=actual.response,
            actual_agent=actual.agent,
            actual_source_ids=actual.source_ids,
            actual_rag_hit=actual.rag_hit,
            actual_escalated=actual.escalated,
            response_ms=actual.response_ms,
        )
        db.add(result)
        await db.commit()
        if grade.passed:
            passed_cases += 1
        else:
            failed_cases += 1

    run.status = "completed"
    run.passed_cases = passed_cases
    run.failed_cases = failed_cases
    run.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(run)
    logger.info(
        "evaluation_run.completed",
        space_id=str(space.id),
        suite_id=str(suite.id),
        run_id=str(run.id),
        total_cases=run.total_cases,
        passed_cases=passed_cases,
        failed_cases=failed_cases,
    )
    return _run_out(run)


@router.post(
    "/suites/{suite_id}/cases/{case_id}/grade",
    response_model=EvaluationGradeResponse,
)
async def grade_case(
    suite_id: UUID,
    case_id: UUID,
    payload: EvaluationGradeRequest,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    case = await _get_case(db, space.id, suite_id, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Evaluation case not found.")

    grade = grade_evaluation(
        EvaluationExpectation.model_validate(case.expectations),
        payload.actual,
    )
    now = datetime.utcnow()
    run = EvaluationRun(
        suite_id=suite_id,
        space_id=space.id,
        target=payload.target,
        status="completed",
        total_cases=1,
        passed_cases=1 if grade.passed else 0,
        failed_cases=0 if grade.passed else 1,
        started_at=now,
        completed_at=now,
    )
    db.add(run)
    await db.flush()
    result = EvaluationResult(
        run_id=run.id,
        case_id=case.id,
        space_id=space.id,
        passed=grade.passed,
        checks=[check.model_dump() for check in grade.checks],
        failures=grade.failures,
        actual_response=payload.actual.response,
        actual_agent=payload.actual.agent,
        actual_source_ids=payload.actual.source_ids,
        actual_rag_hit=payload.actual.rag_hit,
        actual_escalated=payload.actual.escalated,
        response_ms=payload.actual.response_ms,
    )
    db.add(result)
    await db.commit()
    await db.refresh(run)
    await db.refresh(result)
    logger.info(
        "evaluation_case.graded",
        space_id=str(space.id),
        suite_id=str(suite_id),
        case_id=str(case_id),
        run_id=str(run.id),
        passed=grade.passed,
    )
    return EvaluationGradeResponse(run_id=run.id, result_id=result.id, grade=grade)


@router.get("/runs", response_model=list[EvaluationRunOut])
async def list_runs(
    suite_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    statement = select(EvaluationRun).where(EvaluationRun.space_id == space.id)
    if suite_id is not None:
        statement = statement.where(EvaluationRun.suite_id == suite_id)
    rows = (
        await db.execute(statement.order_by(EvaluationRun.started_at.desc()).limit(limit))
    ).scalars().all()
    return [_run_out(row) for row in rows]


@router.get("/runs/{run_id}/results", response_model=list[EvaluationResultOut])
async def list_run_results(
    run_id: UUID,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if await _get_run(db, space.id, run_id) is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found.")
    rows = (
        await db.execute(
            select(EvaluationResult)
            .where(
                EvaluationResult.run_id == run_id,
                EvaluationResult.space_id == space.id,
            )
            .order_by(EvaluationResult.created_at.asc())
        )
    ).scalars().all()
    return [_result_out(row) for row in rows]
