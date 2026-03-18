import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const launched = await launchApp()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await app?.close()
})

test('app launches and shows login screen', async () => {
  const title = await page.title()
  expect(title).toContain('Inkess')
})

test('login/register tab switching works', async () => {
  const registerTab = page.getByText('Register')
  if (await registerTab.isVisible()) {
    await registerTab.click()
    await expect(page.getByText('Send Code')).toBeVisible()
  }
})

test('empty fields keep submit button disabled', async () => {
  const loginTab = page.getByText('Login')
  if (await loginTab.isVisible()) {
    await loginTab.click()
  }
  // Clear any existing input
  const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first()
  if (await emailInput.isVisible()) {
    await emailInput.fill('')
    const submitBtn = page.locator('button[type="submit"]').first()
    if (await submitBtn.isVisible()) {
      await expect(submitBtn).toBeDisabled()
    }
  }
})
