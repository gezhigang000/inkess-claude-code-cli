import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTerminalStore } from '../../stores/terminal'
import { getRecentProjects, shortenPath } from '../../App'
import { useI18n } from '../../i18n'

const SESSION_HISTORY_KEY = 'inkess-session-history'
const MAX_HISTORY = 20
const SIDEBAR_COLLAPSED_KEY = 'inkess-sidebar-collapsed'

export interface SessionRecord {
  id: string
  name: string
  cwd: string
  createdAt: number
  closedAt?: number
  status: 'active' | 'closed'
}

export function Sidebar({ onSettings, onOpenProject, onNewSession, onCommandPalette }: {
  onSettings?: () => void
  onOpenProject?: (cwd: string) => void
  onNewSession?: () => void
  onCommandPalette?: () => void
}) {
  const { tabs } = useTerminalStore()
  const [hoveredDir, setHoveredDir] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const editRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const activeSessions: SessionRecord[] = useMemo(() => tabs.map(tab => ({
    id: tab.id, name: tab.title, cwd: tab.cwd,
    createdAt: Date.now(), status: 'active' as const,
  })), [tabs])

  const [closedSessions, setClosedSessions] = useState<SessionRecord[]>(
    () => loadSessionHistory()
  )

  // Sync recent projects into closed sessions
  useEffect(() => {
    const history = loadSessionHistory()
    const activeCwds = new Set(tabs.map(t => t.cwd))
    const recentDirs = getRecentProjects()
    const newClosed: SessionRecord[] = []
    recentDirs.forEach(dir => {
      if (!activeCwds.has(dir) && !history.find(h => h.cwd === dir)) {
        newClosed.push({
          id: crypto.randomUUID(), name: dir.split('/').pop() || 'terminal',
          cwd: dir, createdAt: Date.now(), closedAt: Date.now(), status: 'closed',
        })
      }
    })
    if (newClosed.length > 0) {
      const updated = [...newClosed, ...history].slice(0, MAX_HISTORY)
      saveSessionHistory(updated)
      setClosedSessions(updated)
    }
  }, [tabs.length])

  useEffect(() => { editRef.current?.focus() }, [editingId])

  const handleRename = (session: SessionRecord) => {
    setEditingId(session.id)
    setEditValue(session.name)
  }

  const handleDeleteSessionsByCwd = (cwd: string) => {
    const updated = closedSessions.filter(s => s.cwd !== cwd)
    setClosedSessions(updated)
    saveSessionHistory(updated)
  }

  const commitRename = () => {
    if (!editingId || !editValue.trim()) { setEditingId(null); return }
    const tab = tabs.find(t => t.id === editingId)
    if (tab) {
      useTerminalStore.getState().updateTab(tab.id, { title: editValue.trim() })
    } else {
      const updated = closedSessions.map(s => s.id === editingId ? { ...s, name: editValue.trim() } : s)
      setClosedSessions(updated)
      saveSessionHistory(updated)
    }
    setEditingId(null)
  }

  const formatTimeAgo = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return t('sidebar.justNow')
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return t('sidebar.yesterday')
  }

  // Group all sessions by project directory (cwd)
  const allSessions = useMemo(() => {
    return [...activeSessions, ...closedSessions]
  }, [activeSessions, closedSessions])

  const projectGroups = useMemo(() => {
    const groups: Record<string, SessionRecord[]> = {}
    allSessions.forEach(s => {
      const key = s.cwd
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })
    return groups
  }, [allSessions])

  const topActionBtnStyle = (key: string) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    color: hoveredAction === key ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: hoveredAction === key ? 'var(--bg-hover)' : 'transparent',
    transition: 'background 0.12s, color 0.12s',
    fontWeight: 500 as const,
  })

  // Collapsed sidebar: thin strip with toggle + icons
  if (collapsed) {
    return (
      <aside style={{
        width: 44, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, padding: '10px 0',
      }}>
        {/* Expand button */}
        <div
          onClick={toggleCollapsed}
          onMouseEnter={() => setHoveredAction('expand')}
          onMouseLeave={() => setHoveredAction(null)}
          title={t('sidebar.expand')}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 8,
            background: hoveredAction === 'expand' ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
        {/* New session */}
        <div
          onClick={onNewSession}
          onMouseEnter={() => setHoveredAction('new')}
          onMouseLeave={() => setHoveredAction(null)}
          title={t('sidebar.newSession')}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 4,
            background: hoveredAction === 'new' ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        {/* Command palette */}
        <div
          onClick={onCommandPalette}
          onMouseEnter={() => setHoveredAction('cmd')}
          onMouseLeave={() => setHoveredAction(null)}
          title={t('sidebar.commands') + ' ⌘K'}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 4,
            background: hoveredAction === 'cmd' ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div style={{ flex: 1 }} />
        {/* Settings */}
        <div
          onClick={onSettings}
          onMouseEnter={() => setHoveredAction('settings')}
          onMouseLeave={() => setHoveredAction(null)}
          title={t('sidebar.settings')}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
            background: hoveredAction === 'settings' ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 200, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      {/* Top action buttons */}
      <div style={{ padding: '10px 10px 4px' }}>
        {/* Collapse button */}
        <div
          onClick={toggleCollapsed}
          onMouseEnter={() => setHoveredAction('collapse')}
          onMouseLeave={() => setHoveredAction(null)}
          style={{
            ...topActionBtnStyle('collapse'),
            marginBottom: 4, justifyContent: 'flex-end', padding: '4px 10px',
          }}
          title={t('sidebar.collapse')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
        <div
          onClick={onNewSession}
          onMouseEnter={() => setHoveredAction('new')}
          onMouseLeave={() => setHoveredAction(null)}
          style={topActionBtnStyle('new')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {t('sidebar.newSession')}
        </div>
        <div
          onClick={onCommandPalette}
          onMouseEnter={() => setHoveredAction('cmd')}
          onMouseLeave={() => setHoveredAction(null)}
          style={topActionBtnStyle('cmd')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          {t('sidebar.commands')}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>⌘K</span>
        </div>
      </div>

      {/* Projects list */}
      <div style={{ padding: '4px 10px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, padding: '4px 2px' }}>
          {t('sidebar.projects')}
        </div>

        {Object.entries(projectGroups).map(([cwd, sessions]) => {
          const hasActive = sessions.some(s => s.status === 'active')
          const primarySession = sessions.find(s => s.status === 'active') || sessions[0]
          const displayName = primarySession.name || cwd.replace(/\\/g, '/').split('/').pop() || 'terminal'

          return (
            <div key={cwd} style={{ marginBottom: 2 }}>
              <div
                onClick={() => {
                  if (hasActive) {
                    const activeSession = sessions.find(s => s.status === 'active')
                    if (activeSession) useTerminalStore.getState().setActiveTab(activeSession.id)
                  } else {
                    onOpenProject?.(cwd)
                  }
                }}
                onMouseEnter={() => setHoveredDir(cwd)}
                onMouseLeave={() => setHoveredDir(null)}
                onDoubleClick={() => handleRename(primarySession)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  color: hoveredDir === cwd ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: hoveredDir === cwd ? 'var(--bg-hover)' : 'transparent',
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                {editingId === primarySession.id ? (
                  <input ref={editRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                    onBlur={commitRename} onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 4px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }}
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {displayName}
                  </span>
                )}
                {hasActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />}
                {!hasActive && hoveredDir === cwd && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDeleteSessionsByCwd(cwd) }}
                    title={t('sidebar.deleteSession')}
                    style={{
                      width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, fontSize: 13, color: 'var(--text-muted)', flexShrink: 0,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--error-text)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >×</span>
                )}
                {!hasActive && hoveredDir !== cwd && primarySession.closedAt && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{formatTimeAgo(primarySession.closedAt)}</span>
                )}
              </div>
            </div>
          )
        })}

        {Object.keys(projectGroups).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 2px' }}>{t('sidebar.noProjects')}</div>
        )}
      </div>

      {/* Settings */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
        <div onClick={onSettings} onMouseEnter={() => setHoveredAction('settings')} onMouseLeave={() => setHoveredAction(null)}
          style={topActionBtnStyle('settings')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          {t('sidebar.settings')}
        </div>
      </div>
    </aside>
  )
}

function loadSessionHistory(): SessionRecord[] {
  try { const raw = localStorage.getItem(SESSION_HISTORY_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}

function saveSessionHistory(records: SessionRecord[]) {
  try { localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY))) } catch { /* ignore */ }
}
