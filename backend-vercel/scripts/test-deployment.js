#!/usr/bin/env node

/**
 * Test script for validating Vercel backend deployment
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.TEST_USERNAME || 'admin';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// HTTP client function
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = client.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test helper functions
function test(name, testFn) {
  return testFn()
    .then(() => {
      console.log(`✅ ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    })
    .catch((error) => {
      console.log(`❌ ${name}: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Global variables for test data
let authToken = null;
let projectId = null;
let taskId = null;

// Test suite
async function runTests() {
  console.log('🚀 Starting Claude CLI Backend Tests');
  console.log(`📍 Testing against: ${BASE_URL}`);
  console.log('');

  // Test 1: Health Check
  await test('Health Check', async () => {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'Health check should return data');
    assert(response.data.data.status === 'healthy', 'Status should be healthy');
    assert(response.data.data.version, 'Version should be present');
    assert(response.data.data.services, 'Services status should be present');
  });

  // Test 2: Authentication - Login
  await test('Authentication - Login', async () => {
    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: {
        username: USERNAME,
        password: PASSWORD
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'Login should return data');
    assert(response.data.data.access_token, 'Access token should be present');
    assert(response.data.data.user, 'User info should be present');
    
    authToken = response.data.data.access_token;
  });

  // Test 3: Authentication - Get User Info
  await test('Authentication - Get User Info', async () => {
    assert(authToken, 'Auth token required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'User info should return data');
    assert(response.data.data.username === USERNAME, 'Username should match');
  });

  // Test 4: Rate Limiting Check
  await test('Rate Limiting Headers', async () => {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    assert(response.headers['x-ratelimit-limit'], 'Rate limit headers should be present');
    assert(response.headers['x-ratelimit-remaining'], 'Rate limit remaining should be present');
  });

  // Test 5: Create Project
  await test('Create Project', async () => {
    assert(authToken, 'Auth token required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        name: `Test Project ${Date.now()}`,
        description: 'Test project created by validation script',
        github_repo: 'https://github.com/test/repo'
      }
    });
    assert(response.status === 201, `Expected 201, got ${response.status}`);
    assert(response.data.data, 'Project creation should return data');
    assert(response.data.data.id, 'Project ID should be present');
    assert(response.data.data.name, 'Project name should be present');
    
    projectId = response.data.data.id;
  });

  // Test 6: List Projects
  await test('List Projects', async () => {
    assert(authToken, 'Auth token required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/projects`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(Array.isArray(response.data.data), 'Projects should be an array');
    assert(response.data.meta, 'Pagination metadata should be present');
  });

  // Test 7: Create Task
  await test('Create Task', async () => {
    assert(authToken, 'Auth token required for this test');
    assert(projectId, 'Project ID required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        project_id: projectId,
        name: `Test Task ${Date.now()}`,
        command: 'echo "Hello from test task"',
        description: 'Test task created by validation script',
        priority: 'medium',
        tags: ['test', 'validation']
      }
    });
    assert(response.status === 201, `Expected 201, got ${response.status}`);
    assert(response.data.data, 'Task creation should return data');
    assert(response.data.data.id, 'Task ID should be present');
    assert(response.data.data.status, 'Task status should be present');
    
    taskId = response.data.data.id;
  });

  // Test 8: Get Task
  await test('Get Task', async () => {
    assert(authToken, 'Auth token required for this test');
    assert(taskId, 'Task ID required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'Task should return data');
    assert(response.data.data.id === taskId, 'Task ID should match');
  });

  // Test 9: Update Task
  await test('Update Task', async () => {
    assert(authToken, 'Auth token required for this test');
    assert(taskId, 'Task ID required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        description: 'Updated description from validation script',
        priority: 'high'
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'Task update should return data');
    assert(response.data.data.priority === 'high', 'Priority should be updated');
  });

  // Test 10: List Tasks
  await test('List Tasks', async () => {
    assert(authToken, 'Auth token required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks?project_id=${projectId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(Array.isArray(response.data.data), 'Tasks should be an array');
    assert(response.data.meta, 'Pagination metadata should be present');
  });

  // Test 11: Queue Status
  await test('Queue Status', async () => {
    assert(authToken, 'Auth token required for this test');
    assert(projectId, 'Project ID required for this test');
    
    const queueId = `project_${projectId}`;
    const response = await makeRequest(`${BASE_URL}/api/queues/${queueId}/status`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.data.data, 'Queue status should return data');
    assert(typeof response.data.data.pending_tasks === 'number', 'Pending tasks should be a number');
  });

  // Test 12: Input Validation
  await test('Input Validation - Invalid Task', async () => {
    assert(authToken, 'Auth token required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        // Missing required fields
        name: ''
      }
    });
    assert(response.status === 400, `Expected 400, got ${response.status}`);
    assert(response.data.error, 'Validation error should be present');
  });

  // Test 13: Authentication Required
  await test('Authentication Required', async () => {
    const response = await makeRequest(`${BASE_URL}/api/tasks`);
    assert(response.status === 401, `Expected 401, got ${response.status}`);
    assert(response.data.error, 'Authentication error should be present');
  });

  // Test 14: Command Sanitization
  await test('Command Sanitization', async () => {
    assert(authToken, 'Auth token required for this test');
    assert(projectId, 'Project ID required for this test');
    
    const response = await makeRequest(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        project_id: projectId,
        name: 'Dangerous Command Test',
        command: 'rm -rf /', // This should be blocked
        priority: 'low'
      }
    });
    assert(response.status === 400, `Expected 400, got ${response.status}`);
    assert(response.data.error, 'Command validation error should be present');
  });

  // Test 15: CORS Headers
  await test('CORS Headers', async () => {
    const response = await makeRequest(`${BASE_URL}/api/health`);
    assert(response.headers['access-control-allow-origin'], 'CORS headers should be present');
  });

  // Summary
  console.log('');
  console.log('📊 Test Results Summary:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.failed > 0) {
    console.log('');
    console.log('❌ Failed Tests:');
    results.tests
      .filter(test => test.status === 'FAILED')
      .forEach(test => console.log(`   - ${test.name}: ${test.error}`));
  }

  console.log('');
  if (results.failed === 0) {
    console.log('🎉 All tests passed! Your deployment is working correctly.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please check your configuration and try again.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});