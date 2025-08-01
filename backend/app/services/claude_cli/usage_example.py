"""Usage example for Claude CLI session integration."""

import asyncio
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.services.claude_cli import (
    ClaudeSessionManager,
    SessionConfig,
    SessionOutput,
    SessionState,
)


# Example FastAPI integration
app = FastAPI()

# Global session manager
session_manager: Optional[ClaudeSessionManager] = None


@app.on_event("startup")
async def startup_event():
    """Initialize session manager on startup."""
    global session_manager
    session_manager = ClaudeSessionManager()
    await session_manager.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup session manager on shutdown."""
    if session_manager:
        await session_manager.stop()


@app.post("/api/v1/sessions/claude")
async def create_claude_session(
    task_id: Optional[str] = None,
    project_path: Optional[str] = None,
    auth_token: Optional[str] = None
):
    """Create a new Claude CLI session."""
    config = SessionConfig(
        task_id=task_id,
        project_path=project_path or ".",
        auth_token=auth_token,
        metadata={
            "api_version": "v1",
            "created_by": "api"
        }
    )
    
    try:
        session = await session_manager.create_claude_session(config)
        return JSONResponse(
            content={
                "session_id": session.session_id,
                "task_id": session.task_id,
                "state": session.state.value,
                "info": session.get_info()
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/api/v1/sessions/{session_id}/commands")
async def execute_command(session_id: str, command: str, timeout: Optional[int] = None):
    """Execute a command in a Claude CLI session."""
    try:
        response = await session_manager.send_command_to_session(
            session_id=session_id,
            command=command,
            timeout=timeout
        )
        
        return JSONResponse(
            content={
                "command_id": response.command_id,
                "session_id": response.session_id,
                "command": response.command,
                "status": response.status.value,
                "started_at": response.started_at.isoformat()
            }
        )
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={"error": str(e)}
        )
    except RuntimeError as e:
        return JSONResponse(
            status_code=400,
            content={"error": str(e)}
        )


@app.get("/api/v1/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get Claude CLI session information."""
    session = await session_manager.get_claude_session(session_id)
    if not session:
        return JSONResponse(
            status_code=404,
            content={"error": f"Session {session_id} not found"}
        )
    
    return JSONResponse(content=session.get_info())


@app.get("/api/v1/sessions/{session_id}/output")
async def get_session_output(
    session_id: str,
    limit: Optional[int] = 100
):
    """Get recent output from a Claude CLI session."""
    try:
        outputs = await session_manager.get_session_output(
            session_id=session_id,
            limit=limit
        )
        
        return JSONResponse(
            content={
                "session_id": session_id,
                "outputs": [output.to_dict() for output in outputs],
                "count": len(outputs)
            }
        )
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={"error": str(e)}
        )


@app.post("/api/v1/sessions/{session_id}/resize")
async def resize_terminal(session_id: str, cols: int, rows: int):
    """Resize a session's terminal."""
    try:
        await session_manager.resize_session_terminal(session_id, cols, rows)
        return JSONResponse(
            content={"message": "Terminal resized successfully"}
        )
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={"error": str(e)}
        )


@app.post("/api/v1/sessions/{session_id}/interrupt")
async def interrupt_session(session_id: str):
    """Send interrupt signal to a session."""
    try:
        await session_manager.interrupt_session(session_id)
        return JSONResponse(
            content={"message": "Interrupt signal sent"}
        )
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={"error": str(e)}
        )


@app.delete("/api/v1/sessions/{session_id}")
async def terminate_session(session_id: str, force: bool = False):
    """Terminate a Claude CLI session."""
    try:
        await session_manager.terminate_claude_session(session_id, force=force)
        return JSONResponse(
            content={"message": "Session terminated successfully"}
        )
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={"error": str(e)}
        )


@app.get("/api/v1/sessions")
async def list_sessions():
    """List all active Claude CLI sessions."""
    sessions = await session_manager.list_claude_sessions()
    return JSONResponse(
        content={
            "sessions": sessions,
            "count": len(sessions)
        }
    )


