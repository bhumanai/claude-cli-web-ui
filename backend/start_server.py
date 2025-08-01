#!/usr/bin/env python3
"""
Startup script for Claude CLI Web UI backend server.

This script provides an easy way to start the server with different configurations.
"""

import argparse
import os
import sys
from pathlib import Path

# Add the current directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from app.config import get_settings


def main():
    """Main entry point for starting the server."""
    parser = argparse.ArgumentParser(description="Claude CLI Web UI Backend Server")
    
    parser.add_argument(
        "--host",
        default=None,
        help="Host to bind to (default: from config)"
    )
    
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to bind to (default: from config)"
    )
    
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode with auto-reload"
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=None,
        help="Log level (default: from config)"
    )
    
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development"
    )
    
    args = parser.parse_args()
    
    # Load settings
    settings = get_settings()
    
    # Override settings with command line arguments
    host = args.host or settings.HOST
    port = args.port or settings.PORT
    debug = args.debug or settings.DEBUG
    log_level = args.log_level or settings.LOG_LEVEL
    reload = args.reload or debug
    
    # Set environment variables if debug mode
    if debug:
        os.environ["DEBUG"] = "True"
    
    print(f"Starting Claude CLI Web UI Backend Server")
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Debug: {debug}")
    print(f"Log Level: {log_level}")
    print(f"Auto-reload: {reload}")
    print(f"Server URL: http://{host}:{port}")
    print(f"API Docs: http://{host}:{port}/api/docs")
    print()
    
    # Start the server
    uvicorn.run(
        "main:create_app",
        factory=True,
        host=host,
        port=port,
        reload=reload,
        log_level=log_level.lower(),
        access_log=debug,
    )


if __name__ == "__main__":
    main()