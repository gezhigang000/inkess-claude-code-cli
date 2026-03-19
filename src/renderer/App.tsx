import { useCallback, useRef, useEffect, useState } from 'react'
import { useTerminalStore } from './stores/terminal'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useSettingsStore, applyTheme } from './stores/settings'
import { TerminalView } from './views/terminal/TerminalView'
import { Sidebar } from './views/sidebar/Sidebar'
import { SetupScreen, startInstall } from './views/setup/SetupScreen'
import { LoginScreen } from './views/login/LoginScreen'
import { SettingsPanel } from './views/settings/SettingsPanel'
import { UpdateToast } from './views/update/UpdateToast'
import { StatusBar } from './views/statusbar/StatusBar'
import { CommandPalette } from './views/command-palette/CommandPalette'
import { useI18n } from './i18n'

const DEFAULT_CWD = window.api?.homedir || '/'
const isMac = window.api?.platform === 'darwin'

/** Shorten absolute path: replace home dir with ~, normalize separators */
export function shortenPath(p: string): string {
  const home = window.api?.homedir || ''
  if (home && p.startsWith(home)) {
    p = '~' + p.slice(home.length)
  }
  return p.replace(/\\/g, '/')
}

/** Get last segment of a path (works with both / and \) */
function pathBasename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || 'terminal'
}

const IDE_SCHEMES: Record<string, string> = {
  vscode: 'vscode://',
  cursor: 'cursor://',
  zed: 'zed://',
}

