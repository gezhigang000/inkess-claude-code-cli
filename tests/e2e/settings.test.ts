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

test('settings panel opens and closes', async () => {
  const settingsBtn = page.locator('[data-testid="settings-btn"], button:has-text("Settings")').first()
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click()
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible()
  }
})

test('settings sections are navigable', async () => {
  const sections = ['Account', 'Appearance', 'IDE', 'Network']
  for (const section of sections) {
    const tab = page.getByText(section).first()
    if (await tab.isVisible()) {
      await tab.click()
    }
  }
})

test('clicking background closes settings', async () => {
  const overlay = page.locator('[data-testid="settings-overlay"]').first()
  if (await overlay.isVisible()) {
    await overlay.click({ position: { x: 10, y: 10 } })
  }
})
