import log from './logger'
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, session, nativeImage, clipboard, Notification, powerSaveBlocker } from 'electron'
import { join, resolve, normalize } from 'path'
import { PtyManager } from './pty/pty-manager'
import { PtyOutputMonitor, type PtyActivityEvent } from './pty/pty-output-monitor'
import { CliManager } from './cli/cli-manager'
import { ToolsManager } from './tools/tools-manager'
import { AuthManager } from './auth/auth-manager'
import { checkForAppUpdate, downloadAppUpdate, installAppUpdate, onUpdateStatus } from './updater'
import { Analytics } from './analytics'

process.on('uncaughtException', (err) => log.error('Uncaught:', err))
process.on('unhandledRejection', (reason) => log.error('Unhandled:', reason))

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const ptyMonitor = new PtyOutputMonitor()
const cliManager = new CliManager()
const toolsManager = new ToolsManager()
const authManager = new AuthManager()
const analytics = new Analytics()
analytics.setTokenGetter(() => {
  try { return authManager.getToken() } catch { return null }
})

/** Safely send to renderer, swallowing errors if window is destroyed */
function safeSend(channel: string, ...args: unknown[]): void {
  try {
    mainWindow?.webContents.send(channel, ...args)
  } catch {
    // Window may be destroyed during long-running operations
  }
}

