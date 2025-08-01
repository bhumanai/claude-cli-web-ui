"""
Unit tests for health check API endpoints.
"""

import pytest
import time
from datetime import datetime
from unittest.mock import patch, MagicMock


@pytest.mark.unit
@pytest.mark.api
class TestHealthAPI:
    """Test cases for health check API endpoints."""

    @pytest.mark.asyncio
    async def test_health_check_success(self, test_client):
        """Test successful health check."""
        response = await test_client.get("/health/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == "1.0.0"
        assert "timestamp" in data
        assert "uptime" in data
        assert data["uptime"] >= 0

    @pytest.mark.asyncio
    async def test_health_check_response_format(self, test_client):
        """Test health check response format."""
        response = await test_client.get("/health/")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        required_fields = ["status", "version", "timestamp", "uptime"]
        for field in required_fields:
            assert field in data
        
        # Check field types
        assert isinstance(data["status"], str)
        assert isinstance(data["version"], str)
        assert isinstance(data["uptime"], (int, float))
        
        # Check timestamp format
        timestamp_str = data["timestamp"]
        try:
            datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except ValueError:
            pytest.fail("Invalid timestamp format")

    @pytest.mark.asyncio
    async def test_health_check_uptime_increases(self, test_client):
        """Test that uptime increases between calls."""
        # First call
        response1 = await test_client.get("/health/")
        uptime1 = response1.json()["uptime"]
        
        # Wait a small amount
        time.sleep(0.1)
        
        # Second call
        response2 = await test_client.get("/health/")
        uptime2 = response2.json()["uptime"]
        
        assert uptime2 > uptime1

    @pytest.mark.asyncio
    @patch('app.api.endpoints.health.psutil.Process')
    async def test_server_stats_success(self, mock_process, test_client):
        """Test successful server stats retrieval."""
        # Mock psutil Process
        mock_memory_info = MagicMock()
        mock_memory_info.rss = 100 * 1024 * 1024  # 100 MB in bytes
        
        mock_process_instance = MagicMock()
        mock_process_instance.memory_info.return_value = mock_memory_info
        mock_process_instance.cpu_percent.return_value = 25.5
        mock_process.return_value = mock_process_instance
        
        response = await test_client.get("/health/stats")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        required_fields = ["active_sessions", "total_commands", "uptime", "memory_usage", "cpu_usage"]
        for field in required_fields:
            assert field in data
        
        # Check calculated values
        assert data["memory_usage"] == 100.0  # 100 MB
        assert data["cpu_usage"] == 25.5
        assert data["uptime"] >= 0

    @pytest.mark.asyncio
    @patch('app.api.endpoints.health.psutil.Process')
    async def test_server_stats_response_format(self, mock_process, test_client):
        """Test server stats response format."""
        # Mock psutil Process
        mock_memory_info = MagicMock()
        mock_memory_info.rss = 50 * 1024 * 1024  # 50 MB in bytes
        
        mock_process_instance = MagicMock()
        mock_process_instance.memory_info.return_value = mock_memory_info
        mock_process_instance.cpu_percent.return_value = 10.2
        mock_process.return_value = mock_process_instance
        
        response = await test_client.get("/health/stats")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check field types
        assert isinstance(data["active_sessions"], int)
        assert isinstance(data["total_commands"], int)
        assert isinstance(data["uptime"], (int, float))
        assert isinstance(data["memory_usage"], (int, float))
        assert isinstance(data["cpu_usage"], (int, float))
        
        # Check non-negative values
        assert data["active_sessions"] >= 0
        assert data["total_commands"] >= 0
        assert data["uptime"] >= 0
        assert data["memory_usage"] >= 0
        assert data["cpu_usage"] >= 0

    @pytest.mark.asyncio
    @patch('app.api.endpoints.health.psutil.Process')
    async def test_server_stats_memory_calculation(self, mock_process, test_client):
        """Test memory usage calculation in MB."""
        # Mock different memory sizes
        test_cases = [
            (1024 * 1024, 1.0),        # 1 MB
            (10 * 1024 * 1024, 10.0),  # 10 MB
            (512 * 1024 * 1024, 512.0) # 512 MB
        ]
        
        for rss_bytes, expected_mb in test_cases:
            mock_memory_info = MagicMock()
            mock_memory_info.rss = rss_bytes
            
            mock_process_instance = MagicMock()
            mock_process_instance.memory_info.return_value = mock_memory_info
            mock_process_instance.cpu_percent.return_value = 0.0
            mock_process.return_value = mock_process_instance
            
            response = await test_client.get("/health/stats")
            data = response.json()
            
            assert abs(data["memory_usage"] - expected_mb) < 0.01

    @pytest.mark.asyncio
    @patch('app.api.endpoints.health.psutil.Process')
    async def test_server_stats_cpu_percentage(self, mock_process, test_client):
        """Test CPU usage percentage."""
        test_cpu_values = [0.0, 25.5, 50.0, 75.2, 100.0]
        
        for cpu_value in test_cpu_values:
            mock_memory_info = MagicMock()
            mock_memory_info.rss = 1024 * 1024  # 1 MB
            
            mock_process_instance = MagicMock()
            mock_process_instance.memory_info.return_value = mock_memory_info
            mock_process_instance.cpu_percent.return_value = cpu_value
            mock_process.return_value = mock_process_instance
            
            response = await test_client.get("/health/stats")
            data = response.json()
            
            assert data["cpu_usage"] == cpu_value

    @pytest.mark.asyncio
    @patch('app.api.endpoints.health.psutil.Process')
    async def test_server_stats_error_handling(self, mock_process, test_client):
        """Test server stats error handling."""
        # Mock psutil throwing an exception
        mock_process.side_effect = Exception("psutil error")
        
        response = await test_client.get("/health/stats")
        
        # Should handle the error gracefully (depending on implementation)
        # This test might need adjustment based on actual error handling
        assert response.status_code in [200, 500, 503]

    @pytest.mark.asyncio
    async def test_health_endpoints_concurrent_access(self, test_client):
        """Test concurrent access to health endpoints."""
        import asyncio
        
        async def make_health_request():
            return await test_client.get("/health/")
        
        async def make_stats_request():
            return await test_client.get("/health/stats")
        
        # Run multiple concurrent requests
        tasks = [
            make_health_request(),
            make_stats_request(),
            make_health_request(),
            make_stats_request(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # All requests should succeed
        for result in results:
            if hasattr(result, 'status_code'):
                assert result.status_code == 200
            else:
                pytest.fail(f"Request failed with exception: {result}")

    @pytest.mark.asyncio
    async def test_health_check_content_type(self, test_client):
        """Test health check response content type."""
        response = await test_client.get("/health/")
        
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_health_check_caching_headers(self, test_client):
        """Test health check caching headers."""
        response = await test_client.get("/health/")
        
        assert response.status_code == 200
        # Health checks should not be cached
        cache_control = response.headers.get("cache-control", "")
        if cache_control:
            assert "no-cache" in cache_control or "no-store" in cache_control

    @pytest.mark.asyncio
    async def test_server_stats_content_type(self, test_client):
        """Test server stats response content type."""
        response = await test_client.get("/health/stats")
        
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")


@pytest.mark.unit
@pytest.mark.api
class TestHealthAPIPerformance:
    """Performance tests for health check endpoints."""

    @pytest.mark.asyncio
    async def test_health_check_response_time(self, test_client, performance_timer):
        """Test health check response time."""
        response = await test_client.get("/health/")
        elapsed = performance_timer()
        
        assert response.status_code == 200
        # Health check should be very fast (under 100ms)
        assert elapsed < 0.1

    @pytest.mark.asyncio
    async def test_server_stats_response_time(self, test_client, performance_timer):
        """Test server stats response time."""
        response = await test_client.get("/health/stats")
        elapsed = performance_timer()
        
        assert response.status_code == 200
        # Stats gathering might be slower but should still be fast (under 500ms)
        assert elapsed < 0.5

    @pytest.mark.asyncio
    async def test_multiple_health_checks_performance(self, test_client):
        """Test performance of multiple health checks."""
        import time
        
        start_time = time.time()
        
        # Make 10 health check requests
        for _ in range(10):
            response = await test_client.get("/health/")
            assert response.status_code == 200
        
        total_time = time.time() - start_time
        
        # 10 health checks should complete in under 1 second
        assert total_time < 1.0
        
        # Average time per request should be under 100ms
        avg_time = total_time / 10
        assert avg_time < 0.1