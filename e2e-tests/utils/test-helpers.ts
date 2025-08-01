/**
 * E2E test helper utilities.
 */

import { Page, Locator, expect } from '@playwright/test'

export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for the application to load completely
   */
  async waitForAppLoad() {
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForSelector('[data-testid="app"]', { state: 'visible' })
  }

  /**
   * Navigate to a specific route
   */
  async navigateTo(path: string) {
    await this.page.goto(path)
    await this.waitForAppLoad()
  }

  /**
   * Fill a form field by label or placeholder
   */
  async fillField(selector: string, value: string) {
    const field = this.page.locator(selector)
    await field.click()
    await field.fill(value)
  }

  /**
   * Click a button by text or selector
   */
  async clickButton(selector: string) {
    const button = this.page.locator(selector)
    await button.click()
  }

  /**
   * Wait for a toast notification to appear
   */
  async waitForToast(message?: string) {
    const toast = this.page.locator('[data-testid="toast"]')
    await toast.waitFor({ state: 'visible' })
    
    if (message) {
      await expect(toast).toContainText(message)
    }
    
    return toast
  }

  /**
   * Wait for a loading spinner to disappear
   */
  async waitForLoading(timeout = 10000) {
    await this.page.waitForSelector('[data-testid="loading-spinner"]', { 
      state: 'hidden', 
      timeout 
    })
  }

  /**
   * Create a test project via API
   */
  async createTestProject(name: string, description?: string): Promise<any> {
    const response = await this.page.request.post('/api/v1/projects/', {
      data: {
        name,
        description: description || `Test project: ${name}`,
        config: { environment: 'test' },
        tags: ['test', 'e2e']
      }
    })
    
    expect(response.ok()).toBeTruthy()
    return await response.json()
  }

  /**
   * Create a test task queue via API
   */
  async createTestTaskQueue(projectId: string, name: string): Promise<any> {
    const response = await this.page.request.post('/api/v1/task-queues/', {
      data: {
        project_id: projectId,
        name,
        description: `Test queue: ${name}`,
        max_workers: 3,
        priority: 'medium'
      }
    })
    
    expect(response.ok()).toBeTruthy()
    return await response.json()
  }

  /**
   * Create a test task via API
   */
  async createTestTask(projectId: string, queueId: string, name: string, command: string): Promise<any> {
    const response = await this.page.request.post('/api/v1/tasks/', {
      data: {
        project_id: projectId,
        task_queue_id: queueId,
        name,
        command,
        description: `Test task: ${name}`,
        priority: 'medium'
      }
    })
    
    expect(response.ok()).toBeTruthy()
    return await response.json()
  }

  /**
   * Delete a project via API
   */
  async deleteProject(projectId: string) {
    const response = await this.page.request.delete(`/api/v1/projects/${projectId}`)
    expect(response.ok()).toBeTruthy()
  }

  /**
   * Wait for WebSocket connection
   */
  async waitForWebSocketConnection() {
    // Wait for WebSocket connection indicator
    await this.page.waitForSelector('[data-testid="ws-connected"]', { 
      state: 'visible',
      timeout: 30000 
    })
  }

  /**
   * Execute a command via the terminal interface
   */
  async executeCommand(command: string) {
    // Navigate to terminal if not already there
    await this.page.click('[data-testid="nav-terminal"]')
    
    // Wait for terminal to load
    await this.page.waitForSelector('[data-testid="terminal-input"]')
    
    // Type and execute command
    await this.page.fill('[data-testid="terminal-input"]', command)
    await this.page.press('[data-testid="terminal-input"]', 'Enter')
  }

  /**
   * Wait for command execution to complete
   */
  async waitForCommandComplete(timeout = 30000) {
    // Wait for the last command in history to have completed status
    await this.page.waitForSelector(
      '[data-testid="command-history"] [data-testid="command-item"]:last-child[data-status="completed"]',
      { timeout }
    )
  }

  /**
   * Get the latest command output
   */
  async getLatestCommandOutput(): Promise<string> {
    const lastCommand = this.page.locator('[data-testid="command-history"] [data-testid="command-item"]').last()
    const output = lastCommand.locator('[data-testid="command-output"]')
    return await output.textContent() || ''
  }

  /**
   * Take a screenshot with a descriptive name
   */
  async screenshot(name: string) {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true
    })
  }

  /**
   * Mock API responses for testing
   */
  async mockApiResponse(url: string, response: any, status = 200) {
    await this.page.route(url, route => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response)
      })
    })
  }

  /**
   * Wait for element to be visible with custom timeout
   */
  async waitForVisible(selector: string, timeout = 10000): Promise<Locator> {
    const element = this.page.locator(selector)
    await element.waitFor({ state: 'visible', timeout })
    return element
  }

  /**
   * Verify table contains specific data
   */
  async verifyTableContains(tableSelector: string, data: Record<string, string>) {
    const table = this.page.locator(tableSelector)
    await table.waitFor({ state: 'visible' })
    
    for (const [key, value] of Object.entries(data)) {
      const cell = table.locator(`[data-testid="${key}"]`).filter({ hasText: value })
      await expect(cell).toBeVisible()
    }
  }

  /**
   * Verify form validation errors
   */
  async verifyValidationError(fieldSelector: string, expectedError: string) {
    const errorElement = this.page.locator(`${fieldSelector} + [data-testid="field-error"]`)
    await expect(errorElement).toBeVisible()
    await expect(errorElement).toContainText(expectedError)
  }

  /**
   * Wait for and verify page title
   */
  async verifyPageTitle(expectedTitle: string) {
    await expect(this.page).toHaveTitle(expectedTitle)
  }

  /**
   * Verify URL matches expected pattern
   */
  async verifyUrl(expectedUrl: string | RegExp) {
    if (typeof expectedUrl === 'string') {
      await expect(this.page).toHaveURL(expectedUrl)
    } else {
      await expect(this.page).toHaveURL(expectedUrl)
    }
  }

  /**
   * Wait for network requests to complete
   */
  async waitForNetworkIdle() {
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Drag and drop helper
   */
  async dragAndDrop(sourceSelector: string, targetSelector: string) {
    const source = this.page.locator(sourceSelector)
    const target = this.page.locator(targetSelector)
    
    await source.dragTo(target)
  }

  /**
   * Upload file helper
   */
  async uploadFile(inputSelector: string, filePath: string) {
    const fileInput = this.page.locator(inputSelector)
    await fileInput.setInputFiles(filePath)
  }

  /**
   * Verify accessibility
   */
  async verifyAccessibility() {
    // Check for basic accessibility attributes
    const interactiveElements = this.page.locator('button, a, input, select, textarea')
    const count = await interactiveElements.count()
    
    for (let i = 0; i < count; i++) {
      const element = interactiveElements.nth(i)
      
      // Check that buttons have accessible names
      if (await element.getAttribute('role') === 'button' || element.tagName === 'BUTTON') {
        const hasAccessibleName = 
          await element.getAttribute('aria-label') ||
          await element.getAttribute('aria-labelledby') ||
          await element.textContent()
        
        expect(hasAccessibleName).toBeTruthy()
      }
    }
  }
}

/**
 * Custom expect matchers for E2E tests
 */
export const customExpect = {
  async toBeLoading(locator: Locator) {
    await expect(locator.locator('[data-testid="loading-spinner"]')).toBeVisible()
  },

  async toHaveSuccessState(locator: Locator) {
    await expect(locator).toHaveAttribute('data-state', 'success')
  },

  async toHaveErrorState(locator: Locator) {
    await expect(locator).toHaveAttribute('data-state', 'error')
  }
}