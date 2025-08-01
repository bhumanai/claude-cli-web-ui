#!/usr/bin/env python3
"""
Simple test script to verify the backend server is working correctly.
"""

import asyncio
import sys
from pathlib import Path

# Add the current directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent))

import httpx
import websockets
import json


async def test_health_endpoint():
    """Test the health check endpoint."""
    print("Testing health endpoint...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:8000/api/health/")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Health check passed: {data['status']}")
                return True
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Health check error: {e}")
            return False


async def test_session_creation():
    """Test session creation endpoint."""
    print("Testing session creation...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post("http://localhost:8000/api/sessions/")
            if response.status_code == 200:
                data = response.json()
                session_id = data['session_id']
                print(f"✅ Session created: {session_id}")
                return session_id
            else:
                print(f"❌ Session creation failed: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Session creation error: {e}")
            return None


async def test_websocket_connection(session_id):
    """Test WebSocket connection."""
    print("Testing WebSocket connection...")
    
    try:
        uri = f"ws://localhost:8000/ws/{session_id}"
        async with websockets.connect(uri) as websocket:
            # Wait for welcome message
            welcome = await websocket.recv()
            welcome_data = json.loads(welcome)
            
            if welcome_data['type'] == 'welcome':
                print(f"✅ WebSocket connected: {welcome_data['data']['message']}")
                
                # Send ping
                ping_msg = {
                    "type": "ping",
                    "timestamp": 1234567890
                }
                await websocket.send(json.dumps(ping_msg))
                
                # Wait for pong
                pong = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                pong_data = json.loads(pong)
                
                if pong_data['type'] == 'pong':
                    print("✅ WebSocket ping/pong successful")
                    return True
                else:
                    print(f"❌ Unexpected response: {pong_data}")
                    return False
            else:
                print(f"❌ Unexpected welcome message: {welcome_data}")
                return False
                
    except Exception as e:
        print(f"❌ WebSocket connection error: {e}")
        return False


async def test_command_suggestions():
    """Test command suggestions endpoint."""
    print("Testing command suggestions...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:8000/api/commands/suggestions")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Got {len(data)} command suggestions")
                return True
            else:
                print(f"❌ Command suggestions failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Command suggestions error: {e}")
            return False


async def main():
    """Run all tests."""
    print("🚀 Starting Claude CLI Web UI Backend Tests\n")
    
    tests_passed = 0
    total_tests = 4
    
    # Test health endpoint
    if await test_health_endpoint():
        tests_passed += 1
    
    print()
    
    # Test session creation
    session_id = await test_session_creation()
    if session_id:
        tests_passed += 1
    
    print()
    
    # Test WebSocket connection (only if session was created)
    if session_id:
        if await test_websocket_connection(session_id):
            tests_passed += 1
    else:
        print("⏭️  Skipping WebSocket test (no session created)")
    
    print()
    
    # Test command suggestions
    if await test_command_suggestions():
        tests_passed += 1
    
    print(f"\n📊 Test Results: {tests_passed}/{total_tests} tests passed")
    
    if tests_passed == total_tests:
        print("🎉 All tests passed! Backend is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Please check the server logs.")
        return 1


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        sys.exit(1)