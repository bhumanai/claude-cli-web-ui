"""
API performance and load tests.
"""

import pytest
import asyncio
import time
from concurrent.futures import as_completed

import httpx


@pytest.mark.performance
@pytest.mark.asyncio
class TestAPIPerformance:
    """Performance tests for API endpoints."""

    async def test_health_endpoint_response_time(self, performance_client, performance_timer, benchmark_requirements):
        """Test health endpoint response time under normal conditions."""
        # Warm up
        await performance_client.get("/health/")
        
        # Measure response time
        performance_timer.start("health_check")
        response = await performance_client.get("/health/")
        response_time_ms = performance_timer.end("health_check") * 1000
        
        assert response.status_code == 200
        assert response_time_ms <= benchmark_requirements.requirements['max_response_time_ms']

    async def test_projects_list_performance(self, performance_client, performance_timer, created_project):
        """Test projects list endpoint performance."""
        # Create some test data
        projects = []
        for i in range(10):
            response = await performance_client.post("/api/v1/projects/", json={
                "name": f"Perf Test Project {i}",
                "description": f"Performance test project {i}"
            })
            assert response.status_code == 200
            projects.append(response.json())
        
        # Measure list performance
        performance_timer.start("list_projects")
        response = await performance_client.get("/api/v1/projects/")
        response_time_ms = performance_timer.end("list_projects") * 1000
        
        assert response.status_code == 200
        assert response_time_ms <= 1000  # Should complete within 1 second
        
        data = response.json()
        assert len(data["projects"]) >= 10
        
        # Cleanup
        for project in projects:
            await performance_client.delete(f"/api/v1/projects/{project['id']}")

    async def test_concurrent_project_creation(self, performance_client, performance_metrics, concurrent_executor):
        """Test concurrent project creation performance."""
        concurrent_requests = 10
        
        async def create_project(index: int):
            start_time = time.perf_counter()
            response = await performance_client.post("/api/v1/projects/", json={
                "name": f"Concurrent Project {index}",
                "description": f"Concurrent test project {index}"
            })
            end_time = time.perf_counter()
            
            response_time_ms = (end_time - start_time) * 1000
            performance_metrics.add_response_time(response_time_ms)
            
            return response.status_code == 200, response.json() if response.status_code == 200 else None
        
        # Execute concurrent requests
        start_time = time.perf_counter()
        tasks = [create_project(i) for i in range(concurrent_requests)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = time.perf_counter()
        
        # Calculate throughput
        total_time = end_time - start_time
        throughput = concurrent_requests / total_time
        performance_metrics.add_throughput(throughput)
        
        # Verify results
        successful_requests = sum(1 for success, _ in results if success)
        assert successful_requests >= concurrent_requests * 0.9  # 90% success rate minimum
        
        # Verify performance metrics
        avg_response_time = performance_metrics.get_avg_response_time()
        assert avg_response_time <= 2000  # 2 second average for concurrent requests
        
        print(f"Concurrent creation: {throughput:.2f} RPS, Avg: {avg_response_time:.2f}ms")
        
        # Cleanup
        for success, project_data in results:
            if success and project_data:
                await performance_client.delete(f"/api/v1/projects/{project_data['id']}")

    async def test_tasks_crud_performance(self, performance_client, created_project, created_task_queue, performance_timer):
        """Test CRUD operations performance for tasks."""
        project_id = created_project["id"]
        queue_id = created_task_queue["id"]
        
        # Test task creation performance
        performance_timer.start("create_task")
        response = await performance_client.post("/api/v1/tasks/", json={
            "project_id": project_id,
            "task_queue_id": queue_id,
            "name": "Performance Test Task",
            "command": "echo 'performance test'",
            "description": "Task for performance testing",
            "priority": "medium"
        })
        create_time_ms = performance_timer.end("create_task") * 1000
        
        assert response.status_code == 200
        assert create_time_ms <= 1000
        task = response.json()
        task_id = task["id"]
        
        # Test task retrieval performance
        performance_timer.start("get_task")
        response = await performance_client.get(f"/api/v1/tasks/{task_id}")
        get_time_ms = performance_timer.end("get_task") * 1000
        
        assert response.status_code == 200
        assert get_time_ms <= 500
        
        # Test task update performance
        performance_timer.start("update_task")
        response = await performance_client.put(f"/api/v1/tasks/{task_id}", json={
            "name": "Updated Performance Test Task",
            "priority": "high"
        })
        update_time_ms = performance_timer.end("update_task") * 1000
        
        assert response.status_code == 200
        assert update_time_ms <= 1000
        
        # Test task deletion performance
        performance_timer.start("delete_task")
        response = await performance_client.delete(f"/api/v1/tasks/{task_id}")
        delete_time_ms = performance_timer.end("delete_task") * 1000
        
        assert response.status_code == 200
        assert delete_time_ms <= 500
        
        print(f"Task CRUD - Create: {create_time_ms:.2f}ms, Get: {get_time_ms:.2f}ms, "
              f"Update: {update_time_ms:.2f}ms, Delete: {delete_time_ms:.2f}ms")

    async def test_pagination_performance(self, performance_client, created_project, created_task_queue, performance_timer):
        """Test pagination performance with large datasets."""
        project_id = created_project["id"]
        queue_id = created_task_queue["id"]
        
        # Create 100 tasks for pagination testing
        print("Creating test tasks for pagination...")
        tasks = []
        for i in range(100):
            response = await performance_client.post("/api/v1/tasks/", json={
                "project_id": project_id,
                "task_queue_id": queue_id,
                "name": f"Pagination Test Task {i}",
                "command": f"echo 'task {i}'",
                "priority": "medium"
            })
            assert response.status_code == 200
            tasks.append(response.json())
        
        # Test first page performance
        performance_timer.start("first_page")
        response = await performance_client.get("/api/v1/tasks/?limit=20&offset=0")
        first_page_time_ms = performance_timer.end("first_page") * 1000
        
        assert response.status_code == 200
        assert first_page_time_ms <= 1000
        data = response.json()
        assert len(data["tasks"]) == 20
        
        # Test middle page performance
        performance_timer.start("middle_page")
        response = await performance_client.get("/api/v1/tasks/?limit=20&offset=40")
        middle_page_time_ms = performance_timer.end("middle_page") * 1000
        
        assert response.status_code == 200
        assert middle_page_time_ms <= 1000
        
        # Test last page performance
        performance_timer.start("last_page")
        response = await performance_client.get("/api/v1/tasks/?limit=20&offset=80")
        last_page_time_ms = performance_timer.end("last_page") * 1000
        
        assert response.status_code == 200
        assert last_page_time_ms <= 1000
        
        print(f"Pagination - First: {first_page_time_ms:.2f}ms, "
              f"Middle: {middle_page_time_ms:.2f}ms, Last: {last_page_time_ms:.2f}ms")
        
        # Cleanup
        for task in tasks:
            await performance_client.delete(f"/api/v1/tasks/{task['id']}")

    async def test_search_performance(self, performance_client, created_project, created_task_queue, performance_timer):
        """Test search functionality performance."""
        project_id = created_project["id"]
        queue_id = created_task_queue["id"]
        
        # Create tasks with searchable content
        search_terms = ["database", "processing", "analysis", "cleanup", "migration"]
        tasks = []
        
        for i, term in enumerate(search_terms * 10):  # 50 tasks total
            response = await performance_client.post("/api/v1/tasks/", json={
                "project_id": project_id,
                "task_queue_id": queue_id,
                "name": f"Task for {term} operation {i}",
                "command": f"run_{term}_script.py",
                "description": f"This task performs {term} operations for testing",
                "priority": "medium",
                "tags": [term, "search_test"]
            })
            assert response.status_code == 200
            tasks.append(response.json())
        
        # Test search performance
        performance_timer.start("search_tasks")
        response = await performance_client.get("/api/v1/tasks/?search=database")
        search_time_ms = performance_timer.end("search_tasks") * 1000
        
        assert response.status_code == 200
        assert search_time_ms <= 1000
        
        data = response.json()
        assert len(data["tasks"]) >= 10  # Should find all database tasks
        
        # Test complex search
        performance_timer.start("complex_search")
        response = await performance_client.get("/api/v1/tasks/?search=processing&priority=medium&tags=search_test")
        complex_search_time_ms = performance_timer.end("complex_search") * 1000
        
        assert response.status_code == 200
        assert complex_search_time_ms <= 1500
        
        print(f"Search - Simple: {search_time_ms:.2f}ms, Complex: {complex_search_time_ms:.2f}ms")
        
        # Cleanup
        for task in tasks:
            await performance_client.delete(f"/api/v1/tasks/{task['id']}")

    @pytest.mark.load_test
    async def test_load_testing_scenario(self, performance_client, performance_metrics, memory_profiler):
        """Comprehensive load testing scenario."""
        initial_memory = memory_profiler.get_current()
        
        # Phase 1: Project creation load
        print("Phase 1: Creating projects under load...")
        project_ids = []
        
        async def create_projects_batch():
            batch_tasks = []
            for i in range(20):
                batch_tasks.append(performance_client.post("/api/v1/projects/", json={
                    "name": f"Load Test Project {i}",
                    "description": f"Load test project {i}"
                }))
            
            responses = await asyncio.gather(*batch_tasks, return_exceptions=True)
            successful_projects = []
            
            for response in responses:
                if isinstance(response, httpx.Response) and response.status_code == 200:
                    successful_projects.append(response.json())
            
            return successful_projects
        
        projects = await create_projects_batch()
        project_ids = [p["id"] for p in projects]
        assert len(project_ids) >= 18  # At least 90% success rate
        
        # Phase 2: Concurrent read operations
        print("Phase 2: Concurrent read operations...")
        
        async def read_operations_batch():
            read_tasks = []
            for project_id in project_ids[:10]:  # Use first 10 projects
                read_tasks.extend([
                    performance_client.get(f"/api/v1/projects/{project_id}"),
                    performance_client.get("/api/v1/projects/"),
                    performance_client.get(f"/api/v1/projects/{project_id}/stats")
                ])
            
            start_time = time.perf_counter()
            responses = await asyncio.gather(*read_tasks, return_exceptions=True)
            end_time = time.perf_counter()
            
            successful_reads = sum(1 for r in responses 
                                 if isinstance(r, httpx.Response) and r.status_code == 200)
            
            total_time = end_time - start_time
            throughput = len(read_tasks) / total_time
            avg_response_time = (total_time / len(read_tasks)) * 1000
            
            performance_metrics.add_throughput(throughput)
            performance_metrics.add_response_time(avg_response_time)
            
            return successful_reads, throughput, avg_response_time
        
        successful_reads, throughput, avg_response_time = await read_operations_batch()
        
        # Assert performance requirements
        assert successful_reads >= len(project_ids) * 3 * 0.95  # 95% success rate
        assert throughput >= 5  # At least 5 RPS
        assert avg_response_time <= 2000  # Average under 2 seconds
        
        # Check memory usage
        current_memory = memory_profiler.get_current()
        memory_increase = current_memory - initial_memory
        assert memory_increase <= 200  # Less than 200MB increase
        
        print(f"Load test results - Throughput: {throughput:.2f} RPS, "
              f"Avg Response: {avg_response_time:.2f}ms, "
              f"Memory increase: {memory_increase:.2f}MB")
        
        # Cleanup
        for project_id in project_ids:
            try:
                await performance_client.delete(f"/api/v1/projects/{project_id}")
            except:
                pass  # Ignore cleanup errors

    @pytest.mark.stress_test
    async def test_stress_testing_limits(self, performance_client, performance_metrics):
        """Test system behavior under extreme stress conditions."""
        # This test pushes the system to its limits
        # Use with caution and monitor system resources
        
        concurrent_users = 50
        requests_per_user = 10
        
        async def user_simulation(user_id: int):
            """Simulate a user performing multiple operations."""
            user_metrics = []
            
            for request_num in range(requests_per_user):
                start_time = time.perf_counter()
                
                try:
                    # Mix of operations
                    if request_num % 3 == 0:
                        response = await performance_client.get("/health/")
                    elif request_num % 3 == 1:
                        response = await performance_client.get("/api/v1/projects/")
                    else:
                        response = await performance_client.post("/api/v1/projects/", json={
                            "name": f"Stress Test Project U{user_id}R{request_num}",
                            "description": f"Stress test project user {user_id} request {request_num}"
                        })
                        
                        # Clean up created projects immediately
                        if response.status_code == 200:
                            project_data = response.json()
                            await performance_client.delete(f"/api/v1/projects/{project_data['id']}")
                    
                    end_time = time.perf_counter()
                    response_time_ms = (end_time - start_time) * 1000
                    user_metrics.append((response.status_code == 200, response_time_ms))
                    
                except Exception as e:
                    end_time = time.perf_counter()
                    response_time_ms = (end_time - start_time) * 1000
                    user_metrics.append((False, response_time_ms))
                
                # Small delay between requests
                await asyncio.sleep(0.01)
            
            return user_metrics
        
        # Execute stress test
        print(f"Starting stress test with {concurrent_users} concurrent users...")
        start_time = time.perf_counter()
        
        user_tasks = [user_simulation(i) for i in range(concurrent_users)]
        all_user_metrics = await asyncio.gather(*user_tasks, return_exceptions=True)
        
        end_time = time.perf_counter()
        total_test_time = end_time - start_time
        
        # Analyze results
        total_requests = 0
        successful_requests = 0
        all_response_times = []
        
        for user_metrics in all_user_metrics:
            if isinstance(user_metrics, list):
                for success, response_time in user_metrics:
                    total_requests += 1
                    if success:
                        successful_requests += 1
                    all_response_times.append(response_time)
        
        # Calculate metrics
        success_rate = (successful_requests / total_requests) * 100
        overall_throughput = total_requests / total_test_time
        avg_response_time = sum(all_response_times) / len(all_response_times)
        
        # Update performance metrics
        performance_metrics.add_throughput(overall_throughput)
        for rt in all_response_times:
            performance_metrics.add_response_time(rt)
        
        # Assert minimum acceptable performance under stress
        assert success_rate >= 85  # 85% success rate minimum under stress
        assert overall_throughput >= 20  # At least 20 RPS under stress
        assert avg_response_time <= 5000  # Average under 5 seconds under stress
        
        print(f"Stress test results - Success rate: {success_rate:.1f}%, "
              f"Throughput: {overall_throughput:.2f} RPS, "
              f"Avg Response: {avg_response_time:.2f}ms")
        
        print(f"P95 Response time: {performance_metrics.get_percentile(95):.2f}ms")
        print(f"P99 Response time: {performance_metrics.get_percentile(99):.2f}ms")