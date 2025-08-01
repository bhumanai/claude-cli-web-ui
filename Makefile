# Claude CLI Web UI - Test Makefile
# Simplifies running various test suites and operations

.PHONY: help test-all test-unit test-integration test-e2e test-performance test-coverage clean setup-dev

# Default target
help: ## Show this help message
	@echo "Claude CLI Web UI - Testing Commands"
	@echo "======================================"
	@echo
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Setup and Installation
setup-dev: ## Set up development environment
	@echo "Setting up development environment..."
	@echo "Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm ci
	@echo "Installing E2E test dependencies..."
	cd e2e-tests && npm ci && npx playwright install --with-deps
	@echo "Development environment setup complete!"

install-deps: ## Install all project dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm ci
	cd e2e-tests && npm ci

# Backend Tests
test-backend: ## Run all backend tests
	@echo "Running backend tests..."
	cd backend && pytest tests/ -v --tb=short

test-backend-unit: ## Run backend unit tests only
	@echo "Running backend unit tests..."
	cd backend && pytest tests/unit/ -v --tb=short

test-backend-integration: ## Run backend integration tests only
	@echo "Running backend integration tests..."
	cd backend && pytest tests/integration/ -v --tb=short

test-backend-coverage: ## Run backend tests with coverage
	@echo "Running backend tests with coverage..."
	cd backend && pytest tests/ -v --cov=app --cov-report=html --cov-report=term-missing

test-backend-parallel: ## Run backend tests in parallel
	@echo "Running backend tests in parallel..."
	cd backend && pytest tests/ -v -n auto --tb=short

# Frontend Tests
test-frontend: ## Run all frontend tests
	@echo "Running frontend tests..."
	cd frontend && npm run test

test-frontend-coverage: ## Run frontend tests with coverage
	@echo "Running frontend tests with coverage..."
	cd frontend && npm run test:coverage

test-frontend-watch: ## Run frontend tests in watch mode
	@echo "Running frontend tests in watch mode..."
	cd frontend && npm run test:watch

test-frontend-ui: ## Run frontend tests with UI
	@echo "Running frontend tests with UI..."
	cd frontend && npm run test:ui

# End-to-End Tests
test-e2e: ## Run E2E tests
	@echo "Running E2E tests..."
	cd e2e-tests && npx playwright test

test-e2e-headed: ## Run E2E tests in headed mode
	@echo "Running E2E tests in headed mode..."
	cd e2e-tests && npx playwright test --headed

test-e2e-debug: ## Run E2E tests in debug mode
	@echo "Running E2E tests in debug mode..."
	cd e2e-tests && npx playwright test --debug

test-e2e-chrome: ## Run E2E tests in Chrome only
	@echo "Running E2E tests in Chrome..."
	cd e2e-tests && npx playwright test --project=chromium

test-e2e-report: ## Show E2E test report
	cd e2e-tests && npx playwright show-report

# Performance Tests
test-performance: ## Run performance tests
	@echo "Running performance tests..."
	cd backend && pytest tests/performance/ -v -m "performance and not stress_test"

test-performance-load: ## Run load tests (use with caution)
	@echo "Running load tests (monitoring system resources)..."
	cd backend && pytest tests/performance/ -v -m "load_test"

test-performance-stress: ## Run stress tests (use with extreme caution)
	@echo "WARNING: Running stress tests - monitor system resources!"
	@read -p "Are you sure you want to continue? [y/N] " confirm && [ "$$confirm" = "y" ]
	cd backend && pytest tests/performance/ -v -m "stress_test"

test-performance-benchmark: ## Run performance benchmarks
	@echo "Running performance benchmarks..."
	cd backend && pytest tests/performance/ -v --benchmark-json=benchmark-results.json

# Comprehensive Test Suites
test-unit: ## Run all unit tests (backend + frontend)
	@echo "Running all unit tests..."
	@$(MAKE) test-backend-unit
	@$(MAKE) test-frontend

