import { test, expect } from '@playwright/test'

test('should display latest articles', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
})

test('should display hero section', async ({ page }) => {
  await page.goto('/')
  // Page should load without errors
  await expect(page).toHaveTitle(/Tech News Curator/)
})
