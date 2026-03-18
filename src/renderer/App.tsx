import { useCallback, useRef, useEffect, useState } from 'react'
import { useTerminalStore } from './stores/terminal'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useSettingsStore } from './stores/settings'
import { TerminalView } from './views/terminal/TerminalView'
import { Sidebar } from './views/sidebar/Sidebar'
import { SetupScreen, startInstall } from './views/setup/SetupScreen'
import { LoginScreen } from './views/login/LoginScreen'
import { SettingsPanel } from './views/settings/SettingsPanel'
import { UpdateToast } from './views/update/UpdateToast'

const DEFAULT_CWD = window.api?.homedir || '/Users'
const isMac = window.api?.platform === 'darwin'

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
  const [updateInfo, setUpdateInfo] = useState<{ current: string; latest: string } | null>(null)
  const [appUpdateStatus, setAppUpdateStatus] = useState<{
    type: string; version?: string; percent?: number
  } | null>(null)

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

    const ptyId = await window.api.pty.create({
      cwd: targetCwd,
      launchClaude: cliInfo.installed,
      env: {
        ...(token ? { ANTHROPIC_API_KEY: token } : {}),
        ANTHROPIC_BASE_URL: 'https://llm.starapp.net/api/llm'
      }
    })

    const id = crypto.randomUUID()
    const title = targetCwd.split('/').pop() || 'terminal'
    addTab({ id, ptyId, title, cwd: targetCwd })

    // Persist to recent projects
    saveRecentProject(targetCwd)
  }, [tabs, addTab])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      if (tab?.ptyId) window.api.pty.kill(tab.ptyId)
      removeTab(tabId)
    },
    [tabs, removeTab]
  )

  const handleSelectDirectory = useCallback(async () => {
    const dir = await window.api.shell.selectDirectory()
    if (dir) handleNewTab(dir)
  }, [handleNewTab])

  useEffect(() => {
    if (phase === 'ready' && tabs.length === 0) handleNewTab()
  }, [phase, tabs.length, handleNewTab])

  // Menu keyboard shortcuts
  useEffect(() => {
    const unsubs = [
      window.api.menu.onNewTab(() => handleNewTab()),
      window.api.menu.onCloseTab(() => {
        if (activeTabId) handleCloseTab(activeTabId)
      }),
      window.api.menu.onSwitchTab((index) => {
        if (tabs[index]) setActiveTab(tabs[index].id)
      }),
      window.api.menu.onOpenFolder((path) => handleNewTab(path))
    ]
    return () => unsubs.forEach(fn => fn())
  }, [handleNewTab, handleCloseTab, activeTabId, tabs, setActiveTab])

  // Periodic CLI update check (every 30 min)
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
    const timer = setInterval(check, 30 * 60 * 1000)
    return () => clearInterval(timer)
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

  const titleBar = (
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
        Inkess Claude Code
        {phase === 'ready' && activeTabId && tabs.find((t) => t.id === activeTabId) && (
          <span> — {tabs.find((t) => t.id === activeTabId)!.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
        )}
      </div>
      {isMac && <div style={{ width: 70 }} />}
    </div>
  )

  if (phase === 'login') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {titleBar}
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    )
  }

  if (phase === 'checking' || phase === 'installing' || phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {titleBar}
        <SetupScreen />
      </div>
    )
  }

  // Count active toasts for stacking
  const toastCount = (updateInfo ? 1 : 0) +
    (appUpdateStatus && (appUpdateStatus.type === 'available' || appUpdateStatus.type === 'downloaded') ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {titleBar}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSelectDirectory={handleSelectDirectory}
          onSettings={() => { setShowSettings(true); window.api.analytics?.track('settings_open') }}
          onOpenProject={(cwd) => {
            // If already open in a tab, switch to it; otherwise create new tab
            const existing = tabs.find(t => t.cwd === cwd)
            if (existing) {
              setActiveTab(existing.id)
            } else {
              handleNewTab(cwd)
            }
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTab}
            onClose={handleCloseTab}
            onNew={() => handleNewTab()}
          />
          <Toolbar tabs={tabs} activeTabId={activeTabId} />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {tabs.map((tab) => (
              <TerminalView key={tab.id} ptyId={tab.ptyId} isActive={tab.id === activeTabId} />
            ))}
          </div>
          <StatusBar />
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onLogout={handleLogout} />}
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

function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: {
  tabs: TerminalTab[]; activeTabId: string | null
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void
}) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  return (
    <div style={{
      height: 36, background: 'var(--bg-secondary)', display: 'flex',
      alignItems: 'stretch', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 8px'
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isHovered = tab.id === hoveredTab
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            onMouseEnter={() => setHoveredTab(tab.id)}
            onMouseLeave={() => setHoveredTab(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontSize: 12,
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
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
                style={{
                  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, fontSize: 14, marginLeft: 2,
                  opacity: (isHovered || isActive) ? 0.7 : 0,
                  background: isHovered ? 'var(--bg-hover)' : 'transparent',
                  transition: 'opacity 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-active)' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = (isHovered || isActive) ? '0.7' : '0'; e.currentTarget.style.background = 'transparent' }}
              >×</span>
            )}
          </div>
        )
      })}
      <div onClick={onNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>+</div>
    </div>
  )
}

