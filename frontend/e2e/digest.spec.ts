import { test, expect } from '@playwright/test'

test('should list digests', async ({ page }) => {
  await page.goto('/digest')
  await expect(page.locator('h1')).toBeVisible()
})

test('should display digest detail', async ({ page }) => {
  await page.goto('/digest')
  const firstLink = page.locator('a[href^="/digest/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    await expect(page.locator('main')).toBeVisible()
  }
})
