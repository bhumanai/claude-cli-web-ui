/**
 * Global setup for Playwright tests.
 */

import { chromium, FullConfig } from '@playwright/test'

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup...')
  
  // Launch browser for setup
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  
  try {
    // Wait for backend to be ready
    console.log('⏳ Waiting for backend to be ready...')
    let backendReady = false
    let attempts = 0
    const maxAttempts = 30
    
    while (!backendReady && attempts < maxAttempts) {
      try {
        const response = await page.request.get('http://localhost:8000/health/')
        if (response.ok()) {
          const data = await response.json()
          if (data.status === 'healthy') {
            backendReady = true
            console.log('✅ Backend is ready')
          }
        }
      } catch (error) {
        // Backend not ready yet
      }
      
      if (!backendReady) {
        attempts++
        await page.waitForTimeout(2000) // Wait 2 seconds
      }
    }
    
    if (!backendReady) {
      throw new Error('Backend did not become ready within timeout')
    }
    
    // Wait for frontend to be ready
    console.log('⏳ Waiting for frontend to be ready...')
    let frontendReady = false
    attempts = 0
    
    while (!frontendReady && attempts < maxAttempts) {
      try {
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
        
        // Check if the app has loaded
        const appElement = await page.locator('[data-testid="app"]').first()
        if (await appElement.isVisible()) {
          frontendReady = true
          console.log('✅ Frontend is ready')
        }
      } catch (error) {
        // Frontend not ready yet
      }
      
      if (!frontendReady) {
        attempts++
        await page.waitForTimeout(2000) // Wait 2 seconds
      }
    }
    
    if (!frontendReady) {
      console.log('⚠️  Frontend may not be fully ready, but continuing with tests')
    }
    
    // Seed test data
    console.log('🌱 Seeding test data...')
    await seedTestData(page)
    
    console.log('✅ Global setup completed successfully')
    
  } catch (error) {
    console.error('❌ Global setup failed:', error)
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

async function seedTestData(page: any) {
  try {
    // Create test project
    await page.request.post('http://localhost:8000/api/v1/projects/', {
      data: {
        name: 'E2E Test Project',
        description: 'Project created for E2E testing',
        config: { environment: 'test' },
        tags: ['e2e', 'test']
      }
    })
    
    // Create test task queue
    const projectsResponse = await page.request.get('http://localhost:8000/api/v1/projects/')
    const projects = await projectsResponse.json()
    const testProject = projects.projects.find((p: any) => p.name === 'E2E Test Project')
    
    if (testProject) {
      await page.request.post('http://localhost:8000/api/v1/task-queues/', {
        data: {
          project_id: testProject.id,
          name: 'E2E Test Queue',
          description: 'Queue created for E2E testing',
          max_workers: 3,
          priority: 'medium'
        }
      })
      
      // Create some test tasks
      const queuesResponse = await page.request.get(`http://localhost:8000/api/v1/projects/${testProject.id}/queues`)
      const queues = await queuesResponse.json()
      const testQueue = queues.find((q: any) => q.name === 'E2E Test Queue')
      
      if (testQueue) {
        const testTasks = [
          {
            name: 'Test Task 1',
            command: 'echo "Hello from test task 1"',
            description: 'First test task',
            priority: 'high'
          },
          {
            name: 'Test Task 2',
            command: 'echo "Hello from test task 2"',
            description: 'Second test task',
            priority: 'medium'
          },
          {
            name: 'Test Task 3',
            command: 'sleep 5 && echo "Long running task"',
            description: 'Long running test task',
            priority: 'low'
          }
        ]
        
        for (const task of testTasks) {
          await page.request.post('http://localhost:8000/api/v1/tasks/', {
            data: {
              ...task,
              project_id: testProject.id,
              task_queue_id: testQueue.id
            }
          })
        }
      }
    }
    
    console.log('✅ Test data seeded successfully')
  } catch (error) {
    console.error('⚠️  Failed to seed test data:', error)
    // Don't fail the setup if seeding fails
  }
}

export default globalSetup