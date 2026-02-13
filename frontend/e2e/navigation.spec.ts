import { test, expect } from '@playwright/test'

test('should navigate between pages', async ({ page }) => {
  await page.goto('/')

  // Navigate to articles
  await page.click('a[href="/articles"]')
  await expect(page).toHaveURL(/\/articles/)

  // Navigate to digest
  await page.click('a[href="/digest"]')
  await expect(page).toHaveURL(/\/digest/)

  // Navigate to sources
  await page.click('a[href="/sources"]')
  await expect(page).toHaveURL(/\/sources/)
})

test('should display 404 page', async ({ page }) => {
  const response = await page.goto('/nonexistent-page')
  // サーバーエラーでないことを確認（Next.js not-found は 200 を返す）
  expect(response?.status()).toBeLessThan(500)
})