export function App() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab } = useTerminalStore()
  const { phase, setPhase, setCliInfo } = useAppStore()
  const { setAuth } = useAuthStore()
  const initRef = useRef(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const pendingCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ current: string; latest: string } | null>(null)
  const [appUpdateStatus, setAppUpdateStatus] = useState<{
    type: string; version?: string; percent?: number
  } | null>(null)
  const { t } = useI18n()

  // Startup: check auth → check CLI
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    ;(async () => {
      const authStatus = await window.api.auth.getStatus()
      setAuth(authStatus.loggedIn, authStatus.user)

      if (!authStatus.loggedIn) {
        setPhase('login')
        return
      }

      await checkCliAndProceed()
    })()
  }, [setPhase, setCliInfo, setAuth])

  const checkCliAndProceed = useCallback(async () => {
    const info = await window.api.cli.getInfo()
    setCliInfo(info.installed, info.version)

    if (!info.installed) {
      await startInstall()
      const newInfo = await window.api.cli.getInfo()
      if (!newInfo.installed) return
    }

    setPhase('ready')
  }, [setCliInfo, setPhase])

  const handleLoginSuccess = useCallback(async () => {
    const authStatus = await window.api.auth.getStatus()
    setAuth(authStatus.loggedIn, authStatus.user)
    await checkCliAndProceed()
  }, [setAuth, checkCliAndProceed])

  // Graceful logout: kill all ptys, reset stores, go to login
  const handleLogout = useCallback(() => {
    tabs.forEach(tab => {
      if (tab.ptyId) window.api.pty.kill(tab.ptyId)
    })
    window.api.auth.logout()
    useAuthStore.getState().logout()
    useTerminalStore.setState({ tabs: [], activeTabId: null })
    setShowSettings(false)
    setPhase('login')
  }, [tabs, setPhase])

  const handleNewTab = useCallback(async (cwd?: string) => {
    const targetCwd = cwd || (tabs.length > 0 ? tabs[tabs.length - 1].cwd : DEFAULT_CWD)
    const cliInfo = await window.api.cli.getInfo()
    const token = await window.api.auth.getToken()

    const result = await window.api.pty.create({
      cwd: targetCwd,
      launchClaude: cliInfo.installed,
      env: {
        ...(token ? { ANTHROPIC_AUTH_TOKEN: token } : {}),
        ANTHROPIC_BASE_URL: 'https://llm.starapp.net/api/llm'
      }
    })

    if (result.error || !result.id) return

    const id = crypto.randomUUID()
    const title = pathBasename(targetCwd)
    addTab({ id, ptyId: result.id, title, cwd: targetCwd })

    // Persist to recent projects
    saveRecentProject(targetCwd)
  }, [tabs, addTab])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      // If PTY already exited or only one tab, close immediately
      if (tab?.isExited || tabs.length <= 1) {
        if (tab?.ptyId) window.api.pty.kill(tab.ptyId)
        removeTab(tabId)
        setPendingCloseTabId(null)
        return
      }
      // "Press again to close" pattern
      if (pendingCloseTabId === tabId) {
        if (tab?.ptyId) window.api.pty.kill(tab.ptyId)
        removeTab(tabId)
        setPendingCloseTabId(null)
        if (pendingCloseTimerRef.current) clearTimeout(pendingCloseTimerRef.current)
        return
      }
      setPendingCloseTabId(tabId)
      if (pendingCloseTimerRef.current) clearTimeout(pendingCloseTimerRef.current)
      pendingCloseTimerRef.current = setTimeout(() => setPendingCloseTabId(null), 3000)
    },
    [tabs, removeTab, pendingCloseTabId]
  )

  const handleSelectDirectory = useCallback(async () => {
    const dir = await window.api.shell.selectDirectory()
    if (dir) handleNewTab(dir)
  }, [handleNewTab])

  // Clean up pending close timer on unmount
  useEffect(() => {
    return () => { if (pendingCloseTimerRef.current) clearTimeout(pendingCloseTimerRef.current) }
  }, [])

  // Menu keyboard shortcuts
  useEffect(() => {
    const unsubs = [
      window.api.menu.onNewTab(() => handleSelectDirectory()),
      window.api.menu.onCloseTab(() => {
        if (activeTabId) handleCloseTab(activeTabId)
      }),
      window.api.menu.onSwitchTab((index) => {
        if (tabs[index]) setActiveTab(tabs[index].id)
      }),
      window.api.menu.onOpenFolder((path) => handleNewTab(path))
    ]
    return () => unsubs.forEach(fn => fn())
  }, [handleSelectDirectory, handleCloseTab, activeTabId, tabs, setActiveTab])

  // Mark tabs as exited when PTY exits
  useEffect(() => {
    const unsub = window.api.pty.onExit((event) => {
      const { updateTab } = useTerminalStore.getState()
      const tab = useTerminalStore.getState().tabs.find(t => t.ptyId === event.id)
      if (tab) updateTab(tab.id, { isExited: true })
    })
    return () => { unsub() }
  }, [])

  // Check CLI update once on startup
  useEffect(() => {
    if (phase !== 'ready') return
    const check = async () => {
      const info = await window.api.cli.getInfo()
      if (!info.version) return
      const result = await window.api.cli.checkUpdate()
      if (result.available && result.latestVersion) {
        setUpdateInfo({ current: info.version, latest: result.latestVersion })
      }
    }
    check()
  }, [phase])

  // App auto-update status listener
  useEffect(() => {
    const unsub = window.api.appUpdate.onStatus((status) => {
      if (status.type === 'available' || status.type === 'downloaded' || status.type === 'downloading') {
        setAppUpdateStatus(status)
      }
    })
    return () => { unsub() }
  }, [])

  // Desktop notifications: show when task completes and window is unfocused
  useEffect(() => {
    const unsub = window.api.notification.onShouldShow(() => {
      const settings = useSettingsStore.getState()
      if (!settings.notificationsEnabled) return
      window.api.notification.show('Task Complete', 'Claude Code has finished the task.')
    })
    return () => { unsub() }
  }, [])

  // Global keyboard shortcuts: Cmd+K (command palette), Shift+Tab (mode cycle)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K → toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
      }
      // Shift+Tab → cycle mode (only when not typing in terminal)
      if (e.shiftKey && e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
        const active = document.activeElement
        // Don't intercept if focus is inside xterm or an input
        if (active?.closest('.xterm') || active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return
        e.preventDefault()
        const store = useTerminalStore.getState()
        const tab = store.tabs.find(t => t.id === store.activeTabId)
        if (!tab?.ptyId || tab.isRunning) return
        const modes = ['suggest', 'autoedit', 'fullauto'] as const
        const cmds: Record<string, string> = { suggest: '/permissions suggest\n', autoedit: '/permissions auto-edit\n', fullauto: '/permissions full-auto\n' }
        const idx = modes.indexOf((tab.mode || 'suggest') as any)
        const next = modes[(idx + 1) % modes.length]
        window.api.pty.write(tab.ptyId, cmds[next])
        store.updateTab(tab.id, { mode: next })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Listen for system theme changes (for 'auto' mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => applyTheme(useSettingsStore.getState().theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Periodic balance refresh (every 5 min)
  useEffect(() => {
    if (phase !== 'ready') return
    const refresh = () => {
      window.api.auth.getBalance().then(({ balance }) => {
        useAuthStore.getState().setBalance(balance)
      })
    }
    refresh()
    const timer = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleCliUpdate = useCallback(async () => {
    const result = await window.api.cli.update()
    if (result.success) {
      const info = await window.api.cli.getInfo()
      setCliInfo(info.installed, info.version)
      setUpdateInfo(null)
    }
  }, [setCliInfo])

  const plainTitleBar = (
    <div
      className="titlebar-drag"
      style={{
        height: 38, background: 'var(--bg-secondary)', display: 'flex',
        alignItems: 'center', padding: '0 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0
      }}
    >
      {isMac && <div style={{ width: 70 }} />}
      <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
        {t('app.title')}
      </div>
      {isMac && <div style={{ width: 70 }} />}
    </div>
  )

  if (phase === 'login') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {plainTitleBar}
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    )
  }

  if (phase === 'checking' || phase === 'installing' || phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {plainTitleBar}
        <SetupScreen />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        pendingCloseTabId={pendingCloseTabId}
        onSelect={setActiveTab}
        onClose={handleCloseTab}
        onNew={handleSelectDirectory}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSettings={() => { setShowSettings(true); window.api.analytics?.track('settings_open') }}
          onOpenProject={(cwd) => {
            const existing = tabs.find(t => t.cwd === cwd)
            if (existing) {
              setActiveTab(existing.id)
            } else {
              handleNewTab(cwd)
            }
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tabs.length === 0 ? (
            <WelcomeScreen onOpenFolder={handleSelectDirectory} onOpenProject={handleNewTab} />
          ) : (
            <>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {tabs.map((tab) => (
                  <TerminalView key={tab.id} ptyId={tab.ptyId} isActive={tab.id === activeTabId} />
                ))}
              </div>
              <StatusBar />
            </>
          )}
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onLogout={handleLogout} />}
      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onNewTab={handleSelectDirectory}
          onSettings={() => { setShowCommandPalette(false); setShowSettings(true) }}
          onToggleTheme={() => {
            const { theme, setTheme } = useSettingsStore.getState()
            setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')
          }}
        />
      )}
      {updateInfo && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 200 }}>
          <UpdateToast
            currentVersion={updateInfo.current}
            latestVersion={updateInfo.latest}
            onUpdate={handleCliUpdate}
            onDismiss={() => setUpdateInfo(null)}
          />
        </div>
      )}
      {appUpdateStatus && appUpdateStatus.type === 'available' && (
        <AppUpdateToast
          version={appUpdateStatus.version || ''}
          bottomOffset={updateInfo ? 100 : 16}
          onDownload={() => window.api.appUpdate.download()}
          onDismiss={() => setAppUpdateStatus(null)}
        />
      )}
      {appUpdateStatus && appUpdateStatus.type === 'downloaded' && (
        <AppUpdateToast
          version={appUpdateStatus.version || ''}
          bottomOffset={updateInfo ? 100 : 16}
          downloaded
          onInstall={() => window.api.appUpdate.install()}
          onDismiss={() => setAppUpdateStatus(null)}
        />
      )}
    </div>
  )
}