@app.get("/api/v1/stats/claude")
async def get_claude_stats():
    """Get Claude CLI session statistics."""
    stats = await session_manager.get_claude_session_stats()
    return JSONResponse(content=stats)


# WebSocket endpoint for real-time output streaming
@app.websocket("/ws/sessions/{session_id}")
async def websocket_session_output(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming session output."""
    await websocket.accept()
    
    # Check if session exists
    session = await session_manager.get_claude_session(session_id)
    if not session:
        await websocket.send_json({
            "type": "error",
            "message": f"Session {session_id} not found"
        })
        await websocket.close()
        return
    
    # Output handler for WebSocket
    async def output_handler(output: SessionOutput):
        await websocket.send_json({
            "type": "output",
            "session_id": session_id,
            "data": output.to_dict()
        })
    
    # Register output callback
    await session_manager.register_output_callback(
        session_id,
        lambda sid, output: asyncio.create_task(output_handler(output))
    )
    
    try:
        # Send initial session info
        await websocket.send_json({
            "type": "session_info",
            "data": session.get_info()
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                message = await websocket.receive_json()
                
                if message.get("type") == "command":
                    # Execute command
                    command = message.get("command")
                    if command:
                        try:
                            response = await session_manager.send_command_to_session(
                                session_id,
                                command
                            )
                            await websocket.send_json({
                                "type": "command_response",
                                "data": {
                                    "command_id": response.command_id,
                                    "status": response.status.value
                                }
                            })
                        except Exception as e:
                            await websocket.send_json({
                                "type": "error",
                                "message": str(e)
                            })
                
                elif message.get("type") == "resize":
                    # Resize terminal
                    cols = message.get("cols", 120)
                    rows = message.get("rows", 40)
                    await session_manager.resize_session_terminal(
                        session_id, cols, rows
                    )
                    await websocket.send_json({
                        "type": "resize_complete",
                        "cols": cols,
                        "rows": rows
                    })
                
                elif message.get("type") == "interrupt":
                    # Send interrupt
                    await session_manager.interrupt_session(session_id)
                    await websocket.send_json({
                        "type": "interrupt_sent"
                    })
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
                
    finally:
        # Unregister callback
        # Note: In real implementation, would need to store the actual callback reference
        pass


# Example usage in async context
async def example_usage():
    """Example of using Claude CLI sessions programmatically."""
    # Create session manager
    manager = ClaudeSessionManager()
    await manager.start()
    
    try:
        # Create a session for a specific task
        config = SessionConfig(
            task_id="feature-123",
            project_path="/path/to/project",
            environment={
                "CLAUDE_MODE": "development",
                "DEBUG": "true"
            },
            terminal_size=(120, 40),
            metadata={
                "feature": "user-authentication",
                "priority": "high"
            }
        )
        
        # Output callback for monitoring
        def handle_output(output: SessionOutput):
            print(f"[{output.type}] {output.content.rstrip()}")
        
        # Create session
        session = await manager.create_claude_session(
            config=config,
            output_callback=handle_output
        )
        
        print(f"Created session: {session.session_id}")
        
        # Wait for session to be ready
        while not session.is_ready:
            await asyncio.sleep(0.1)
        
        # Execute commands
        commands = [
            "cd src",
            "ls -la",
            "git status",
            "npm test",
            "npm run build"
        ]
        
        for cmd in commands:
            print(f"\nExecuting: {cmd}")
            response = await manager.send_command_to_session(
                session.session_id,
                cmd,
                timeout=60
            )
            
            # Wait for command completion (simplified)
            await asyncio.sleep(2)
        
        # Get session output
        outputs = await manager.get_session_output(
            session.session_id,
            limit=50
        )
        
        print(f"\nTotal outputs: {len(outputs)}")
        
        # Terminate session
        await manager.terminate_claude_session(session.session_id)
        
    finally:
        await manager.stop()


if __name__ == "__main__":
    # Run the example
    asyncio.run(example_usage())