test-integration: ## Run all integration tests
	@echo "Running all integration tests..."
	@$(MAKE) test-backend-integration

test-all: ## Run all tests (unit, integration, e2e)
	@echo "Running complete test suite..."
	@$(MAKE) test-backend
	@$(MAKE) test-frontend
	@$(MAKE) test-e2e

test-coverage: ## Generate coverage reports for all components
	@echo "Generating coverage reports..."
	@$(MAKE) test-backend-coverage
	@$(MAKE) test-frontend-coverage
	@echo "Coverage reports generated:"
	@echo "  Backend: backend/htmlcov/index.html"
	@echo "  Frontend: frontend/coverage/index.html"

test-ci: ## Run tests as they would run in CI
	@echo "Running CI test suite..."
	cd backend && pytest tests/unit/ -v --cov=app --cov-report=xml --junit-xml=test-results/unit-tests.xml -n auto
	cd backend && pytest tests/integration/ -v --junit-xml=test-results/integration-tests.xml
	cd frontend && npm run test:coverage
	cd frontend && npm run type-check
	cd frontend && npm run lint

# Code Quality
lint: ## Run linting for all components
	@echo "Running linting..."
	cd backend && black --check app/ && isort --check-only app/ && flake8 app/
	cd frontend && npm run lint

lint-fix: ## Fix linting issues automatically
	@echo "Fixing linting issues..."
	cd backend && black app/ && isort app/
	cd frontend && npm run lint -- --fix

type-check: ## Run type checking
	@echo "Running type checking..."
	cd backend && mypy app/
	cd frontend && npm run type-check

format: ## Format code (backend and frontend)
	@echo "Formatting code..."
	cd backend && black app/ && isort app/
	cd frontend && npm run lint -- --fix

# Database and Services
start-services: ## Start required services (Redis, PostgreSQL)
	@echo "Starting services..."
	@command -v docker-compose >/dev/null 2>&1 || { echo "docker-compose required but not installed."; exit 1; }
	docker-compose -f docker-compose.dev.yml up -d redis postgres

stop-services: ## Stop services
	@echo "Stopping services..."
	docker-compose -f docker-compose.dev.yml down

reset-db: ## Reset test database
	@echo "Resetting test database..."
	cd backend && python -c "from app.database import reset_test_database; reset_test_database()"

# Development Server
serve-backend: ## Start backend development server
	@echo "Starting backend server..."
	cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

serve-frontend: ## Start frontend development server
	@echo "Starting frontend server..."
	cd frontend && npm run dev

serve-all: ## Start both backend and frontend servers
	@echo "Starting all servers..."
	@$(MAKE) serve-backend &
	@$(MAKE) serve-frontend &
	@echo "Servers starting in background..."

# Cleanup
clean: ## Clean up generated files and caches
	@echo "Cleaning up..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -path "*/tests/*" -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/htmlcov backend/coverage.xml backend/.coverage
	rm -rf frontend/coverage frontend/test-results
	rm -rf e2e-tests/test-results e2e-tests/playwright-report
	rm -rf backend/test-results
	@echo "Cleanup complete!"

clean-cache: ## Clear all caches
	@echo "Clearing caches..."
	cd backend && pip cache purge 2>/dev/null || true
	cd frontend && npm cache clean --force 2>/dev/null || true
	cd e2e-tests && npm cache clean --force 2>/dev/null || true
	@$(MAKE) clean

# Docker Testing
test-docker: ## Run tests in Docker containers
	@echo "Running tests in Docker..."
	docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

test-docker-build: ## Build Docker test images
	@echo "Building Docker test images..."
	docker-compose -f docker-compose.test.yml build

# Monitoring and Debugging
logs-backend: ## Show backend logs
	cd backend && tail -f logs/app.log 2>/dev/null || echo "No backend logs found"

logs-tests: ## Show test logs
	find . -name "*.log" -path "*/test*" -exec tail -f {} + 2>/dev/null || echo "No test logs found"

