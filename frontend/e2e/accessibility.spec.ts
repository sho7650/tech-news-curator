import { test, expect } from '@playwright/test'

test('should have proper heading hierarchy', async ({ page }) => {
  await page.goto('/articles')
  const h1 = page.locator('h1')
  await expect(h1).toBeVisible()
  await expect(h1).toHaveText('記事一覧')
})

test('should have proper aria labels', async ({ page }) => {
  await page.goto('/')
  // Main navigation should have aria-label
  const nav = page.locator('nav[aria-label="メインナビゲーション"]')
  await expect(nav).toBeVisible()
})
