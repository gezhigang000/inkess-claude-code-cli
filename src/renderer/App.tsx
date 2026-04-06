import { useCallback, useRef, useEffect, useState } from 'react'
import { useTerminalStore } from './stores/terminal'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useSettingsStore, applyTheme } from './stores/settings'
import { TerminalView } from './views/terminal/TerminalView'
import { Sidebar } from './views/sidebar/Sidebar'
import { SetupScreen, startInstall, startToolsInstall } from './views/setup/SetupScreen'
import { LoginScreen } from './views/login/LoginScreen'
import { SettingsPanel } from './views/settings/SettingsPanel'
import { UpdateToast } from './views/update/UpdateToast'
import { StatusBar } from './views/statusbar/StatusBar'
import { CommandPalette } from './views/command-palette/CommandPalette'
import { SessionHistoryView } from './views/session-history/SessionHistoryView'
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
  const closeCommandPalette = useCallback(() => setShowCommandPalette(false), [])
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const pendingCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ current: string; latest: string } | null>(null)
  const [appUpdateStatus, setAppUpdateStatus] = useState<{
    type: string; version?: string; percent?: number
  } | null>(null)
  const appUpdateDismissedRef = useRef(false)
  const { t } = useI18n()

  // Startup: check auth → check CLI
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    ;(async () => {
      const authStatus = await window.api.auth.getStatus()
      setAuth(authStatus.loggedIn, authStatus.user)

      if (!authStatus.loggedIn) {
        // Try auto-login with saved credentials
        const autoResult = await window.api.auth.autoLogin()
        if (autoResult.success) {
          setAuth(true, autoResult.user)
          await checkCliAndProceed()
          return
        }
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
      // startInstall handles both CLI + tools
      await startInstall()
      const newInfo = await window.api.cli.getInfo()
      if (!newInfo.installed) return
    } else {
      // CLI already installed — check tools separately
      const toolsInstalled = await window.api.tools.isAllInstalled()
      if (!toolsInstalled) {
        await startToolsInstall()
      }
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

    const result = await window.api.pty.create({
      cwd: targetCwd,
      launchClaude: useAppStore.getState().cliInstalled,
      env: {
        ANTHROPIC_BASE_URL: 'https://llm.starapp.net/api/llm'
      }
    })

    if (result.error || !result.id) return

    const id = crypto.randomUUID()
    const title = pathBasename(targetCwd)
    addTab({ id, ptyId: result.id, title, cwd: targetCwd, createdAt: Date.now() })

    // Persist to recent projects
    saveRecentProject(targetCwd)
  }, [tabs, addTab])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      // Read latest tabs from store to avoid stale closure
      const currentTabs = useTerminalStore.getState().tabs
      const tab = currentTabs.find((t) => t.id === tabId)
      // If PTY already exited or only one tab, close immediately
      if (tab?.isExited || currentTabs.length <= 1) {
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
    return () => unsubs.forEach(fn => { try { fn?.() } catch { /* ignore */ } })
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
        // Don't re-show if user dismissed (except for downloaded — always show "restart" prompt)
        if (appUpdateDismissedRef.current && status.type !== 'downloaded') return
        if (status.type === 'downloaded') appUpdateDismissedRef.current = false
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+K / Ctrl+K → toggle command palette
      if (mod && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
      }
      // Cmd+T / Ctrl+T → new tab
      if (mod && e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        handleSelectDirectory()
      }
      // Cmd+, / Ctrl+, → settings
      if (mod && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
      }
      // Cmd+M / Ctrl+M → /model command
      if (mod && e.key === 'm' && !e.shiftKey) {
        e.preventDefault()
        const store = useTerminalStore.getState()
        const tab = store.tabs.find(t => t.id === store.activeTabId)
        if (tab?.ptyId) window.api.pty.write(tab.ptyId, '/model\n')
      }
      // Cmd+O → open folder
      if (mod && e.key === 'o' && !e.shiftKey) {
        e.preventDefault()
        handleSelectDirectory()
      }
      // Cmd+1~9 → switch to tab N
      if (mod && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        const store = useTerminalStore.getState()
        if (store.tabs[idx]) store.setActiveTab(store.tabs[idx].id)
      }
      // Cmd+Shift+H → session history
      if (mod && e.shiftKey && e.key === 'H') {
        e.preventDefault()
        setShowHistory(prev => prev !== null ? null : '')
      }
      // Cmd+Shift+C / Ctrl+Shift+C → /compact command
      if (mod && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        const store = useTerminalStore.getState()
        const tab = store.tabs.find(t => t.id === store.activeTabId)
        if (tab?.ptyId) window.api.pty.write(tab.ptyId, '/compact\n')
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
  }, [handleSelectDirectory])

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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    for (const file of files) {
      const filePath = window.api.fs.getPathForFile(file) || (file as any).path as string
      if (!filePath) continue
      const isDir = await window.api.fs.isDirectory(filePath)
      if (isDir) {
        handleNewTab(filePath)
      } else {
        // Insert file path into active PTY — use single-quote escaping for shell safety
        const store = useTerminalStore.getState()
        const tab = store.tabs.find(t => t.id === store.activeTabId)
        if (tab?.ptyId) {
          const normalized = filePath.replace(/\\/g, '/')
          const escaped = `'${normalized.replace(/'/g, "'\\''")}'`
          window.api.pty.write(tab.ptyId, escaped + ' ')
        }
      }
    }
  }, [handleNewTab])

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
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setDragOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragOver(false) } }}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '32px 48px', borderRadius: 16,
            border: '2px dashed var(--accent)', background: 'var(--bg-secondary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
              {t('app.dropToOpen')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('app.dropHint')}
            </span>
          </div>
        </div>
      )}
      <TitleTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        pendingCloseTabId={pendingCloseTabId}
        onSelect={setActiveTab}
        onClose={handleCloseTab}
        onNew={handleSelectDirectory}
        onCommandPalette={() => setShowCommandPalette(true)}
        onSettings={() => { setShowSettings(true); window.api.analytics?.track('settings_open') }}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSettings={() => { setShowSettings(true); window.api.analytics?.track('settings_open') }}
          onNewSession={handleSelectDirectory}
          onCommandPalette={() => setShowCommandPalette(true)}
          onOpenHistory={(sessionId) => setShowHistory(sessionId || '')}
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
          {showHistory !== null ? (
            <SessionHistoryView
              onBack={() => setShowHistory(null)}
              onOpenInTerminal={(cwd) => { setShowHistory(null); handleNewTab(cwd) }}
              initialSessionId={showHistory || undefined}
            />
          ) : tabs.length === 0 ? (
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
          onClose={closeCommandPalette}
          onNewTab={handleSelectDirectory}
          onSettings={() => { setShowCommandPalette(false); setShowSettings(true) }}
          onToggleTheme={() => {
            const { theme, setTheme } = useSettingsStore.getState()
            setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')
          }}
          onHistory={() => { setShowCommandPalette(false); setShowHistory('') }}
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
      {appUpdateStatus && (appUpdateStatus.type === 'available' || appUpdateStatus.type === 'downloading' || appUpdateStatus.type === 'downloaded') && (
        <AppUpdateToast
          status={appUpdateStatus}
          bottomOffset={updateInfo ? 100 : 16}
          onDownload={() => window.api.appUpdate.download()}
          onInstall={() => {
            // Check for active sessions before installing
            const { tabs } = useTerminalStore.getState()
            const activeTabs = tabs.filter(t => t.ptyId)
            if (activeTabs.length > 0) {
              const confirmed = window.confirm(t('appUpdate.activeSessionWarning'))
              if (!confirmed) return
            }
            window.api.appUpdate.install()
          }}
          onDismiss={() => { appUpdateDismissedRef.current = true; setAppUpdateStatus(null) }}
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

function TitleTabBar({ tabs, activeTabId, onSelect, onClose, onNew, pendingCloseTabId, onCommandPalette, onSettings }: {
  tabs: TerminalTab[]; activeTabId: string | null; pendingCloseTabId: string | null
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void
  onCommandPalette?: () => void; onSettings?: () => void
}) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
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
              background: isActive ? 'var(--bg-hover)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'background 0.12s',
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
                    background: isPendingClose ? 'var(--error)' : 'transparent',
                    color: isPendingClose ? '#fff' : 'var(--text-muted)',
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
      {/* New tab button with hover circle */}
      <div
        className="titlebar-no-drag"
        onClick={onNew}
        onMouseEnter={() => setHoveredBtn('new')}
        onMouseLeave={() => setHoveredBtn(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, alignSelf: 'center',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
          borderRadius: 6,
          background: hoveredBtn === 'new' ? 'var(--bg-hover)' : 'transparent',
          transition: 'background 0.12s',
        }}
      >+</div>
      <div style={{ flex: 1 }} />
      {/* Right-side controls */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <div
          onClick={onCommandPalette}
          onMouseEnter={() => setHoveredBtn('cmd')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Commands (⌘K)"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
            background: hoveredBtn === 'cmd' ? 'var(--bg-hover)' : 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div
          onClick={onSettings}
          onMouseEnter={() => setHoveredBtn('settings')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Settings"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
            background: hoveredBtn === 'settings' ? 'var(--bg-hover)' : 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
        {!isMac && <>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          {[
            { id: 'min', title: 'Minimize', action: () => window.api.window.minimize(), icon: <rect x="3" y="11" width="18" height="2" rx="1" /> },
            { id: 'max', title: 'Maximize', action: () => window.api.window.maximize(), icon: <rect x="3" y="3" width="18" height="18" rx="2" /> },
            { id: 'close', title: 'Close', action: () => window.api.window.close(), icon: <><line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" /></> },
          ].map(({ id, title, action, icon }) => (
            <div
              key={id}
              onClick={action}
              onMouseEnter={() => setHoveredBtn(id)}
              onMouseLeave={() => setHoveredBtn(null)}
              title={title}
              style={{
                width: 40, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: id === 'close' && hoveredBtn === 'close' ? '#fff' : 'var(--text-secondary)',
                background: hoveredBtn === id ? (id === 'close' ? '#e81123' : 'var(--bg-hover)') : 'transparent',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={id === 'max' ? 'none' : 'none'} stroke="currentColor" strokeWidth="2">
                {icon}
              </svg>
            </div>
          ))}
        </>}
      </div>
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
        boxShadow: 'var(--shadow-popover)', fontSize: 13
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

  const cards = [
    ...(recentDirs.length > 0
      ? [{
          key: 'recent',
          icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          ),
          title: t('welcome.cardRecent'),
          desc: t('welcome.cardRecentDesc'),
          onClick: () => onOpenProject(recentDirs[0]),
        }]
      : []),
    {
      key: 'open',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      ),
      title: t('welcome.cardNew'),
      desc: t('welcome.cardNewDesc'),
      onClick: onOpenFolder,
    },
  ]

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, padding: 32
    }}>
      {/* Brand icon */}
      <div style={{
        width: 64, height: 64, borderRadius: 16, background: 'var(--accent-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t('welcome.letsBuild')}
        </div>
        <div
          onClick={onOpenFolder}
          onMouseEnter={() => setHovered('title')}
          onMouseLeave={() => setHovered(null)}
          style={{
            fontSize: 15, color: 'var(--text-muted)', cursor: 'pointer',
            opacity: hovered === 'title' ? 0.8 : 1, transition: 'opacity 0.15s',
          }}
        >
          {t('welcome.openProject')} <span style={{ fontSize: 12 }}>▾</span>
        </div>
      </div>

      {/* Guide cards */}
      <div style={{
        display: 'flex', gap: 12, marginTop: 24, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center'
      }}>
        {cards.map((card) => (
          <div
            key={card.key}
            onClick={card.onClick}
            onMouseEnter={() => setHovered(card.key)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: 200, padding: '16px 16px 14px', borderRadius: 10,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: hovered === card.key ? 'var(--bg-hover)' : 'transparent',
              transform: hovered === card.key ? 'translateY(-2px)' : 'none',
              boxShadow: hovered === card.key ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ marginBottom: 10 }}>{card.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{card.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Recent projects list */}
      {recentDirs.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
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

function AppUpdateToast({ status, bottomOffset, onDownload, onInstall, onDismiss }: {
  status: { type: string; version?: string; percent?: number }
  bottomOffset?: number
  onDownload?: () => void; onInstall?: () => void; onDismiss: () => void
}) {
  const { t } = useI18n()
  const version = status.version || ''
  const isDownloading = status.type === 'downloading'
  const isDownloaded = status.type === 'downloaded'
  const percent = Math.round(status.percent || 0)

  return (
    <div style={{
      position: 'fixed', bottom: bottomOffset ?? 16, right: 16, background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
      minWidth: 280, fontSize: 13, color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-popover)', zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          {isDownloaded ? t('appUpdate.ready', { version })
            : isDownloading ? t('appUpdate.downloading', { percent: String(percent) })
            : t('appUpdate.available', { version })}
        </span>
        {isDownloaded ? (
          <button onClick={onInstall} style={{
            padding: '4px 12px', borderRadius: 4, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 12
          }}>{t('appUpdate.restartUpdate')}</button>
        ) : isDownloading ? null : (
          <button onClick={onDownload} style={{
            padding: '4px 12px', borderRadius: 4, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 12
          }}>{t('appUpdate.download')}</button>
        )}
        <span onClick={onDismiss} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 16 }}>×</span>
      </div>
      {isDownloading && (
        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--bg-active)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: 'var(--accent)',
            width: `${percent}%`, transition: 'width 0.3s'
          }} />
        </div>
      )}
    </div>
  )
}
