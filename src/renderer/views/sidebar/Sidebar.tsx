import { useState, useEffect } from 'react'
import { useTerminalStore } from '../../stores/terminal'
import { getRecentProjects } from '../../App'

interface SidebarProps {
  onSelectDirectory?: () => void
  onSettings?: () => void
  onOpenProject?: (cwd: string) => void
}

export function Sidebar({ onSelectDirectory, onSettings, onOpenProject }: SidebarProps) {
  const { tabs } = useTerminalStore()
  const [hoveredDir, setHoveredDir] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  // Merge open tab dirs + persisted recent projects, deduplicated
  const openDirs = tabs.map((t) => t.cwd)
  const recentDirs = getRecentProjects()
  const allDirs = [...new Set([...openDirs, ...recentDirs])]

  return (
    <aside
      style={{
        width: 260,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}
    >
      {/* Recent Projects */}
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8
          }}
        >
          Recent Projects
        </div>
        {allDirs.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
            No projects yet
          </div>
        )}
        {allDirs.map((dir) => {
          const isOpen = openDirs.includes(dir)
          const isHovered = hoveredDir === dir
          return (
            <div
              key={dir}
              onClick={() => onOpenProject?.(dir)}
              onMouseEnter={() => setHoveredDir(dir)}
              onMouseLeave={() => setHoveredDir(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isHovered ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {dir.replace(/^\/Users\/[^/]+/, '~')}
              </span>
              {isOpen && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Open Folder + Settings */}
      <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        {onSelectDirectory && (
          <div
            onClick={onSelectDirectory}
            onMouseEnter={() => setHoveredAction('open')}
            onMouseLeave={() => setHoveredAction(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              color: hoveredAction === 'open' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: hoveredAction === 'open' ? 'var(--bg-hover)' : 'transparent',
              marginBottom: 4,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            Open Folder
          </div>
        )}
        <div
          onClick={onSettings}
          onMouseEnter={() => setHoveredAction('settings')}
          onMouseLeave={() => setHoveredAction(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 8,
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
            color: hoveredAction === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: hoveredAction === 'settings' ? 'var(--bg-hover)' : 'transparent',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Settings
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-muted)'
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--success)'
          }}
        />
        Claude Code CLI
      </div>
    </aside>
  )
}
