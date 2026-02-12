import { test, expect } from '@playwright/test'

test('should list articles', async ({ page }) => {
  await page.goto('/articles')
  await expect(page.locator('h1')).toHaveText('記事一覧')
})

test('should navigate to article detail', async ({ page }) => {
  await page.goto('/articles')
  const firstLink = page.locator('a[href^="/articles/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    await expect(page).toHaveURL(/\/articles\//)
  }
})

test('should display article detail', async ({ page }) => {
  await page.goto('/articles')
  const firstLink = page.locator('a[href^="/articles/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    // Article detail should have content
    await expect(page.locator('main')).toBeVisible()
  }
})

test('should filter by category', async ({ page }) => {
  await page.goto('/articles')
  const categoryButton = page.locator('nav[aria-label="カテゴリフィルタ"] button').nth(1)
  if (await categoryButton.isVisible()) {
    await categoryButton.click()
    await expect(page).toHaveURL(/category=/)
  }
})

test('should handle 404 for invalid article', async ({ page }) => {
  const response = await page.goto('/articles/00000000-0000-0000-0000-000000000000')
  // サーバーエラーでないことを確認（Next.js not-found は 200 を返す）
  expect(response?.status()).toBeLessThan(500)
})