function createWindow(): void {
  // Set dock/taskbar icon (especially needed in dev mode)
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../../resources/icon-512.png')
    try {
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) app.dock?.setIcon(icon)
    } catch { /* icon file may not exist in some builds */ }
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#191919',
    icon: join(__dirname, '../../resources/icon-256.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox must be false: node-pty requires Node.js APIs in preload
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    log.info('Loading renderer URL:', process.env.ELECTRON_RENDERER_URL)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const filePath = join(__dirname, '../renderer/index.html')
    log.info('Loading renderer file:', filePath)
    mainWindow.loadFile(filePath)
  }

  // Debug: log renderer load failures
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`Renderer failed to load: ${errorCode} ${errorDescription} URL: ${validatedURL}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Renderer finished loading')
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) { // warning and error
      log.warn(`[Renderer Console] ${message}`)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Track window focus for notifications
  mainWindow.on('focus', () => { isWindowFocused = true })
  mainWindow.on('blur', () => { isWindowFocused = false })
}

// IPC: Auth Manager
ipcMain.handle('auth:getStatus', () => {
  return authManager.getStatus()
})

ipcMain.handle('auth:login', async (_event, { login, password }: { login: string; password: string }) => {
  const result = await authManager.login(login, password)
  analytics.track(result.success ? 'login_success' : 'login_fail')
  return result
})

ipcMain.handle('auth:logout', () => {
  authManager.logout()
})

ipcMain.handle('auth:register', async (_event, { email, password, code, username, referralCode }: {
  email: string; password: string; code: string; username?: string; referralCode?: string
}) => {
  return authManager.register(email, password, code, username, referralCode)
})

ipcMain.handle('auth:sendCode', async (_event, { email }: { email: string }) => {
  return authManager.sendCode(email)
})

ipcMain.handle('auth:forgotPassword', async (_event, { email }: { email: string }) => {
  return authManager.forgotPassword(email)
})

ipcMain.handle('auth:changePassword', async (_event, { currentPassword, newPassword }: {
  currentPassword: string; newPassword: string
}) => {
  const result = await authManager.changePassword(currentPassword, newPassword)
  if (result.success) analytics.track('password_change')
  return result
})

ipcMain.handle('auth:getBalance', async () => {
  return authManager.getBalance()
})

ipcMain.handle('auth:getToken', () => {
  return authManager.getToken()
})

// IPC: CLI Manager
ipcMain.handle('cli:getInfo', () => {
  return cliManager.getInfo()
})

ipcMain.handle('cli:install', async () => {
  try {
    await cliManager.install((step, progress) => {
      safeSend('cli:installProgress', { step, progress })
    })
    analytics.track('cli_install')
    return { success: true }
  } catch (err) {
    log.error('CLI install failed:', err)
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('cli:checkUpdate', async () => {
  return cliManager.checkUpdate()
})

ipcMain.handle('cli:update', async () => {
  try {
    await cliManager.update((step, progress) => {
      safeSend('cli:updateProgress', { step, progress })
    })
    analytics.track('cli_update')
    return { success: true }
  } catch (err) {
    log.error('CLI update failed:', err)
    return { success: false, error: (err as Error).message }
  }
})

// IPC: Tools Manager
ipcMain.handle('tools:getInfo', () => {
  return toolsManager.getInfo()
})

ipcMain.handle('tools:isAllInstalled', () => {
  return toolsManager.isAllInstalled()
})

ipcMain.handle('tools:install', async () => {
  try {
    await toolsManager.install((step, progress) => {
      safeSend('tools:installProgress', { step, progress })
    })
    analytics.track('tools_install')
    return { success: true }
  } catch (err) {
    log.error('Tools install failed:', err)
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('tools:getEnvPatch', () => {
  return toolsManager.getEnvPatch()
})

// IPC: PTY — now supports launching claude directly
ipcMain.handle('pty:create', (_event, options: {
  cwd: string
  env?: Record<string, string>
  launchClaude?: boolean
}) => {
  try {
    let command: string | undefined
    let args: string[] = []

    if (options.launchClaude && cliManager.isInstalled()) {
      command = cliManager.getBinaryPath()
    }

    // Merge tools PATH into env so PTY can find bundled python/git
    const toolsEnv = toolsManager.getEnvPatch()
    const mergedEnv = { ...toolsEnv, ...options.env }

    const id = ptyManager.create(options.cwd, mergedEnv, command, args)
    ptyMonitor.watch(id)
    ptyManager.onData(id, (data) => {
      safeSend('pty:data', { id, data })
      ptyMonitor.feed(id, data)
    })
    ptyManager.onExit(id, (exitCode) => {
      safeSend('pty:exit', { id, exitCode })
      ptyMonitor.unwatch(id)
    })
    analytics.track('tab_create')
    return { id }
  } catch (err) {
    log.error('pty:create failed:', err)
    return { error: (err as Error).message }
  }
})

ipcMain.on('pty:write', (_event, { id, data }: { id: string; data: string }) => {
  ptyManager.write(id, data)
})

ipcMain.on('pty:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  ptyManager.resize(id, cols, rows)
})

ipcMain.on('pty:kill', (_event, { id }: { id: string }) => {
  ptyManager.kill(id)
  analytics.track('tab_close')
})

// IPC: Shell actions
ipcMain.handle('shell:openExternal', (_event, url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    log.warn(`Blocked openExternal with non-http URL: ${url}`)
    return
  }
  return shell.openExternal(url)
})

ipcMain.handle('shell:openPath', (_event, path: string) => {
  // Normalize and resolve to catch traversal attempts (e.g. /foo/../../etc/passwd)
  const normalized = normalize(resolve(path))
  if (normalized !== path && path.includes('..')) {
    log.warn(`Blocked openPath with path traversal: ${path}`)
    return
  }
  return shell.openPath(normalized)
})

ipcMain.handle('shell:selectDirectory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC: Renderer error reporting
ipcMain.on('log:error', (_event, { message, stack }: { message: string; stack?: string }) => {
  log.error(`[Renderer] ${message}`, stack || '')
})

// IPC: App auto-update
ipcMain.handle('appUpdate:check', () => checkForAppUpdate())
ipcMain.handle('appUpdate:download', () => downloadAppUpdate())
ipcMain.handle('appUpdate:install', () => installAppUpdate())

// IPC: Clipboard
ipcMain.handle('clipboard:writeText', (_event, text: string) => {
  clipboard.writeText(text)
})

// IPC: App version
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// IPC: Analytics (renderer → main)
ipcMain.on('analytics:track', (_event, { event, props }: { event: string; props?: Record<string, unknown> }) => {
  analytics.track(event, props)
})

// --- Window focus tracking ---
let isWindowFocused = true

// --- Sleep inhibitor ---
let sleepBlockerId: number | null = null
let sleepInhibitorEnabled = true

// --- PTY Monitor: broadcast activity events + notifications + sleep ---
ptyMonitor.on('activity', (event: PtyActivityEvent) => {
  safeSend('pty:activity', event)

  // Desktop notification on task-complete when window is unfocused
  if (event.type === 'task-complete' && !isWindowFocused) {
    safeSend('notification:shouldShow', event)
  }

  // Sleep inhibitor: start when streaming, stop when all idle
  if (event.type === 'streaming') {
    if (sleepBlockerId === null && sleepInhibitorEnabled) {
      sleepBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      safeSend('power:sleepInhibitChange', true)
    }
  } else if (event.type === 'task-complete' || event.type === 'prompt-idle') {
    if (sleepBlockerId !== null && !ptyMonitor.isAnyStreaming()) {
      powerSaveBlocker.stop(sleepBlockerId)
      sleepBlockerId = null
      safeSend('power:sleepInhibitChange', false)
    }
  }
})

// IPC: Show notification (renderer → main, respects user settings)
ipcMain.handle('notification:show', (_event, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
})

// IPC: Window focus state
ipcMain.handle('app:isFocused', () => isWindowFocused)

// IPC: Sleep inhibitor setting
ipcMain.on('power:setSleepInhibitorEnabled', (_event, enabled: boolean) => {
  sleepInhibitorEnabled = enabled
  // If disabling and currently blocking, stop immediately
  if (!enabled && sleepBlockerId !== null) {
    powerSaveBlocker.stop(sleepBlockerId)
    sleepBlockerId = null
    safeSend('power:sleepInhibitChange', false)
  }
})

// IPC: Git branch
ipcMain.handle('git:getBranch', async (_event, cwd: string) => {
  try {
    const { execSync } = require('child_process')
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8', timeout: 3000 }).trim()
    return branch || null
  } catch {
    return null
  }
})

// App lifecycle
app.whenReady().then(() => {
  // CSP: production only (dev needs localhost + ws for HMR)
  if (!process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "connect-src https://llm.starapp.net https://inkess-install-file.oss-cn-beijing.aliyuncs.com; " +
            "font-src 'self'; img-src 'self' data:;"
          ]
        }
      })
    })
  }

  createWindow()
  setupMenu()

  // Track app launch
  analytics.track('app_launch', {
    cli_version: cliManager.isInstalled() ? 'installed' : 'not_installed',
  })

  // Forward app update status to renderer
  onUpdateStatus((status) => {
    safeSend('appUpdate:status', status)
  })

  // Check for app updates after launch (delay 5s to not block startup)
  setTimeout(() => checkForAppUpdate(), 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Kill all PTY processes and give them a moment to terminate
  ptyManager.killAll()
  ptyMonitor.dispose()
  analytics.flushSync()
  if (sleepBlockerId !== null) {
    powerSaveBlocker.stop(sleepBlockerId)
    sleepBlockerId = null
  }
  if (process.platform !== 'darwin') {
    // Short delay to allow PTY processes to actually terminate
    setTimeout(() => app.quit(), 500)
  }
})

function setupMenu(): void {
  const isMac = process.platform === 'darwin'
  const mod = isMac ? 'Cmd' : 'Ctrl'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: `${mod}+T`,
          click: () => safeSend('app:newTab')
        },
        {
          label: 'Close Tab',
          accelerator: `${mod}+W`,
          click: () => safeSend('app:closeTab')
        },
        { type: 'separator' },
        {
          label: 'Open Folder...',
          accelerator: `${mod}+O`,
          click: async () => {
            if (!mainWindow) return
            const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
            if (!result.canceled && result.filePaths[0]) {
              safeSend('app:openFolder', result.filePaths[0])
            }
          }
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tabs',
      submenu: [
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Tab ${i + 1}`,
          accelerator: `${mod}+${i + 1}`,
          click: () => safeSend('app:switchTab', i)
        }))
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
