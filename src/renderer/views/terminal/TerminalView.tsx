import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore, resolveTheme } from '../../stores/settings'

interface TerminalViewProps {
  ptyId: string | null
  isActive: boolean
}

const DARK_THEME = {
  background: '#191919',
  foreground: '#F0EDE8',
  cursor: '#C9A87C',
  cursorAccent: '#191919',
  selectionBackground: 'rgba(201, 168, 124, 0.3)',
  black: '#191919',
  red: '#FC8181',
  green: '#68D391',
  yellow: '#ECC94B',
  blue: '#7AA2F7',
  magenta: '#BB9AF7',
  cyan: '#7DCFFF',
  white: '#F0EDE8',
  brightBlack: '#6B6B6B',
  brightRed: '#FC8181',
  brightGreen: '#68D391',
  brightYellow: '#ECC94B',
  brightBlue: '#7AA2F7',
  brightMagenta: '#BB9AF7',
  brightCyan: '#7DCFFF',
  brightWhite: '#FFFFFF'
}

const LIGHT_THEME = {
  background: '#FAFAF8',
  foreground: '#1A1A1A',
  cursor: '#7A6244',
  cursorAccent: '#FAFAF8',
  selectionBackground: 'rgba(122, 98, 68, 0.2)',
  black: '#1A1A1A',
  red: '#C53030',
  green: '#2E8B57',
  yellow: '#B8860B',
  blue: '#2563EB',
  magenta: '#7C3AED',
  cyan: '#0891B2',
  white: '#F0EDE8',
  brightBlack: '#999999',
  brightRed: '#E53E3E',
  brightGreen: '#38A169',
  brightYellow: '#D69E2E',
  brightBlue: '#3B82F6',
  brightMagenta: '#8B5CF6',
  brightCyan: '#06B6D4',
  brightWhite: '#FFFFFF'
}

function getTerminalTheme(): typeof DARK_THEME {
  return resolveTheme(useSettingsStore.getState().theme) === 'light' ? LIGHT_THEME : DARK_THEME
}

function safeFit(container: HTMLDivElement | null, fitAddon: FitAddon | null) {
  if (!fitAddon || !container) return
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return
  try {
    fitAddon.fit()
  } catch {
    // Ignore fit errors
  }
}

export function TerminalView({ ptyId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
      fontSize: useSettingsStore.getState().fontSize,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Defer initial fit to next frame so container has dimensions
    requestAnimationFrame(() => {
      safeFit(containerRef.current, fitAddon)
    })

    // Resize observer
    const container = containerRef.current
    const resizeObserver = new ResizeObserver(() => {
      safeFit(container, fitAddon)
      if (ptyId) {
        window.api.pty.resize(ptyId, term.cols, term.rows)
      }
    })
    resizeObserver.observe(container)

    // Copy: Ctrl+C (Win/Linux) or Cmd+C (Mac) when text is selected
    // Paste: Ctrl+V (Win/Linux) or Cmd+V (Mac)
    term.attachCustomKeyEventHandler((event) => {
      const modifier = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey
      if (!modifier) return true

      if (event.type === 'keydown' && event.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }

      if (event.type === 'keydown' && event.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (ptyId && text) window.api.pty.write(ptyId, text)
        })
        return false
      }

      return true
    })

    // PTY data → terminal
    const removeDataListener = window.api.pty.onData(({ id, data }) => {
      if (id === ptyId) {
        term.write(data)
      }
    })

    // Terminal input → PTY
    const disposable = term.onData((data) => {
      if (ptyId) {
        window.api.pty.write(ptyId, data)
      }
    })

    return () => {
      disposable.dispose()
      try { removeDataListener?.() } catch { /* ignore */ }
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [ptyId])

  // React to theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTerminalTheme()
    }
  }, [theme])

  // React to fontSize changes from settings
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      safeFit(containerRef.current, fitAddonRef.current)
    }
  }, [fontSize])

  // Focus terminal when tab becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus()
      safeFit(containerRef.current, fitAddonRef.current)
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: isActive ? 'block' : 'none',
        overflow: 'hidden'
      }}
    />
  )
}
