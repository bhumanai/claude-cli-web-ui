/**
 * E2E tests for project management functionality.
 */

import { test, expect } from '@playwright/test'
import { TestHelpers } from '../utils/test-helpers'

test.describe('Project Management', () => {
  let helpers: TestHelpers

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page)
    await helpers.navigateTo('/')
    await helpers.waitForAppLoad()
  })

  test('should display projects list on homepage', async ({ page }) => {
    // Wait for projects to load
    await helpers.waitForLoading()
    
    // Should show projects section
    await expect(page.locator('[data-testid="projects-section"]')).toBeVisible()
    
    // Should show at least the seeded test project
    await expect(page.locator('[data-testid="project-card"]')).toHaveCount({ min: 1 })
    
    // Should show E2E Test Project
    await expect(page.locator('text=E2E Test Project')).toBeVisible()
  })

  test('should create a new project', async ({ page }) => {
    // Click create project button
    await helpers.clickButton('[data-testid="create-project-btn"]')
    
    // Fill project form
    await helpers.fillField('[data-testid="project-name-input"]', 'New E2E Project')
    await helpers.fillField('[data-testid="project-description-input"]', 'Created via E2E test')
    
    // Submit form
    await helpers.clickButton('[data-testid="create-project-submit"]')
    
    // Wait for creation to complete
    await helpers.waitForToast('Project created successfully')
    
    // Verify project appears in list
    await expect(page.locator('text=New E2E Project')).toBeVisible()
    await expect(page.locator('text=Created via E2E test')).toBeVisible()
  })

  test('should edit existing project', async ({ page }) => {
    // Find and click edit button for E2E Test Project
    const projectCard = page.locator('[data-testid="project-card"]').filter({ hasText: 'E2E Test Project' })
    await projectCard.locator('[data-testid="project-edit-btn"]').click()
    
    // Update project details
    await helpers.fillField('[data-testid="project-name-input"]', 'Updated E2E Project')
    await helpers.fillField('[data-testid="project-description-input"]', 'Updated description')
    
    // Save changes
    await helpers.clickButton('[data-testid="save-project-btn"]')
    
    // Wait for update to complete
    await helpers.waitForToast('Project updated successfully')
    
    // Verify changes
    await expect(page.locator('text=Updated E2E Project')).toBeVisible()
    await expect(page.locator('text=Updated description')).toBeVisible()
  })

  test('should view project details', async ({ page }) => {
    // Click on E2E Test Project
    await page.locator('[data-testid="project-card"]').filter({ hasText: 'E2E Test Project' }).click()
    
    // Should navigate to project detail page
    await helpers.verifyUrl(/\/projects\/[a-f0-9-]+/)
    
    // Should show project information
    await expect(page.locator('[data-testid="project-title"]')).toContainText('E2E Test Project')
    await expect(page.locator('[data-testid="project-description"]')).toBeVisible()
    
    // Should show project statistics
    await expect(page.locator('[data-testid="project-stats"]')).toBeVisible()
    await expect(page.locator('[data-testid="total-tasks"]')).toBeVisible()
    await expect(page.locator('[data-testid="active-tasks"]')).toBeVisible()
    
    // Should show tasks section
    await expect(page.locator('[data-testid="project-tasks"]')).toBeVisible()
  })

  test('should archive project', async ({ page }) => {
    // Create a project to archive (so we don't archive the main test project)
    const project = await helpers.createTestProject('Project to Archive')
    
    // Navigate back to projects list
    await helpers.navigateTo('/')
    await helpers.waitForLoading()
    
    // Find and click archive button
    const projectCard = page.locator('[data-testid="project-card"]').filter({ hasText: 'Project to Archive' })
    await projectCard.locator('[data-testid="project-more-btn"]').click()
    await page.locator('[data-testid="archive-project-btn"]').click()
    
    // Confirm archival
    await helpers.clickButton('[data-testid="confirm-archive-btn"]')
    
    // Wait for archival to complete
    await helpers.waitForToast('Project archived successfully')
    
    // Verify project is marked as archived
    const archivedProject = page.locator('[data-testid="project-card"]').filter({ hasText: 'Project to Archive' })
    await expect(archivedProject.locator('[data-testid="project-status"]')).toContainText('archived')
  })

  test('should filter projects by status', async ({ page }) => {
    // Ensure we have projects in different states
    await helpers.createTestProject('Active Project 1')
    
    const projectToArchive = await helpers.createTestProject('Project for Archive Filter')
    
    // Archive one project via API
    await page.request.post(`/api/v1/projects/${projectToArchive.id}/archive`)
    
    // Navigate to projects and wait for load
    await helpers.navigateTo('/')
    await helpers.waitForLoading()
    
    // Should show all projects by default
    await expect(page.locator('[data-testid="project-card"]')).toHaveCount({ min: 3 })
    
    // Filter to show only active projects
    await page.locator('[data-testid="status-filter"]').selectOption('active')
    await helpers.waitForLoading()
    
    // Should show only active projects
    await expect(page.locator('text=Active Project 1')).toBeVisible()
    await expect(page.locator('text=E2E Test Project')).toBeVisible()
    await expect(page.locator('text=Project for Archive Filter')).not.toBeVisible()
    
    // Filter to show only archived projects
    await page.locator('[data-testid="status-filter"]').selectOption('archived')
    await helpers.waitForLoading()
    
    // Should show only archived projects
    await expect(page.locator('text=Project for Archive Filter')).toBeVisible()
    await expect(page.locator('text=Active Project 1')).not.toBeVisible()
  })

  test('should search projects', async ({ page }) => {
    // Create some test projects
    await helpers.createTestProject('Search Test Project Alpha')
    await helpers.createTestProject('Search Test Project Beta')
    await helpers.createTestProject('Different Project')
    
    await helpers.navigateTo('/')
    await helpers.waitForLoading()
    
    // Search for "Search Test"
    await helpers.fillField('[data-testid="project-search-input"]', 'Search Test')
    await page.press('[data-testid="project-search-input"]', 'Enter')
    await helpers.waitForLoading()
    
    // Should show only matching projects
    await expect(page.locator('text=Search Test Project Alpha')).toBeVisible()
    await expect(page.locator('text=Search Test Project Beta')).toBeVisible()
    await expect(page.locator('text=Different Project')).not.toBeVisible()
    
    // Clear search
    await page.locator('[data-testid="clear-search-btn"]').click()
    await helpers.waitForLoading()
    
    // Should show all projects again
    await expect(page.locator('text=Different Project')).toBeVisible()
  })

  test('should handle project creation validation', async ({ page }) => {
    // Click create project button
    await helpers.clickButton('[data-testid="create-project-btn"]')
    
    // Try to submit without name
    await helpers.clickButton('[data-testid="create-project-submit"]')
    
    // Should show validation error
    await helpers.verifyValidationError('[data-testid="project-name-input"]', 'Project name is required')
    
    // Fill name with invalid characters
    await helpers.fillField('[data-testid="project-name-input"]', 'Project/With/Invalid/Characters')
    await helpers.clickButton('[data-testid="create-project-submit"]')
    
    // Should show validation error for invalid characters
    await helpers.verifyValidationError('[data-testid="project-name-input"]', 'Invalid characters in project name')
    
    // Fill valid name
    await helpers.fillField('[data-testid="project-name-input"]', 'Valid Project Name')
    await helpers.clickButton('[data-testid="create-project-submit"]')
    
    // Should create successfully
    await helpers.waitForToast('Project created successfully')
  })

  test('should display project statistics correctly', async ({ page }) => {
    // Navigate to project details
    await page.locator('[data-testid="project-card"]').filter({ hasText: 'E2E Test Project' }).click()
    await helpers.waitForLoading()
    
    // Verify statistics are displayed
    const statsSection = page.locator('[data-testid="project-stats"]')
    await expect(statsSection).toBeVisible()
    
    // Should show task counts
    await expect(statsSection.locator('[data-testid="total-tasks"]')).toContainText(/\d+/)
    await expect(statsSection.locator('[data-testid="pending-tasks"]')).toContainText(/\d+/)
    await expect(statsSection.locator('[data-testid="running-tasks"]')).toContainText(/\d+/)
    await expect(statsSection.locator('[data-testid="completed-tasks"]')).toContainText(/\d+/)
    
    // Should show queue information
    await expect(statsSection.locator('[data-testid="total-queues"]')).toContainText(/\d+/)
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure for project creation
    await helpers.mockApiResponse('/api/v1/projects/', { error: 'Network error' }, 500)
    
    // Try to create project
    await helpers.clickButton('[data-testid="create-project-btn"]')
    await helpers.fillField('[data-testid="project-name-input"]', 'Test Project')
    await helpers.clickButton('[data-testid="create-project-submit"]')
    
    // Should show error message
    await helpers.waitForToast('Failed to create project')
    
    // Form should remain open for retry
    await expect(page.locator('[data-testid="project-form"]')).toBeVisible()
  })

  test.afterEach(async ({ page }) => {
    // Clean up any projects created during tests
    try {
      // This would be handled by global teardown, but we can do immediate cleanup here
      const projectsResponse = await page.request.get('/api/v1/projects/')
      const projects = await projectsResponse.json()
      
      for (const project of projects.projects) {
        if (project.name.includes('E2E') && project.name !== 'E2E Test Project') {
          await page.request.delete(`/api/v1/projects/${project.id}`)
        }
      }
    } catch (error) {
      console.warn('Cleanup failed:', error)
    }
  })
})