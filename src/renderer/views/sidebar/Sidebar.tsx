import { useState, useEffect, useRef, useCallback } from 'react'
import { useTerminalStore } from '../../stores/terminal'
import { getRecentProjects, shortenPath } from '../../App'
import { useI18n } from '../../i18n'

const SESSION_HISTORY_KEY = 'inkess-session-history'
const MAX_HISTORY = 20

export interface SessionRecord {
  id: string
  name: string
  cwd: string
  createdAt: number
  closedAt?: number
  status: 'active' | 'closed'
}

export function Sidebar({ onSettings, onOpenProject }: {
  onSettings?: () => void
  onOpenProject?: (cwd: string) => void
}) {
  const { tabs } = useTerminalStore()
  const [hoveredDir, setHoveredDir] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const activeSessions: SessionRecord[] = tabs.map(tab => ({
    id: tab.id, name: tab.title, cwd: tab.cwd,
    createdAt: Date.now(), status: 'active' as const,
  }))

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
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return t('sidebar.yesterday')
  }

  return (
    <aside style={{
      width: 200, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      <div style={{ padding: '12px 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          {t('sidebar.sessions')} ({tabs.length})
        </div>

        {activeSessions.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('sidebar.active')}
            </div>
            {activeSessions.map(s => (
              <SessionItem key={s.id} session={s} isHovered={hoveredDir === s.id} isEditing={editingId === s.id}
                editValue={editValue} editRef={editRef}
                onHover={(h) => setHoveredDir(h ? s.id : null)}
                onClick={() => useTerminalStore.getState().setActiveTab(s.id)}
                onDoubleClick={() => handleRename(s)}
                onEditChange={setEditValue} onEditCommit={commitRename} onEditCancel={() => setEditingId(null)}
              />
            ))}
          </>
        )}

        {closedSessions.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '8px 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('sidebar.recent')}
            </div>
            {closedSessions.map(s => (
              <SessionItem key={s.id} session={s} isHovered={hoveredDir === s.id} isEditing={editingId === s.id}
                editValue={editValue} editRef={editRef} timeAgo={s.closedAt ? formatTimeAgo(s.closedAt) : undefined}
                onHover={(h) => setHoveredDir(h ? s.id : null)}
                onClick={() => onOpenProject?.(s.cwd)}
                onDoubleClick={() => handleRename(s)}
                onEditChange={setEditValue} onEditCommit={commitRename} onEditCancel={() => setEditingId(null)}
              />
            ))}
          </>
        )}

        {activeSessions.length === 0 && closedSessions.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>{t('sidebar.noProjects')}</div>
        )}
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <div onClick={onSettings} onMouseEnter={() => setHoveredAction('settings')} onMouseLeave={() => setHoveredAction(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            color: hoveredAction === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: hoveredAction === 'settings' ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.12s, color 0.12s',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          {t('sidebar.settings')}
        </div>
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
        {t('sidebar.cliStatus')}
      </div>
    </aside>
  )
}

function SessionItem({ session, isHovered, isEditing, editValue, editRef, timeAgo, onHover, onClick, onDoubleClick, onEditChange, onEditCommit, onEditCancel }: {
  session: SessionRecord; isHovered: boolean; isEditing: boolean; editValue: string
  editRef: React.RefObject<HTMLInputElement | null>; timeAgo?: string
  onHover: (h: boolean) => void; onClick: () => void; onDoubleClick: () => void
  onEditChange: (v: string) => void; onEditCommit: () => void; onEditCancel: () => void
}) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    clickTimer.current = setTimeout(() => { clickTimer.current = null; onClick() }, 250)
  }, [onClick])

  const handleDoubleClick = useCallback(() => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    onDoubleClick()
  }, [onDoubleClick])

  useEffect(() => { return () => { if (clickTimer.current) clearTimeout(clickTimer.current) } }, [])

  return (
    <div onClick={handleClick} onDoubleClick={handleDoubleClick}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 6, cursor: 'pointer', fontSize: 13,
        color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isHovered ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.12s, color 0.12s',
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
      {isEditing ? (
        <input ref={editRef} value={editValue} onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEditCommit(); if (e.key === 'Escape') onEditCancel() }}
          onBlur={onEditCommit} onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 4px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }}
        />
      ) : (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {shortenPath(session.cwd)}
        </span>
      )}
      {session.status === 'active' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />}
      {timeAgo && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo}</span>}
    </div>
  )
}

function loadSessionHistory(): SessionRecord[] {
  try { const raw = localStorage.getItem(SESSION_HISTORY_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}

function saveSessionHistory(records: SessionRecord[]) {
  try { localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY))) } catch { /* ignore */ }
}
