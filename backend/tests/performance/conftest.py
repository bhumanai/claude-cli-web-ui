"""
Performance test configuration and fixtures.
"""

import pytest
import asyncio
import time
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from httpx import AsyncClient
from app.main import app


@pytest.fixture(scope="session")
def performance_client():
    """Create an HTTP client optimized for performance testing."""
    return AsyncClient(
        app=app, 
        base_url="http://test",
        timeout=30.0,
        limits=httpx.Limits(
            max_keepalive_connections=20,
            max_connections=100,
            keepalive_expiry=30
        )
    )


@pytest.fixture
def performance_timer():
    """Timer fixture for measuring execution time."""
    timers = {}
    
    def start_timer(name: str):
        timers[name] = time.perf_counter()
    
    def end_timer(name: str) -> float:
        if name not in timers:
            raise ValueError(f"Timer '{name}' was not started")
        
        elapsed = time.perf_counter() - timers[name]
        del timers[name]
        return elapsed
    
    def get_timer(name: str) -> float:
        if name not in timers:
            raise ValueError(f"Timer '{name}' was not started")
        return time.perf_counter() - timers[name]
    
    return type('Timer', (), {
        'start': start_timer,
        'end': end_timer,
        'get': get_timer
    })()


@pytest.fixture
def concurrent_executor():
    """Executor for running concurrent operations."""
    with ThreadPoolExecutor(max_workers=50) as executor:
        yield executor


@pytest.fixture
def performance_metrics():
    """Fixture for collecting performance metrics."""
    metrics = {
        'response_times': [],
        'throughput': [],
        'error_rates': [],
        'memory_usage': [],
        'cpu_usage': []
    }
    
    def add_response_time(time_ms: float):
        metrics['response_times'].append(time_ms)
    
    def add_throughput(requests_per_second: float):
        metrics['throughput'].append(requests_per_second)
    
    def add_error_rate(error_percentage: float):
        metrics['error_rates'].append(error_percentage)
    
    def get_avg_response_time() -> float:
        if not metrics['response_times']:
            return 0.0
        return sum(metrics['response_times']) / len(metrics['response_times'])
    
    def get_percentile(percentile: int) -> float:
        if not metrics['response_times']:
            return 0.0
        
        sorted_times = sorted(metrics['response_times'])
        index = int(len(sorted_times) * percentile / 100)
        return sorted_times[min(index, len(sorted_times) - 1)]
    
    def get_throughput() -> float:
        if not metrics['throughput']:
            return 0.0
        return max(metrics['throughput'])
    
    def reset():
        for key in metrics:
            metrics[key].clear()
    
    return type('Metrics', (), {
        'add_response_time': add_response_time,
        'add_throughput': add_throughput,
        'add_error_rate': add_error_rate,
        'get_avg_response_time': get_avg_response_time,
        'get_percentile': get_percentile,
        'get_throughput': get_throughput,
        'reset': reset,
        'data': metrics
    })()


@pytest.fixture
def load_test_data():
    """Generate test data for load testing."""
    def generate_projects(count: int) -> List[Dict[str, Any]]:
        return [
            {
                "name": f"Load Test Project {i}",
                "description": f"Project {i} for load testing",
                "config": {"env": "load_test", "batch": i // 10},
                "tags": ["load_test", f"batch_{i // 10}"]
            }
            for i in range(count)
        ]
    
    def generate_tasks(count: int, project_id: str, queue_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "project_id": project_id,
                "task_queue_id": queue_id,
                "name": f"Load Test Task {i}",
                "command": f"echo 'Task {i} executing'",
                "description": f"Task {i} for load testing",
                "priority": ["low", "medium", "high"][i % 3],
                "timeout": 300,
                "max_retries": 3,
                "input_data": {"task_number": i, "batch": i // 50},
                "tags": ["load_test", f"task_batch_{i // 50}"]
            }
            for i in range(count)
        ]
    
    def generate_task_queues(count: int, project_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "project_id": project_id,
                "name": f"Load Test Queue {i}",
                "description": f"Queue {i} for load testing",
                "max_workers": min(5, max(1, i % 6)),
                "priority": ["low", "medium", "high"][i % 3],
                "metadata": {"queue_number": i}
            }
            for i in range(count)
        ]
    
    return type('LoadTestData', (), {
        'generate_projects': generate_projects,
        'generate_tasks': generate_tasks,
        'generate_task_queues': generate_task_queues
    })()


@asynccontextmanager
async def performance_test_context():
    """Context manager for performance tests with setup and cleanup."""
    # Setup
    start_time = time.perf_counter()
    print(f"Starting performance test at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        yield
    finally:
        # Cleanup
        end_time = time.perf_counter()
        total_time = end_time - start_time
        print(f"Performance test completed in {total_time:.2f} seconds")


@pytest.fixture
def memory_profiler():
    """Memory usage profiler for performance tests."""
    import psutil
    import os
    
    process = psutil.Process(os.getpid())
    
    def get_current_memory_mb() -> float:
        return process.memory_info().rss / 1024 / 1024
    
    def get_memory_percent() -> float:
        return process.memory_percent()
    
    initial_memory = get_current_memory_mb()
    
    return type('MemoryProfiler', (), {
        'get_current': get_current_memory_mb,
        'get_percent': get_memory_percent,
        'initial': initial_memory,
        'get_increase': lambda: get_current_memory_mb() - initial_memory
    })()


@pytest.fixture
def benchmark_requirements():
    """Performance benchmark requirements and assertions."""
    requirements = {
        'max_response_time_ms': 1000,  # 1 second
        'max_avg_response_time_ms': 500,  # 500ms average
        'min_throughput_rps': 10,  # 10 requests per second minimum
        'max_error_rate_percent': 1.0,  # 1% error rate maximum
        'max_memory_increase_mb': 100,  # 100MB memory increase maximum
        'p95_response_time_ms': 800,  # 95th percentile under 800ms
        'p99_response_time_ms': 1200,  # 99th percentile under 1.2s
    }
    
    def assert_performance_requirements(metrics):
        """Assert that performance meets requirements."""
        avg_response_time = metrics.get_avg_response_time()
        p95_response_time = metrics.get_percentile(95)
        p99_response_time = metrics.get_percentile(99)
        
        assert avg_response_time <= requirements['max_avg_response_time_ms'], \
            f"Average response time {avg_response_time:.2f}ms exceeds limit {requirements['max_avg_response_time_ms']}ms"
        
        assert p95_response_time <= requirements['p95_response_time_ms'], \
            f"P95 response time {p95_response_time:.2f}ms exceeds limit {requirements['p95_response_time_ms']}ms"
        
        assert p99_response_time <= requirements['p99_response_time_ms'], \
            f"P99 response time {p99_response_time:.2f}ms exceeds limit {requirements['p99_response_time_ms']}ms"
    
    return type('BenchmarkRequirements', (), {
        'requirements': requirements,
        'assert_performance': assert_performance_requirements
    })()


# Pytest markers for performance tests
def pytest_configure(config):
    """Configure pytest markers for performance tests."""
    config.addinivalue_line(
        "markers", "performance: mark test as performance test"
    )
    config.addinivalue_line(
        "markers", "load_test: mark test as load test"
    )
    config.addinivalue_line(
        "markers", "stress_test: mark test as stress test"
    )
    config.addinivalue_line(
        "markers", "benchmark: mark test as benchmark"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running (skip in CI)"
    )