// --- Recent projects persistence ---

const RECENT_PROJECTS_KEY = 'inkess-recent-projects'
const MAX_RECENT = 10

function saveRecentProject(cwd: string) {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
    const list: string[] = raw ? JSON.parse(raw) : []
    const filtered = list.filter(p => p !== cwd)
    filtered.unshift(cwd)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch { /* ignore */ }
}

export function getRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// --- Sub-components ---

import type { TerminalTab } from './stores/terminal'

function TitleTabBar({ tabs, activeTabId, onSelect, onClose, onNew, pendingCloseTabId }: {
  tabs: TerminalTab[]; activeTabId: string | null; pendingCloseTabId: string | null
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void
}) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const { t } = useI18n()

  return (
    <div
      className="titlebar-drag"
      style={{
        height: 38, background: 'var(--bg-secondary)', display: 'flex',
        alignItems: 'stretch', borderBottom: '1px solid var(--border)', flexShrink: 0,
        padding: '0 8px'
      }}
    >
      {isMac && <div style={{ width: 70 }} />}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isHovered = tab.id === hoveredTab
        const isPendingClose = tab.id === pendingCloseTabId
        return (
          <div
            key={tab.id}
            className="titlebar-no-drag"
            onClick={() => onSelect(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
            }}
            onMouseEnter={() => setHoveredTab(tab.id)}
            onMouseLeave={() => setHoveredTab(null)}
            title={shortenPath(tab.cwd)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 12,
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            {tab.title}
            {tabs.length > 1 && (
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <span
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
                  style={{
                    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, fontSize: 14, marginLeft: 2,
                    opacity: (isHovered || isActive || isPendingClose) ? 0.7 : 0,
                    background: isPendingClose ? 'var(--error)' : (isHovered ? 'var(--bg-hover)' : 'transparent'),
                    color: isPendingClose ? '#fff' : 'inherit',
                    transition: 'opacity 0.15s, background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isPendingClose) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-active)' } }}
                  onMouseLeave={(e) => { if (!isPendingClose) { e.currentTarget.style.opacity = (isHovered || isActive) ? '0.7' : '0'; e.currentTarget.style.background = 'transparent' } }}
                >×</span>
                {isPendingClose && (
                  <span style={{
                    position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-active)', color: 'var(--text-primary)',
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap',
                    animation: 'slideUp 0.15s ease-out',
                  }}>
                    {t('tab.pressAgainToClose')}
                  </span>
                )}
              </span>
            )}
          </div>
        )
      })}
      <div
        className="titlebar-no-drag"
        onClick={onNew}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
      >+</div>
      <div style={{ flex: 1 }} />
      {!isMac && <div style={{ width: 140 }} />}
      {contextMenu && (
        <TabContextMenu
          tab={tabs.find(t => t.id === contextMenu.tabId)!}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => { onClose(contextMenu.tabId); setContextMenu(null) }}
          onDismiss={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function TabContextMenu({ tab, x, y, onClose, onDismiss }: {
  tab: TerminalTab; x: number; y: number
  onClose: () => void; onDismiss: () => void
}) {
  const { t } = useI18n()
  const ideChoice = useSettingsStore((s) => s.ideChoice)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  const ideScheme = IDE_SCHEMES[ideChoice] || 'vscode://'
  const ideName = ideChoice === 'vscode' ? 'VS Code' : ideChoice === 'cursor' ? 'Cursor' : 'Zed'

  useEffect(() => {
    const handler = () => onDismiss()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onDismiss])

  const menuItems: { key: string; label: string; onClick: () => void; separator?: boolean }[] = [
    {
      key: 'finder',
      label: isMac ? t('tab.openInFinder') : t('tab.openInExplorer'),
      onClick: () => { window.api.shell.openPath(tab.cwd); onDismiss() }
    },
    {
      key: 'ide',
      label: t('tab.openInIde', { ide: ideName }),
      onClick: () => { window.api.shell.openExternal(`${ideScheme}file/${tab.cwd}`); onDismiss() }
    },
    {
      key: 'copy',
      label: t('tab.copyPath'),
      onClick: () => { window.api.clipboard.writeText(tab.cwd); onDismiss() }
    },
    {
      key: 'close',
      label: t('tab.closeTab'),
      separator: true,
      onClick: onClose
    }
  ]

  return (
    <div
      style={{
        position: 'fixed', left: x, top: y, zIndex: 9999,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 0', minWidth: 180,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', fontSize: 13
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => (
        <div key={item.key}>
          {item.separator && (
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
          )}
          <div
            onClick={item.onClick}
            onMouseEnter={() => setHoveredItem(item.key)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{
              padding: '6px 16px', cursor: 'pointer',
              color: 'var(--text-primary)',
              background: hoveredItem === item.key ? 'var(--bg-hover)' : 'transparent',
              transition: 'background 0.1s'
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function WelcomeScreen({ onOpenFolder, onOpenProject }: { onOpenFolder: () => void; onOpenProject: (cwd: string) => void }) {
  const { t } = useI18n()
  const [hovered, setHovered] = useState<string | null>(null)
  const recentDirs = getRecentProjects()

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, padding: 32
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>

      <button
        onClick={onOpenFolder}
        onMouseEnter={() => setHovered('open')}
        onMouseLeave={() => setHovered(null)}
        style={{
          padding: '10px 28px', borderRadius: 6, border: 'none',
          background: hovered === 'open' ? 'var(--accent-hover, var(--accent))' : 'var(--accent)',
          color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500,
          transition: 'background 0.15s'
        }}
      >
        {t('welcome.openFolder')}
      </button>

      {recentDirs.length > 0 && (
        <div style={{ width: '100%', maxWidth: 400, marginTop: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8
          }}>
            {t('welcome.recentProjects')}
          </div>
          {recentDirs.map((dir) => (
            <div
              key={dir}
              onClick={() => onOpenProject(dir)}
              onMouseEnter={() => setHovered(dir)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 8,
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
                color: hovered === dir ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: hovered === dir ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {shortenPath(dir)}
              </span>
            </div>
          ))}
        </div>
      )}

      {recentDirs.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('welcome.noRecent')}
        </div>
      )}
    </div>
  )
}

function AppUpdateToast({ version, downloaded, bottomOffset, onDownload, onInstall, onDismiss }: {
  version: string; downloaded?: boolean; bottomOffset?: number
  onDownload?: () => void; onInstall?: () => void; onDismiss: () => void
}) {
  const { t } = useI18n()
  return (
    <div style={{
      position: 'fixed', bottom: bottomOffset ?? 16, right: 16, background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-primary)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000
    }}>
      <span>{downloaded ? t('appUpdate.ready', { version }) : t('appUpdate.available', { version })}</span>
      {downloaded ? (
        <button onClick={onInstall} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12
        }}>{t('appUpdate.restartUpdate')}</button>
      ) : (
        <button onClick={onDownload} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12
        }}>{t('appUpdate.download')}</button>
      )}
      <span onClick={onDismiss} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 16 }}>×</span>
    </div>
  )
}
