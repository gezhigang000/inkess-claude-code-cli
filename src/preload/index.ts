import { contextBridge, ipcRenderer } from 'electron'
import * as os from 'os'

const api = {
  platform: process.platform,
  homedir: os.homedir(),

  auth: {
    getStatus: () => ipcRenderer.invoke('auth:getStatus') as Promise<{
      loggedIn: boolean; user: { id: number; email: string; username: string; balance: number } | null
    }>,
    login: (login: string, password: string) => ipcRenderer.invoke('auth:login', { login, password }) as Promise<{
      success: boolean; error?: string
    }>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
    register: (email: string, password: string, code: string, username?: string, referralCode?: string) =>
      ipcRenderer.invoke('auth:register', { email, password, code, username, referralCode }) as Promise<{
        success: boolean; error?: string
      }>,
    sendCode: (email: string) => ipcRenderer.invoke('auth:sendCode', { email }) as Promise<{
      success: boolean; error?: string
    }>,
    forgotPassword: (email: string) => ipcRenderer.invoke('auth:forgotPassword', { email }) as Promise<{
      success: boolean; error?: string
    }>,
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword }) as Promise<{
        success: boolean; error?: string
      }>,
    getBalance: () => ipcRenderer.invoke('auth:getBalance') as Promise<{
      balance: number; error?: string
    }>,
    getToken: () => ipcRenderer.invoke('auth:getToken') as Promise<string | null>
  },

  cli: {
    getInfo: () => ipcRenderer.invoke('cli:getInfo') as Promise<{
      installed: boolean; path: string; version: string | null
    }>,
    install: () => ipcRenderer.invoke('cli:install') as Promise<{
      success: boolean; error?: string
    }>,
    checkUpdate: () => ipcRenderer.invoke('cli:checkUpdate') as Promise<{
      available: boolean; latestVersion: string | null
    }>,
    update: () => ipcRenderer.invoke('cli:update') as Promise<{
      success: boolean; error?: string
    }>,
    onInstallProgress: (callback: (event: { step: string; progress: number }) => void) => {
      const listener = (_: unknown, event: { step: string; progress: number }) => callback(event)
      ipcRenderer.on('cli:installProgress', listener)
      return () => ipcRenderer.removeListener('cli:installProgress', listener)
    },
    onUpdateProgress: (callback: (event: { step: string; progress: number }) => void) => {
      const listener = (_: unknown, event: { step: string; progress: number }) => callback(event)
      ipcRenderer.on('cli:updateProgress', listener)
      return () => ipcRenderer.removeListener('cli:updateProgress', listener)
    }
  },

  pty: {
    create: (options: { cwd: string; env?: Record<string, string>; launchClaude?: boolean }) =>
      ipcRenderer.invoke('pty:create', options),
    write: (id: string, data: string) =>
      ipcRenderer.send('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.send('pty:kill', { id }),
    onData: (callback: (event: { id: string; data: string }) => void) => {
      const listener = (_: unknown, event: { id: string; data: string }) => callback(event)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    },
    onExit: (callback: (event: { id: string; exitCode: number }) => void) => {
      const listener = (_: unknown, event: { id: string; exitCode: number }) => callback(event)
      ipcRenderer.on('pty:exit', listener)
      return () => ipcRenderer.removeListener('pty:exit', listener)
    }
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
    selectDirectory: () => ipcRenderer.invoke('shell:selectDirectory') as Promise<string | null>
  },

  menu: {
    onNewTab: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('app:newTab', listener)
      return () => ipcRenderer.removeListener('app:newTab', listener)
    },
    onCloseTab: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('app:closeTab', listener)
      return () => ipcRenderer.removeListener('app:closeTab', listener)
    },
    onSwitchTab: (callback: (index: number) => void) => {
      const listener = (_: unknown, index: number) => callback(index)
      ipcRenderer.on('app:switchTab', listener)
      return () => ipcRenderer.removeListener('app:switchTab', listener)
    },
    onOpenFolder: (callback: (path: string) => void) => {
      const listener = (_: unknown, path: string) => callback(path)
      ipcRenderer.on('app:openFolder', listener)
      return () => ipcRenderer.removeListener('app:openFolder', listener)
    }
  },

  log: {
    error: (message: string, stack?: string) =>
      ipcRenderer.send('log:error', { message, stack })
  },

  appUpdate: {
    check: () => ipcRenderer.invoke('appUpdate:check'),
    download: () => ipcRenderer.invoke('appUpdate:download'),
    install: () => ipcRenderer.invoke('appUpdate:install'),
    onStatus: (callback: (status: {
      type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
      version?: string; percent?: number; message?: string
    }) => void) => {
      const listener = (_: unknown, status: any) => callback(status)
      ipcRenderer.on('appUpdate:status', listener)
      return () => ipcRenderer.removeListener('appUpdate:status', listener)
    }
  },

  analytics: {
    track: (event: string, props?: Record<string, unknown>) =>
      ipcRenderer.send('analytics:track', { event, props })
  },

  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text)
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
