# Testing Guide - Claude CLI Web UI

This document provides comprehensive information about the testing infrastructure for the Claude CLI Web UI system.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Backend Testing](#backend-testing)
- [Frontend Testing](#frontend-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Performance Testing](#performance-testing)
- [CI/CD Integration](#cicd-integration)
- [Running Tests](#running-tests)
- [Coverage Reports](#coverage-reports)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Claude CLI Web UI employs a comprehensive testing strategy that includes:

- **Unit Tests**: Testing individual components and functions in isolation
- **Integration Tests**: Testing interactions between different system components  
- **End-to-End Tests**: Testing complete user workflows across the entire application
- **Performance Tests**: Testing system performance under various load conditions
- **Security Tests**: Testing for vulnerabilities and security issues

### Test Coverage Goals

- **Backend**: 85% minimum coverage, 90% target
- **Frontend**: 80% minimum coverage, 85% target
- **Critical Paths**: 95% coverage requirement
- **Performance**: All critical endpoints under load

## Test Structure

```
├── backend/
│   ├── tests/
│   │   ├── unit/            # Unit tests
│   │   │   ├── api/         # API endpoint tests
│   │   │   ├── services/    # Service layer tests
│   │   │   └── models/      # Model tests
│   │   ├── integration/     # Integration tests
│   │   │   ├── database/    # Database integration
│   │   │   ├── redis/       # Redis integration
│   │   │   └── websocket/   # WebSocket integration
│   │   └── performance/     # Performance tests
│   ├── conftest.py          # Global test configuration
│   └── pytest.ini          # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── components/__tests__/    # Component tests
│   │   ├── hooks/__tests__/         # Hook tests
│   │   └── test/                    # Test utilities
│   ├── vitest.config.ts             # Vitest configuration
│   └── tsconfig.json               # TypeScript config
├── e2e-tests/
│   ├── tests/               # E2E test scenarios
│   ├── utils/               # Test utilities
│   ├── fixtures/            # Test data
│   ├── playwright.config.ts # Playwright configuration
│   ├── global-setup.ts      # Global test setup
│   └── global-teardown.ts   # Global test cleanup
└── .github/workflows/ci.yml # CI/CD configuration
```

## Backend Testing

### Technology Stack

- **Framework**: pytest with asyncio support
- **HTTP Client**: httpx for async HTTP testing
- **Database**: SQLite in-memory for unit tests, PostgreSQL for integration
- **Mocking**: unittest.mock and pytest fixtures
- **Coverage**: pytest-cov

### Test Categories

#### Unit Tests (`tests/unit/`)

**API Tests** (`tests/unit/api/`)
- Test all 36 API endpoints
- Request/response validation
- Error handling
- Authentication and authorization
- Input validation

**Service Tests** (`tests/unit/services/`)
- Business logic testing
- Database operations
- External service interactions
- Error handling and edge cases

**Model Tests** (`tests/unit/models/`)
- Data validation
- Serialization/deserialization
- Model relationships
- Database constraints

#### Integration Tests (`tests/integration/`)

**Database Integration**
- CRUD operations across models
- Transaction handling
- Complex queries
- Data consistency

**Redis Integration**
- Cache operations
- Session management
- Task queue operations
- Pub/sub messaging

**WebSocket Integration**
- Connection management
- Message broadcasting
- Real-time updates
- Error handling

#### Performance Tests (`tests/performance/`)

**Load Testing**
- Concurrent user simulation
- API throughput testing
- Database performance under load
- Memory usage monitoring

**Stress Testing**
- System limits testing
- Error handling under stress
- Recovery testing
- Resource exhaustion scenarios

### Running Backend Tests

```bash
# Unit tests
cd backend
pytest tests/unit/ -v --cov=app

# Integration tests
pytest tests/integration/ -v

# Performance tests
pytest tests/performance/ -v -m "performance"

# All tests with coverage
pytest --cov=app --cov-report=html --cov-report=term-missing

# Parallel execution
pytest -n auto

# Specific test file
pytest tests/unit/api/test_tasks_api.py -v
```

### Backend Test Configuration

Key pytest markers:
- `@pytest.mark.unit`: Unit tests
- `@pytest.mark.integration`: Integration tests
- `@pytest.mark.performance`: Performance tests
- `@pytest.mark.asyncio`: Async tests

## Frontend Testing

### Technology Stack

- **Framework**: Vitest with React Testing Library
- **Rendering**: @testing-library/react
- **User Interactions**: @testing-library/user-event
- **Mocking**: MSW (Mock Service Worker)
- **Coverage**: Vitest built-in coverage

### Test Categories

#### Component Tests (`src/components/__tests__/`)

**Unit Testing**
- Component rendering
- Props handling
- Event handling
- State management
- Conditional rendering

**Integration Testing**
- Component interactions
- Context providers
- API integration
- Form submissions

#### Hook Tests (`src/hooks/__tests__/`)

**Custom Hooks**
- State management hooks
- API interaction hooks
- WebSocket hooks
- Effect hooks
- Performance hooks

#### Service Tests

**API Service**
- HTTP request handling
- Response processing
- Error handling
- Retry logic

**WebSocket Service**
- Connection management
- Message handling
- Reconnection logic
- Event broadcasting

### Running Frontend Tests

```bash
# Unit tests
cd frontend
npm run test

# Tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# UI mode
npm run test:ui

# Specific test file
npm run test -- TaskCard.test.tsx
```

### Frontend Test Configuration

Key features:
- **JSX/TSX support**: Native TypeScript support
- **Mock setup**: MSW for API mocking
- **Test utilities**: Custom render functions with providers
- **Coverage thresholds**: 80% minimum coverage

## End-to-End Testing

### Technology Stack

- **Framework**: Playwright
- **Browsers**: Chromium, Firefox, WebKit
- **Parallel execution**: Multi-browser testing
- **Screenshots/Videos**: Failure capture

### Test Categories

#### User Workflows (`e2e-tests/tests/`)

**Project Management**
- Project creation, editing, deletion
- Project listing and filtering
- Project statistics and details

**Task Management**
- Task CRUD operations
- Task execution and monitoring
- Bulk operations

**System Integration**
- Authentication flows
- Real-time updates
- WebSocket connectivity
- Error handling

### Running E2E Tests

```bash
# All tests
cd e2e-tests
npx playwright test

# Specific browser
npx playwright test --project=chromium

# Headed mode (visible browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Specific test file
npx playwright test tests/project-management.spec.ts

# Generate test report
npx playwright show-report
```

### E2E Test Configuration

Key features:
- **Multi-browser support**: Chrome, Firefox, Safari
- **Mobile testing**: Responsive design testing  
- **Visual testing**: Screenshot comparisons
- **Test isolation**: Clean state between tests

## Performance Testing

### Performance Metrics

**Response Time Targets**
- API endpoints: < 500ms average
- Page loads: < 2s initial load
- WebSocket messages: < 100ms processing

**Throughput Targets**
- API requests: > 100 RPS
- Concurrent users: > 50 simultaneous
- Database queries: < 100ms average

**Resource Usage Limits**
- Memory increase: < 200MB under load
- CPU usage: < 80% sustained
- Database connections: < 50 concurrent

### Load Testing Scenarios

1. **Normal Load**: Typical user behavior simulation
2. **Peak Load**: High traffic simulation  
3. **Stress Test**: System limits testing
4. **Endurance Test**: Long-duration testing

### Running Performance Tests

```bash
# Backend performance tests
cd backend
pytest tests/performance/ -v --benchmark-json=results.json

# Load testing (use with caution)
pytest tests/performance/ -v -m "load_test"

# Stress testing (monitor system resources)
pytest tests/performance/ -v -m "stress_test"
```

## CI/CD Integration

### GitHub Actions Workflow

The CI pipeline includes:

1. **Backend Tests**
   - Unit and integration tests
   - Coverage reporting
   - Security scanning

2. **Frontend Tests**
   - Component and hook tests
   - Type checking and linting
   - Build verification

3. **E2E Tests**
   - Cross-browser testing
   - User workflow validation
   - Visual regression testing

4. **Performance Tests**
   - Load testing (on demand)
   - Performance regression detection

5. **Security Scanning**
   - Dependency vulnerability checking
   - Code security analysis
   - SAST/DAST scanning

6. **Code Quality**
   - Linting and formatting
   - SonarCloud analysis
   - Technical debt tracking

### Pipeline Triggers

- **Push to main/develop**: Full pipeline
- **Pull requests**: Tests + code quality
- **Performance label**: Includes performance tests
- **Manual trigger**: All tests available

## Running Tests

### Local Development

```bash
# Quick test run (unit tests only)
make test-unit

# Full test suite
make test-all

# Coverage report
make test-coverage

# Performance tests
make test-performance

# E2E tests
make test-e2e
```

### Docker Testing

```bash
# Run tests in Docker
docker-compose -f docker-compose.test.yml up --build

# Run specific test suite
docker-compose -f docker-compose.test.yml run backend-tests
docker-compose -f docker-compose.test.yml run frontend-tests
docker-compose -f docker-compose.test.yml run e2e-tests
```

### CI Environment

Tests run automatically on:
- Push to main/develop branches
- Pull request creation/updates
- Manual workflow dispatch

## Coverage Reports

### Backend Coverage

Generated using pytest-cov:
- **HTML Report**: `backend/htmlcov/index.html`
- **XML Report**: `backend/coverage.xml` (for CI)
- **Terminal**: Real-time coverage display

### Frontend Coverage

Generated using Vitest:
- **HTML Report**: `frontend/coverage/index.html`
- **LCOV Report**: `frontend/coverage/lcov.info`
- **JSON Report**: `frontend/coverage/coverage-final.json`

### Viewing Reports

```bash
# Backend coverage
cd backend && python -m http.server 8000
# Open http://localhost:8000/htmlcov/

# Frontend coverage  
cd frontend && npm run test:coverage
# Report automatically opens in browser
```

## Best Practices

### Test Organization

1. **Follow AAA Pattern**: Arrange, Act, Assert
2. **One assertion per test**: Clear failure messages
3. **Descriptive test names**: Self-documenting tests
4. **Test isolation**: No shared state between tests
5. **Mock external dependencies**: Reliable, fast tests

### Test Data Management

1. **Use factories**: Generate test data programmatically
2. **Clean up after tests**: Prevent test pollution
3. **Separate test databases**: Isolated test environments
4. **Realistic test data**: Representative of production

### Performance Testing

1. **Baseline measurements**: Know your starting performance
2. **Realistic load patterns**: Simulate actual usage
3. **Monitor resources**: CPU, memory, database connections
4. **Gradual load increase**: Identify breaking points
5. **Performance regression detection**: Catch slowdowns early

### Security Testing

1. **Input validation**: Test malicious inputs
2. **Authentication**: Test auth flows and bypasses
3. **Authorization**: Test access controls
4. **Data exposure**: Check for information leaks
5. **Dependency scanning**: Keep libraries updated

## Troubleshooting

### Common Issues

#### Backend Tests

**Database connection errors**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql

# Check connection string
echo $DATABASE_URL

# Reset test database
dropdb test_claude_cli && createdb test_claude_cli
```

**Redis connection errors**
```bash
# Check Redis service
redis-cli ping

# Check Redis URL
echo $REDIS_URL

# Restart Redis
sudo systemctl restart redis
```

**Import errors**
```bash
# Check Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Install in development mode
pip install -e .
```

#### Frontend Tests

**Module resolution errors**
```bash
# Clear node modules
rm -rf node_modules package-lock.json
npm install

# Check TypeScript configuration
npx tsc --noEmit
```

**Mock issues**
```bash
# Clear Vitest cache
npx vitest --run --reporter=verbose --clearCache

# Check mock setup
# Ensure mocks are in correct location
```

#### E2E Tests

**Browser installation**
```bash
# Install Playwright browsers
npx playwright install

# Install system dependencies
npx playwright install-deps
```

**Server startup issues**
```bash
# Check ports are available
lsof -i :5173
lsof -i :8000

# Start servers manually for debugging
cd backend && uvicorn main:app --port 8000 &
cd frontend && npm run dev &
```

### Debug Mode

#### Backend
```bash
# Debug specific test
pytest tests/unit/api/test_tasks.py::test_create_task -v -s --pdb

# Debug with logging
pytest -v -s --log-cli-level=DEBUG
```

#### Frontend
```bash
# Debug in browser
npm run test:ui

# Debug specific test
npm run test -- --reporter=verbose TaskCard.test.tsx
```

#### E2E
```bash
# Debug mode (opens browser)
npx playwright test --debug

# Step through test
npx playwright test --debug --headed
```

### Performance Debugging

```bash
# Profile backend tests
pytest tests/performance/ --profile

# Memory profiling
pytest tests/performance/ --memray

# Database query analysis
pytest tests/integration/ --pg-trace
```

## Continuous Improvement

### Metrics Tracking

- Test execution time trends
- Coverage progression
- Flaky test identification
- Performance regression tracking

### Regular Maintenance

- **Weekly**: Review flaky tests
- **Monthly**: Update dependencies
- **Quarterly**: Performance baseline review
- **Annually**: Testing strategy assessment

### Test Quality

- Code review for test changes
- Test documentation updates
- Performance test optimization
- Coverage gap analysis

## Support

For testing questions or issues:

1. Check this documentation first
2. Review CI/CD logs for specific errors
3. Consult team leads for complex issues
4. Update documentation when solutions are found

## Related Documentation

- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Contributing Guidelines](./CONTRIBUTING.md)
- [Architecture Overview](./ARCHITECTURE.md)