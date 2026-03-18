import { useCallback, useRef, useEffect, useState } from 'react'
import { useTerminalStore } from './stores/terminal'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { TerminalView } from './views/terminal/TerminalView'
import { Sidebar } from './views/sidebar/Sidebar'
import { SetupScreen, startInstall } from './views/setup/SetupScreen'
import { LoginScreen } from './views/login/LoginScreen'
import { SettingsPanel } from './views/settings/SettingsPanel'
import { UpdateToast } from './views/update/UpdateToast'

const DEFAULT_CWD = window.api?.homedir || '/Users'

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

  const handleNewTab = useCallback(async (cwd?: string) => {
    const targetCwd = cwd || (tabs.length > 0 ? tabs[tabs.length - 1].cwd : DEFAULT_CWD)
    const cliInfo = await window.api.cli.getInfo()
    const token = await window.api.auth.getToken()

    const ptyId = await window.api.pty.create({
      cwd: targetCwd,
      launchClaude: cliInfo.installed,
      env: {
        ...(token ? { ANTHROPIC_AUTH_KEY: token } : {}),
        ANTHROPIC_BASE_URL: 'https://llm.starapp.net/api/llm'
      }
    })

    const id = crypto.randomUUID()
    const title = targetCwd.split('/').pop() || 'terminal'
    addTab({ id, ptyId, title, cwd: targetCwd })
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
    return unsub
  }, [])

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
      <div style={{ width: 70 }} />
      <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
        Inkess Claude Code
        {phase === 'ready' && activeTabId && tabs.find((t) => t.id === activeTabId) && (
          <span> — {tabs.find((t) => t.id === activeTabId)!.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
        )}
      </div>
      <div style={{ width: 70 }} />
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {titleBar}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar onSelectDirectory={handleSelectDirectory} onSettings={() => setShowSettings(true)} />
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
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {updateInfo && (
        <UpdateToast
          currentVersion={updateInfo.current}
          latestVersion={updateInfo.latest}
          onUpdate={handleCliUpdate}
          onDismiss={() => setUpdateInfo(null)}
        />
      )}
      {appUpdateStatus && appUpdateStatus.type === 'available' && (
        <AppUpdateToast
          version={appUpdateStatus.version || ''}
          onDownload={() => window.api.appUpdate.download()}
          onDismiss={() => setAppUpdateStatus(null)}
        />
      )}
      {appUpdateStatus && appUpdateStatus.type === 'downloaded' && (
        <AppUpdateToast
          version={appUpdateStatus.version || ''}
          downloaded
          onInstall={() => window.api.appUpdate.install()}
          onDismiss={() => setAppUpdateStatus(null)}
        />
      )}
    </div>
  )
}

// --- Sub-components ---

import type { TerminalTab } from './stores/terminal'

function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: {
  tabs: TerminalTab[]; activeTabId: string | null
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void
}) {
  return (
    <div style={{
      height: 36, background: 'var(--bg-secondary)', display: 'flex',
      alignItems: 'stretch', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 8px'
    }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontSize: 12,
            color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            borderBottom: tab.id === activeTabId ? '2px solid var(--accent)' : '2px solid transparent'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          {tab.title}
          {tabs.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
              style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, opacity: 0.5, fontSize: 14 }}
            >×</span>
          )}
        </div>
      ))}
      <div onClick={onNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>+</div>
    </div>
  )
}

function Toolbar({ tabs, activeTabId }: { tabs: TerminalTab[]; activeTabId: string | null }) {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  if (!activeTab) return null

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
        <ToolbarButton title="Open in IDE" onClick={() => window.api.shell.openExternal(`vscode://file/${activeTab.cwd}`)}>
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

function AppUpdateToast({ version, downloaded, onDownload, onInstall, onDismiss }: {
  version: string; downloaded?: boolean
  onDownload?: () => void; onInstall?: () => void; onDismiss: () => void
}) {
  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 16, background: 'var(--bg-secondary)',
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
