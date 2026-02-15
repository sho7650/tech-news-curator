import { test, expect } from '@playwright/test'

test('should toggle between dark and light themes', async ({ page }) => {
  await page.goto('/')
  // Default theme is dark
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Use .first() because ThemeToggle renders in both desktop and mobile nav
  const toggle = page.locator('button[aria-label^="テーマ切り替え"]').first()
  // Click theme toggle to switch to system
  await toggle.click()

  // Click again to switch to light
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/light/)
})

test('should persist theme across page navigation', async ({ page }) => {
  await page.goto('/')
  const toggle = page.locator('button[aria-label^="テーマ切り替え"]').first()

  // Switch to light mode (dark → system → light)
  await toggle.click()
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/light/)

  // Navigate to articles page
  await page.click('a[href="/articles"]')
  await expect(page).toHaveURL(/\/articles/)

  // Theme should persist
  await expect(page.locator('html')).toHaveClass(/light/)
})

test('should display theme toggle in header', async ({ page }) => {
  await page.goto('/')
  const toggle = page.locator('button[aria-label^="テーマ切り替え"]').first()
  await expect(toggle).toBeVisible()
})
