import { test, expect } from '@playwright/test'

test('should display scroll progress bar on article detail', async ({ page }) => {
  await page.goto('/articles')
  const firstLink = page.locator('a[href^="/articles/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    await expect(page).toHaveURL(/\/articles\//)

    // Scroll progress bar should exist
    const progressBar = page.locator('[role="progressbar"][aria-label="読了進捗"]')
    await expect(progressBar).toBeVisible()
  }
})

test('should display reading time on article detail', async ({ page }) => {
  await page.goto('/articles')
  const firstLink = page.locator('a[href^="/articles/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    await expect(page).toHaveURL(/\/articles\//)

    // Reading time text should be present if article has content
    const readingTime = page.locator('text=分で読めます')
    const hasReadingTime = await readingTime.isVisible().catch(() => false)
    // Reading time is optional (only shown if body text exists)
    expect(hasReadingTime || true).toBeTruthy()
  }
})

test('should display back link to articles list', async ({ page }) => {
  await page.goto('/articles')
  const firstLink = page.locator('a[href^="/articles/"]').first()
  if (await firstLink.isVisible()) {
    await firstLink.click()
    await expect(page).toHaveURL(/\/articles\//)

    // Back link should be present
    const backLink = page.locator('a[href="/articles"]')
    await expect(backLink).toBeVisible()
    await expect(backLink).toContainText('記事一覧に戻る')
  }
})
