import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { useSettingsStore } from '../../stores/settings'

interface TerminalViewProps {
  ptyId: string | null
  isActive: boolean
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

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#191919',
        foreground: '#F0EDE8',
        cursor: '#8B7355',
        cursorAccent: '#191919',
        selectionBackground: 'rgba(139, 115, 85, 0.3)',
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
      },
      fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
      fontSize: useSettingsStore.getState().fontSize,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const clipboardAddon = new ClipboardAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(clipboardAddon)

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