debug-backend: ## Start backend in debug mode
	cd backend && python -m debugpy --listen 5678 --wait-for-client -m uvicorn main:app --reload

debug-tests: ## Run backend tests with debugger
	cd backend && python -m pytest tests/ -v -s --pdb

# Quick Development Workflow
quick-test: ## Quick test run (fast unit tests only)
	@echo "Running quick tests..."
	cd backend && pytest tests/unit/api/ -v --tb=short -x
	cd frontend && npm run test -- --run --reporter=basic

dev-test: ## Development test run (unit + linting)
	@echo "Running development tests..."
	@$(MAKE) lint
	@$(MAKE) test-unit
	@echo "Development tests complete!"

pre-commit: ## Run pre-commit checks
	@echo "Running pre-commit checks..."
	@$(MAKE) lint
	@$(MAKE) type-check
	@$(MAKE) test-unit
	@echo "Pre-commit checks passed!"

# Performance Monitoring
monitor-performance: ## Monitor system performance during tests
	@echo "Monitoring system performance..."
	@echo "Starting performance monitoring in background..."
	@(while true; do echo "$(date): CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}') Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"; sleep 5; done) &
	@echo "Run tests in another terminal, then press Ctrl+C to stop monitoring"
	@trap 'kill %1 2>/dev/null || true' INT; read

# Documentation
docs-coverage: ## Generate test documentation and coverage summary
	@echo "Generating test documentation..."
	@echo "Test Coverage Summary" > TEST_SUMMARY.md
	@echo "=====================" >> TEST_SUMMARY.md
	@echo "" >> TEST_SUMMARY.md
	@echo "Generated on: $(shell date)" >> TEST_SUMMARY.md
	@echo "" >> TEST_SUMMARY.md
	cd backend && pytest tests/ --co -q | grep -c "test session starts" | xargs -I {} echo "Backend Tests: {} tests" >> ../TEST_SUMMARY.md
	cd frontend && npm run test -- --reporter=json | jq -r '.numTotalTests' | xargs -I {} echo "Frontend Tests: {} tests" >> TEST_SUMMARY.md 2>/dev/null || echo "Frontend Tests: Check manually" >> TEST_SUMMARY.md
	@echo "" >> TEST_SUMMARY.md
	@echo "For detailed coverage reports, run: make test-coverage" >> TEST_SUMMARY.md
	@echo "Test summary generated in TEST_SUMMARY.md"

# Utilities
check-deps: ## Check for outdated dependencies
	@echo "Checking backend dependencies..."
	cd backend && pip list --outdated
	@echo "Checking frontend dependencies..."
	cd frontend && npm outdated
	@echo "Checking E2E test dependencies..."
	cd e2e-tests && npm outdated

update-deps: ## Update dependencies (use with caution)
	@echo "Updating dependencies..."
	@read -p "This will update all dependencies. Continue? [y/N] " confirm && [ "$$confirm" = "y" ]
	cd backend && pip-review --local --auto
	cd frontend && npm update
	cd e2e-tests && npm update

validate-setup: ## Validate development setup
	@echo "Validating development setup..."
	@echo "Checking Python..."
	@python --version || echo "❌ Python not found"
	@echo "Checking Node.js..."
	@node --version || echo "❌ Node.js not found"
	@echo "Checking npm..."
	@npm --version || echo "❌ npm not found"
	@echo "Checking Docker..."
	@docker --version || echo "❌ Docker not found"
	@echo "Checking backend dependencies..."
	@cd backend && python -c "import fastapi, pytest, httpx" && echo "✅ Backend dependencies OK" || echo "❌ Backend dependencies missing"
	@echo "Checking frontend dependencies..."
	@cd frontend && npm ls > /dev/null && echo "✅ Frontend dependencies OK" || echo "❌ Frontend dependencies missing"
	@echo "Validation complete!"

# Default target explanation
.DEFAULT_GOAL := help