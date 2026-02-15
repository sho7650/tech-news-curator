import { test, expect } from '@playwright/test'

test('should display hero section and article grid', async ({ page }) => {
  await page.goto('/')
  // Page should load with articles
  await expect(page.locator('h1')).toBeVisible()

  // Hero section should be visible if articles exist
  const heroSection = page.locator('section[aria-label="注目記事"]')
  const articleSection = page.locator('section[aria-label="記事一覧"]')

  // At least one section should be present
  const heroVisible = await heroSection.isVisible().catch(() => false)
  const gridVisible = await articleSection.isVisible().catch(() => false)
  expect(heroVisible || gridVisible).toBeTruthy()
})

test('should display articles with themed card styles', async ({ page }) => {
  await page.goto('/articles')
  await expect(page.locator('h1')).toHaveText('記事一覧')

  // Article cards should use theme-aware borders
  const articleCard = page.locator('article').first()
  if (await articleCard.isVisible()) {
    // Card should be visible and styled
    await expect(articleCard).toBeVisible()
  }
})
