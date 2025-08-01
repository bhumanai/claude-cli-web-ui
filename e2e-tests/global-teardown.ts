/**
 * Global teardown for Playwright tests.
 */

import { chromium, FullConfig } from '@playwright/test'

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown...')
  
  // Launch browser for cleanup
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  
  try {
    // Clean up test data
    console.log('🗑️  Cleaning up test data...')
    await cleanupTestData(page)
    
    console.log('✅ Global teardown completed successfully')
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error)
    // Don't fail if cleanup fails
  } finally {
    await context.close()
    await browser.close()
  }
}

async function cleanupTestData(page: any) {
  try {
    // Get all projects
    const projectsResponse = await page.request.get('http://localhost:8000/api/v1/projects/')
    const projects = await projectsResponse.json()
    
    // Delete test projects
    for (const project of projects.projects) {
      if (project.name.includes('E2E Test') || project.name.includes('Test Project')) {
        try {
          await page.request.delete(`http://localhost:8000/api/v1/projects/${project.id}`)
          console.log(`🗑️  Deleted test project: ${project.name}`)
        } catch (error) {
          console.warn(`⚠️  Failed to delete project ${project.name}:`, error)
        }
      }
    }
    
    console.log('✅ Test data cleanup completed')
  } catch (error) {
    console.error('⚠️  Failed to cleanup test data:', error)
  }
}

export default globalTeardown