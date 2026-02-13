import { test, expect } from '@playwright/test'

test('should list sources', async ({ page }) => {
  await page.goto('/sources')
  await expect(page.locator('h1')).toHaveText('ソース一覧')
})
