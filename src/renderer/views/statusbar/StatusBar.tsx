import { useState, useEffect } from 'react'
import { useTerminalStore } from '../../stores/terminal'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useI18n } from '../../i18n'

const MODES = ['suggest', 'autoedit', 'fullauto'] as const
const MODE_LABELS: Record<string, string> = {
  suggest: 'Suggest',
  autoedit: 'Auto Edit',
  fullauto: 'Full Auto',
}
const MODE_COMMANDS: Record<string, string> = {
  suggest: '/permissions suggest\n',
  autoedit: '/permissions auto-edit\n',
  fullauto: '/permissions full-auto\n',
}

export function StatusBar() {
  const { tabs, activeTabId, updateTab } = useTerminalStore()
  const { balance } = useAuthStore()
  const { sleepInhibitorEnabled } = useSettingsStore()
  const { t } = useI18n()
  const [sleepActive, setSleepActive] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  // Fetch git branch for active tab
  useEffect(() => {
    if (!activeTab?.cwd || !activeTab.id) return
    window.api.git.getBranch(activeTab.cwd).then((branch) => {
      if (branch) updateTab(activeTab.id, { gitBranch: branch })
    })
  }, [activeTab?.cwd, activeTab?.id])

  // Listen for PTY activity events
  useEffect(() => {
    const unsub = window.api.pty.onActivity((event) => {
      const tab = useTerminalStore.getState().getTabByPtyId(event.id)
      if (!tab) return
      if (event.type === 'streaming') {
        updateTab(tab.id, { isRunning: true })
      } else if (event.type === 'task-complete' || event.type === 'prompt-idle') {
        updateTab(tab.id, { isRunning: false })
      } else if (event.type === 'model-info' && event.payload) {
        updateTab(tab.id, { model: event.payload })
      } else if (event.type === 'mode-change' && event.payload) {
        updateTab(tab.id, { mode: event.payload as any })
      }
    })
    return () => { unsub() }
  }, [])

  // Listen for sleep inhibitor state
  useEffect(() => {
    const unsub = window.api.power.onSleepInhibitChange((active) => setSleepActive(active))
    return () => { unsub() }
  }, [])

  // Track window width for responsive layout
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const isCompact = windowWidth < 900
  const currentMode = activeTab?.mode || 'suggest'

  const handleModeClick = (mode: string) => {
    if (!activeTab?.ptyId || activeTab?.isRunning) return
    window.api.pty.write(activeTab.ptyId, MODE_COMMANDS[mode])
    updateTab(activeTab.id, { mode: mode as any })
  }

  const truncateBranch = (branch: string) =>
    branch.length > 20 ? branch.slice(0, 18) + '...' : branch

  return (
    <div style={{
      height: 24, background: 'var(--bg-secondary)', display: 'flex',
      alignItems: 'center', padding: '0 12px', borderTop: '1px solid var(--border)',
      fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, gap: 12
    }}>
      {/* Connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
        {t('app.connected')}
      </div>

      {/* Git branch */}
      {!isCompact && activeTab?.gitBranch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={activeTab.gitBranch}>
          <span style={{ fontSize: 11 }}>⎇</span>
          {truncateBranch(activeTab.gitBranch)}
        </div>
      )}

      {/* Model */}
      {!isCompact && activeTab?.model && (
        <div>{activeTab.model}</div>
      )}

      {/* Thinking shimmer */}
      {activeTab?.isRunning && (
        <div className="shimmer-text" style={{
          background: 'linear-gradient(90deg, var(--text-muted) 25%, var(--accent) 50%, var(--text-muted) 75%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'shimmer 2s infinite linear',
        }}>
          Thinking...
        </div>
      )}

      {/* Sleep inhibitor */}
      {sleepInhibitorEnabled && sleepActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} title={t('statusbar.preventingSleep')}>
          ☕
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Mode switcher (F7) */}
      <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {MODES.map((mode) => (
          <div
            key={mode}
            onClick={() => handleModeClick(mode)}
            style={{
              padding: '0 8px', fontSize: 11, lineHeight: '18px', cursor: 'pointer',
              background: currentMode === mode ? 'var(--accent)' : 'transparent',
              color: currentMode === mode ? '#fff' : 'var(--text-muted)',
              transition: 'background 0.2s, color 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {MODE_LABELS[mode]}
          </div>
        ))}
      </div>

      {/* Balance */}
      <div>
        {t('app.balance')}: ¥{(balance / 100).toFixed(2)}
      </div>
    </div>
  )
}
