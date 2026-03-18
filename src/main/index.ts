import log from './logger'
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, session, nativeImage } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/pty-manager'
import { CliManager } from './cli/cli-manager'
import { AuthManager } from './auth/auth-manager'
import { checkForAppUpdate, downloadAppUpdate, installAppUpdate, onUpdateStatus } from './updater'
import { Analytics } from './analytics'

process.on('uncaughtException', (err) => log.error('Uncaught:', err))
process.on('unhandledRejection', (reason) => log.error('Unhandled:', reason))

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const cliManager = new CliManager()
const authManager = new AuthManager()
const analytics = new Analytics()
analytics.setTokenGetter(() => authManager.getToken())

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
    backgroundColor: '#1A1A2E',
    icon: join(__dirname, '../../resources/icon-256.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
      mainWindow?.webContents.send('cli:installProgress', { step, progress })
    })
    analytics.track('cli_install')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('cli:checkUpdate', async () => {
  return cliManager.checkUpdate()
})

ipcMain.handle('cli:update', async () => {
  try {
    await cliManager.update((step, progress) => {
      mainWindow?.webContents.send('cli:updateProgress', { step, progress })
    })
    analytics.track('cli_update')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
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

    const id = ptyManager.create(options.cwd, options.env, command, args)
    ptyManager.onData(id, (data) => {
      mainWindow?.webContents.send('pty:data', { id, data })
    })
    ptyManager.onExit(id, (exitCode) => {
      mainWindow?.webContents.send('pty:exit', { id, exitCode })
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
  return shell.openExternal(url)
})

ipcMain.handle('shell:openPath', (_event, path: string) => {
  return shell.openPath(path)
})

ipcMain.handle('shell:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
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

// IPC: Analytics (renderer → main)
ipcMain.on('analytics:track', (_event, { event, props }: { event: string; props?: Record<string, unknown> }) => {
  analytics.track(event, props)
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
    mainWindow?.webContents.send('appUpdate:status', status)
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
  analytics.flushSync()
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
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
          click: () => mainWindow?.webContents.send('app:newTab')
        },
        {
          label: 'Close Tab',
          accelerator: `${mod}+W`,
          click: () => mainWindow?.webContents.send('app:closeTab')
        },
        { type: 'separator' },
        {
          label: 'Open Folder...',
          accelerator: `${mod}+O`,
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
            if (!result.canceled && result.filePaths[0]) {
              mainWindow?.webContents.send('app:openFolder', result.filePaths[0])
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
          click: () => mainWindow?.webContents.send('app:switchTab', i)
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
