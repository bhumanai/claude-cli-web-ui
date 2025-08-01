const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.text().includes('Auto-plan check:')) {
      console.log('🔍', msg.text());
    }
  });

  try {
    console.log('1. Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('2. Clicking on Tasks tab...');
    await page.click('button:has-text("Tasks")');
    await page.waitForTimeout(2000);

    console.log('3. Selecting project if needed...');
    const selectProjectButton = await page.$('text=Select Project Path');
    if (selectProjectButton) {
      console.log('   Need to select project first');
      await selectProjectButton.click();
      await page.waitForTimeout(1000);
      
      // Click on Gesture Generator project
      const projectOption = await page.$('text=Gesture Generator Tasks');
      if (projectOption) {
        await projectOption.click();
        await page.waitForTimeout(1000);
      }
    }

    console.log('4. Waiting for task list to load...');
    await page.waitForTimeout(2000);
    
    console.log('5. Looking for Test Auto Plan Feature task...');
    const taskElement = await page.$('text=Test Auto Plan Feature');
    if (taskElement) {
      console.log('   Found task, clicking on it...');
      await taskElement.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('   Task not found, taking debug screenshot...');
      await page.screenshot({ path: 'task-not-found.png', fullPage: true });
    }

    console.log('6. Checking if task detail view loaded...');
    const taskDetailVisible = await page.isVisible('text=Task Details');
    console.log('   Task detail view visible:', taskDetailVisible);

    console.log('7. Checking for auto-plan UI elements...');
    await page.waitForTimeout(3000); // Wait for auto-plan to trigger
    
    // Check various planning states
    const planningInProgress = await page.$('text=/Planning.*Progress/i');
    const readyToPlan = await page.$('text=/Ready to Plan/i');
    const planComplete = await page.$('text=/Planning Complete/i');
    
    console.log('   Planning in progress:', !!planningInProgress);
    console.log('   Ready to plan:', !!readyToPlan);
    console.log('   Plan complete:', !!planComplete);

    console.log('8. Taking final screenshot...');
    await page.screenshot({ path: 'auto-plan-final.png', fullPage: true });
    console.log('   Screenshot saved as auto-plan-final.png');

    // Check console for auto-plan debug logs
    console.log('\n✅ Test completed. Check auto-plan-final.png for results.');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
  } finally {
    await page.waitForTimeout(5000); // Keep browser open to observe
    await browser.close();
  }
})();