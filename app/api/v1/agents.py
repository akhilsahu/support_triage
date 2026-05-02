"""Agent API endpoints"""

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.core.database import get_db
from app.models.agent import Agent
from app.schemas.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentExecuteRequest,
    AgentExecuteResponse
)
from app.services.llm_service import llm_service
import time

logger = structlog.get_logger()

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new agent.
    
    Supports multiple LLM models:
    - OpenAI: gpt-3.5-turbo, gpt-4, gpt-4-turbo-preview, gpt-4o
    - Anthropic: claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3.5-sonnet
    """
    try:
        agent = Agent(**agent_data.model_dump())
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        
        logger.info("Agent created", agent_id=str(agent.id), name=agent.name)
        return AgentResponse.model_validate(agent)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create agent: {str(e)}"
        )


@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all agents"""
    try:
        stmt = select(Agent).offset(skip).limit(limit)
        result = await db.execute(stmt)
        agents = result.scalars().all()
        
        return [AgentResponse.model_validate(agent) for agent in agents]
    
    except Exception as e:
        logger.error(f"Failed to list agents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list agents: {str(e)}"
        )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get agent by ID"""
    try:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent not found: {agent_id}"
            )
        
        return AgentResponse.model_validate(agent)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get agent: {str(e)}"
        )


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update agent"""
    try:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent not found: {agent_id}"
            )
        
        # Update fields
        update_data = agent_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(agent, field, value)
        
        await db.commit()
        await db.refresh(agent)
        
        logger.info("Agent updated", agent_id=str(agent_id))
        return AgentResponse.model_validate(agent)
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update agent: {str(e)}"
        )


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete agent"""
    try:
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent not found: {agent_id}"
            )
        
        await db.delete(agent)
        await db.commit()
        
        logger.info("Agent deleted", agent_id=str(agent_id))
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete agent: {str(e)}"
        )


@router.post("/{agent_id}/execute", response_model=AgentExecuteResponse)
async def execute_agent(
    agent_id: UUID,
    request: AgentExecuteRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute agent task with switchable LLM model.
    
    The agent can use any configured model:
    - Specify in request.model to override agent's default
    - Or use agent's configured model_name
    - Falls back to system default
    """
    start_time = time.time()
    
    try:
        # Get agent
        stmt = select(Agent).where(Agent.id == agent_id)
        result = await db.execute(stmt)
        agent = result.scalar_one_or_none()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent not found: {agent_id}"
            )
        
        if not agent.is_active():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Agent is not active: {agent.status}"
            )
        
        # Determine model to use (priority: request > agent > default)
        model = request.model or agent.model_name
        temperature = request.temperature if request.temperature is not None else float(agent.temperature)
        max_tokens = request.max_tokens or int(agent.max_tokens)
        
        # Build messages from input
        messages = []
        if isinstance(request.input_data.get("messages"), list):
            messages = request.input_data["messages"]
        elif "prompt" in request.input_data:
            messages = [{"role": "user", "content": request.input_data["prompt"]}]
        else:
            messages = [{"role": "user", "content": str(request.input_data)}]
        
        # Execute with LLM
        response = await llm_service.generate(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            system_prompt=agent.system_prompt
        )
        
        execution_time = time.time() - start_time
        
        logger.info(
            "Agent executed",
            agent_id=str(agent_id),
            model=response["model"],
            provider=response["provider"],
            execution_time=execution_time
        )
        
        return AgentExecuteResponse(
            agent_id=agent_id,
            output_data={"response": response["content"]},
            model=response["model"],
            provider=response["provider"],
            usage=response.get("usage"),
            execution_time=execution_time
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to execute agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute agent: {str(e)}"
        )


@router.get("/models/available")
async def get_available_models():
    """Get list of available LLM models"""
    return {
        "models": llm_service.get_available_models(),
        "default": {
            "openai": "gpt-4-turbo-preview",
            "anthropic": "claude-3-opus-20240229"
        }
    }

# Made with Bob
