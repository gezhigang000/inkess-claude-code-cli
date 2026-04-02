import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { useSettingsStore } from '../../stores/settings'
import { getTerminalTheme } from '../terminal/terminal-theme'
import { useI18n } from '../../i18n'

interface SessionMeta {
  id: string
  ptyId: string
  cwd: string
  title: string
  createdAt: number
  closedAt?: number
  size: number
}

interface SessionHistoryViewProps {
  onBack: () => void
  onOpenInTerminal: (cwd: string) => void
  initialSessionId?: string
}

function safeFit(container: HTMLDivElement | null, fitAddon: FitAddon | null) {
  if (!fitAddon || !container) return
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return
  try {
    fitAddon.fit()
  } catch {
    // ignore
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(start: number, end?: number): string {
  if (!end) return ''
  const secs = Math.round((end - start) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remaining = secs % 60
  return remaining > 0 ? `${mins}m ${remaining}s` : `${mins}m`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function getDateLabel(ts: number, todayLabel: string, yesterdayLabel: string): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (sessionDay.getTime() === today.getTime()) return todayLabel
  if (sessionDay.getTime() === yesterday.getTime()) return yesterdayLabel
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDate(
  sessions: SessionMeta[],
  todayLabel: string,
  yesterdayLabel: string
): { label: string; items: SessionMeta[] }[] {
  const groups: Map<string, SessionMeta[]> = new Map()
  for (const s of sessions) {
    const label = getDateLabel(s.createdAt, todayLabel, yesterdayLabel)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(s)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

export function SessionHistoryView({ onBack, onOpenInTerminal, initialSessionId }: SessionHistoryViewProps) {
  const { t } = useI18n()
  const theme = useSettingsStore((s) => s.theme)
  const fontSize = useSettingsStore((s) => s.fontSize)

  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Map<string, number> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSessionId ?? null)
  const [loading, setLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const termContainerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load sessions on mount
  useEffect(() => {
    window.api.session.list().then(setSessions).catch(() => {})
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await window.api.session.search(searchQuery)
        const map = new Map<string, number>()
        for (const r of results) map.set(r.id, r.matches)
        setSearchResults(map)
      } catch {
        setSearchResults(new Map())
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  // Init terminal once
  useEffect(() => {
    if (!termContainerRef.current) return

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
      fontSize: useSettingsStore.getState().fontSize,
      lineHeight: 1.5,
      cursorBlink: false,
      cursorStyle: 'block',
      disableStdin: true,
      allowProposedApi: true,
      scrollback: 10000
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.open(termContainerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    requestAnimationFrame(() => safeFit(termContainerRef.current, fitAddon))

    const container = termContainerRef.current
    const ro = new ResizeObserver(() => safeFit(container, fitAddon))
    ro.observe(container)

    // Copy support (read-only terminal, only copy)
    term.attachCustomKeyEventHandler((event) => {
      const modifier = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey
      if (!modifier) return true
      if (event.type === 'keydown' && event.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }
      return true
    })

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
  }, [])

  // React to theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTerminalTheme()
    }
  }, [theme])

  // React to fontSize changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      safeFit(termContainerRef.current, fitAddonRef.current)
    }
  }, [fontSize])

  // Load session when selected
  useEffect(() => {
    if (!selectedId || !termRef.current) return

    const term = termRef.current
    setLoading(true)
    term.clear()
    term.reset()

    window.api.session.read(selectedId)
      .then((chunks) => {
        for (const chunk of chunks) {
          if (chunk.s === 'input') continue
          term.write(chunk.d)
        }
        requestAnimationFrame(() => safeFit(termContainerRef.current, fitAddonRef.current))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedId])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.session.delete(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch {
      // ignore
    }
  }, [selectedId])

  const handleCopyAll = useCallback(() => {
    if (!termRef.current) return
    termRef.current.selectAll()
    const text = termRef.current.getSelection()
    navigator.clipboard.writeText(text)
    termRef.current.clearSelection()
  }, [])

  const selectedSession = sessions.find((s) => s.id === selectedId)

  // Filter sessions based on search
  const displayedSessions = searchResults
    ? sessions.filter((s) => searchResults.has(s.id))
    : sessions

  const groups = groupByDate(
    displayedSessions,
    t('history.today'),
    t('history.yesterday')
  )

  const resolvedTheme = resolveTheme(theme)
  const isDark = resolvedTheme === 'dark'

  const accentColor = 'var(--accent)'

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: '"Inter", system-ui, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Left Panel */}
      <div style={{
        width: 260,
        minWidth: 260,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden'
      }}>
        {/* Back button / Header */}
        <div
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
            userSelect: 'none'
          }}
        >
          {/* Chevron left */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('history.title')}
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none'
            }}>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('history.search')}
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayedSessions.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, opacity: 0.45 }}>
              {searchQuery ? t('history.noResults') : t('history.noSessions')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div style={{
                  padding: '8px 14px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  opacity: 0.45,
                  color: 'var(--text-primary)'
                }}>
                  {group.label}
                </div>
                {group.items.map((session) => {
                  const isSelected = session.id === selectedId
                  const isHovered = session.id === hoveredId
                  const matchCount = searchResults?.get(session.id)
                  return (
                    <div
                      key={session.id}
                      onClick={() => setSelectedId(session.id)}
                      onMouseEnter={() => setHoveredId(session.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        position: 'relative',
                        padding: '8px 12px 8px 16px',
                        cursor: 'pointer',
                        background: isSelected
                          ? isDark ? 'rgba(201,168,124,0.1)' : 'rgba(122,98,68,0.08)'
                          : isHovered
                            ? isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
                            : 'transparent',
                        borderLeft: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                        transition: 'background 0.1s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {/* Folder icon */}
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                          <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.29l1.42 1.42H12.5C13.33 4.42 14 5.09 14 5.92V11.5C14 12.33 13.33 13 12.5 13h-9C2.67 13 2 12.33 2 11.5V4.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                        </svg>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1
                        }}>
                          {session.title || session.cwd.split('/').pop() || session.id}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 19 }}>
                        <span style={{ fontSize: 10, opacity: 0.4 }}>{formatTime(session.createdAt)}</span>
                        {session.closedAt ? (
                          <span style={{ fontSize: 10, opacity: 0.4 }}>{formatDuration(session.createdAt, session.closedAt)}</span>
                        ) : null}
                        <span style={{ fontSize: 10, opacity: 0.35 }}>{formatSize(session.size)}</span>
                        {matchCount !== undefined && (
                          <span style={{
                            fontSize: 10,
                            background: isDark ? 'rgba(201,168,124,0.25)' : 'rgba(122,98,68,0.18)',
                            color: accentColor,
                            borderRadius: 3,
                            padding: '1px 5px',
                            fontWeight: 600
                          }}>
                            {matchCount}
                          </span>
                        )}
                      </div>
                      {/* Delete button */}
                      {(isHovered || isSelected) && (
                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          title={t('history.delete')}
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            opacity: 0.4,
                            padding: 3,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            lineHeight: 1
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.4' }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {selectedSession ? (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedSession.title || selectedSession.cwd.split('/').pop() || selectedSession.id}
                </div>
                <div style={{ fontSize: 11, opacity: 0.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedSession.cwd}
                </div>
              </div>
              <button
                onClick={handleCopyAll}
                style={{
                  padding: '5px 10px',
                  background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('history.copyAll')}
              </button>
              <button
                onClick={() => onOpenInTerminal(selectedSession.cwd)}
                style={{
                  padding: '5px 10px',
                  background: accentColor,
                  border: 'none',
                  borderRadius: 6,
                  color: isDark ? '#191919' : '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('history.openInTerminal')}
              </button>
            </div>

            {/* Terminal area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {loading && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-primary)', zIndex: 10
                }}>
                  <div style={{
                    width: 24, height: 24, border: `2px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                    borderTopColor: accentColor, borderRadius: '50%',
                    animation: 'spin 0.75s linear infinite'
                  }}/>
                </div>
              )}
              <div
                ref={termContainerRef}
                style={{ position: 'absolute', inset: 0 }}
              />
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, opacity: 0.35, color: 'var(--text-primary)'
          }}>
            {sessions.length > 0 ? t('history.selectSession') : t('history.noSessions')}
          </div>
        )}
      </div>
    </div>
  )
}
