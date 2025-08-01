const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => console.log('Browser console:', msg.text()));

  try {
    console.log('1. Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    console.log('2. Clicking on Tasks tab...');
    await page.click('button:has-text("Tasks")');
    await page.waitForTimeout(1000);

    console.log('3. Waiting for task list to load...');
    await page.waitForSelector('text=Test Auto Plan Feature', { timeout: 5000 });
    
    console.log('4. Clicking on the Test Auto Plan Feature task...');
    await page.click('text=Test Auto Plan Feature');
    await page.waitForTimeout(1000);

    console.log('5. Checking if task detail view loaded...');
    const taskDetailVisible = await page.isVisible('text=Task Details');
    console.log('   Task detail view visible:', taskDetailVisible);

    console.log('6. Checking for WebSocket connection...');
    const connectionStatus = await page.textContent('.text-green-500');
    console.log('   Connection status:', connectionStatus);

    console.log('7. Waiting for auto-plan to trigger...');
    await page.waitForTimeout(2000); // Wait for auto-plan delay

    console.log('8. Checking for plan prompt or planning in progress...');
    const planningElements = await page.$$('text=/Planning.*Progress/i');
    const planPromptElements = await page.$$('text=/Ready to Plan/i');
    const planCompleteElements = await page.$$('text=/Planning Complete/i');
    
    console.log('   Planning in progress elements:', planningElements.length);
    console.log('   Plan prompt elements:', planPromptElements.length);
    console.log('   Plan complete elements:', planCompleteElements.length);

    console.log('9. Checking terminal for /plan command...');
    const terminalContent = await page.textContent('.terminal-content');
    const hasPlanCommand = terminalContent?.includes('/plan');
    console.log('   Terminal has /plan command:', hasPlanCommand);

    console.log('10. Taking screenshot...');
    await page.screenshot({ path: 'auto-plan-test.png', fullPage: true });
    console.log('    Screenshot saved as auto-plan-test.png');

    console.log('\nTest Summary:');
    console.log('- Task detail view loaded:', taskDetailVisible);
    console.log('- WebSocket connected:', connectionStatus?.includes('Connected'));
    console.log('- Planning UI visible:', planningElements.length > 0 || planPromptElements.length > 0 || planCompleteElements.length > 0);
    console.log('- /plan command executed:', hasPlanCommand);

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'auto-plan-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();