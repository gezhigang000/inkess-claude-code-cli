import { _electron as electron, ElectronApplication, Page } from '@playwright/test'

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
  })
  const page = await app.firstWindow()
  return { app, page }
}
