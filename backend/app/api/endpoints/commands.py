"""Command execution endpoints."""

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from app.core.auth import User, require_command_execution
from app.core.logging_config import get_logger
from app.core.security import security_manager
from app.models.schemas import (
    CommandRequest,
    CommandResponse,
    CommandSuggestion,
    ErrorResponse,
)
from app.services.command_executor import CommandExecutor
from app.services.session_manager import SessionManager

logger = get_logger(__name__)

router = APIRouter()

# Global instances - in production, use dependency injection
command_executor = CommandExecutor()
session_manager = SessionManager()


class AgentTestRequest(BaseModel):
    """Request model for agent testing."""
    task_name: str
    task_description: Optional[str] = None
    task_status: str
    task_id: str
    context: str


@router.post("/execute", response_model=CommandResponse)
async def execute_command(
    request: CommandRequest, 
    current_user: User = Depends(require_command_execution)
) -> StreamingResponse:
    """
    Execute a Claude CLI command with real-time streaming output.
    
    Args:
        request: Command execution request
        current_user: Authenticated user
        
    Returns:
        Streaming response with real-time command output
    """
    try:
        # Validate and sanitize command
        sanitized_command = security_manager.sanitize_input(request.command)
        if not security_manager.validate_command(sanitized_command):
            logger.warning("Blocked dangerous command", 
                          command=request.command[:100],
                          user=current_user.username)
            raise HTTPException(
                status_code=400, 
                detail="Command contains dangerous patterns and cannot be executed"
            )
        
        # Ensure session exists (associate with user)
        session_id = request.session_id or f"{current_user.user_id}_default"
        await session_manager.create_session(session_id)
        
        logger.info("Executing command", 
                   command=sanitized_command[:100],
                   session_id=session_id,
                   user=current_user.username)
        
        async def generate_stream():
            """Generate streaming response."""
            async for response in command_executor.execute_command(
                command=sanitized_command,
                session_id=session_id,
                timeout=request.timeout
            ):
                # Add command to history
                await session_manager.add_command_to_history(session_id, response)
                
                # Yield JSON response
                yield f"data: {response.model_dump_json()}\n\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            }
        )
        
    except Exception as e:
        logger.error("Command execution failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel/{command_id}")
async def cancel_command(
    command_id: str, 
    current_user: User = Depends(require_command_execution)
) -> dict:
    """
    Cancel a running command.
    
    Args:
        command_id: ID of the command to cancel
        
    Returns:
        Success status
    """
    try:
        success = await command_executor.cancel_command(command_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Command not found")
        
        logger.info("Command cancelled", command_id=command_id)
        return {"success": True, "message": "Command cancelled"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to cancel command", 
                    command_id=command_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/running", response_model=List[str])
async def get_running_commands(current_user: User = Depends(require_command_execution)) -> List[str]:
    """
    Get list of currently running commands.
    
    Returns:
        List of running command IDs
    """
    try:
        return await command_executor.get_running_commands()
    except Exception as e:
        logger.error("Failed to get running commands", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions", response_model=List[CommandSuggestion])
async def get_command_suggestions(
    query: Optional[str] = Query(None, description="Search query for commands")
) -> List[CommandSuggestion]:
    """
    Get command suggestions for auto-completion.
    
    Args:
        query: Optional search query to filter suggestions
        
    Returns:
        List of command suggestions
    """
    try:
        # Basic Claude CLI commands for now
        # TODO: Implement dynamic command discovery
        suggestions = [
            CommandSuggestion(
                command="code",
                description="Start Claude code assistant",
                category="core"
            ),
            CommandSuggestion(
                command="chat",
                description="Start Claude chat session",
                category="core"
            ),
            CommandSuggestion(
                command="help",
                description="Show help information",
                category="help"
            ),
            CommandSuggestion(
                command="version",
                description="Show version information",
                category="info"
            ),
            CommandSuggestion(
                command="config",
                description="Manage configuration",
                category="config"
            ),
        ]
        
        # Filter by query if provided
        if query:
            query_lower = query.lower()
            suggestions = [
                s for s in suggestions 
                if query_lower in s.command.lower() or 
                   (s.description and query_lower in s.description.lower())
            ]
        
        return suggestions
        
    except Exception as e:
        logger.error("Failed to get command suggestions", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent-test")
async def agent_test(
    request: AgentTestRequest, 
    current_user: User = Depends(require_command_execution)
) -> Dict[str, Any]:
    """
    Execute agent testing on a task using the /agent-test command.
    
    Args:
        request: Agent test request with task context
        
    Returns:
        Test execution result
    """
    try:
        # Sanitize inputs
        task_name = security_manager.sanitize_input(request.task_name)
        context = security_manager.sanitize_input(request.context)
        task_id = security_manager.sanitize_input(request.task_id)
        
        # Validate task name and context lengths
        if len(task_name) > 200 or len(context) > 2000 or len(task_id) > 100:
            raise HTTPException(
                status_code=400,
                detail="Task name, context, or ID too long"
            )
        
        # Create the agent test command with sanitized inputs
        agent_test_command = f"/agent-test \"{task_name}\" \"{context}\""
        
        # Create session for the test if needed (associate with user)
        session_id = f"{current_user.user_id}_agent-test-{task_id}"
        await session_manager.create_session(session_id)
        
        logger.info("Executing agent test", 
                   task_name=request.task_name,
                   task_id=request.task_id,
                   session_id=session_id)
        
        # Execute the agent test command
        command_request = CommandRequest(
            command=agent_test_command,
            session_id=session_id,
            timeout=300  # 5 minute timeout for agent testing
        )
        
        # Start the command execution
        responses = []
        async for response in command_executor.execute_command(
            command=command_request.command,
            session_id=session_id,
            timeout=command_request.timeout
        ):
            # Add to history
            await session_manager.add_command_to_history(session_id, response)
            responses.append(response.model_dump())
        
        logger.info("Agent test completed", 
                   task_id=request.task_id,
                   response_count=len(responses))
        
        return {
            "success": True,
            "message": f"Agent test started for task: {request.task_name}",
            "session_id": session_id,
            "task_id": request.task_id,
            "responses": responses
        }
        
    except Exception as e:
        logger.error("Agent test execution failed", 
                    task_id=request.task_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"Agent test failed: {str(e)}")