function Toolbar({ tabs, activeTabId }: { tabs: TerminalTab[]; activeTabId: string | null }) {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const ideChoice = useSettingsStore((s) => s.ideChoice)
  if (!activeTab) return null

  const ideScheme = IDE_SCHEMES[ideChoice] || 'vscode://'

  return (
    <div style={{
      height: 32, background: 'var(--bg-tertiary)', display: 'flex',
      alignItems: 'center', gap: 8, padding: '0 12px',
      borderBottom: '1px solid var(--border)', flexShrink: 0
    }}>
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        {activeTab.cwd.replace(/^\/Users\/[^/]+/, '~')}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <ToolbarButton title="Open in Finder" onClick={() => window.api.shell.openPath(activeTab.cwd)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </ToolbarButton>
        <ToolbarButton title={`Open in ${ideChoice === 'vscode' ? 'VS Code' : ideChoice === 'cursor' ? 'Cursor' : 'Zed'}`} onClick={() => window.api.shell.openExternal(`${ideScheme}file/${activeTab.cwd}`)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
        </ToolbarButton>
      </div>
    </div>
  )
}

function StatusBar() {
  const { balance } = useAuthStore()
  return (
    <div style={{
      height: 24, background: 'var(--bg-secondary)', display: 'flex',
      alignItems: 'center', padding: '0 12px', borderTop: '1px solid var(--border)',
      fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, gap: 16
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
        Connected
      </div>
      <div>Claude Code {useAppStore.getState().cliVersion || ''}</div>
      <div style={{ marginLeft: 'auto' }}>
        Balance: ¥{(balance / 100).toFixed(2)}
      </div>
    </div>
  )
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', border: 'none', background: 'transparent'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

function AppUpdateToast({ version, downloaded, bottomOffset, onDownload, onInstall, onDismiss }: {
  version: string; downloaded?: boolean; bottomOffset?: number
  onDownload?: () => void; onInstall?: () => void; onDismiss: () => void
}) {
  return (
    <div style={{
      position: 'fixed', bottom: bottomOffset ?? 16, right: 16, background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-primary)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000
    }}>
      <span>{downloaded ? `v${version} ready to install` : `App update v${version} available`}</span>
      {downloaded ? (
        <button onClick={onInstall} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12
        }}>Restart & Update</button>
      ) : (
        <button onClick={onDownload} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12
        }}>Download</button>
      )}
      <span onClick={onDismiss} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 16 }}>×</span>
    </div>
  )
}
