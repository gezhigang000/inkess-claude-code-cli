import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

interface TerminalViewProps {
  ptyId: string | null
  isActive: boolean
}

export function TerminalView({ ptyId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#1A1A2E',
        foreground: '#F0EDE8',
        cursor: '#8B7355',
        cursorAccent: '#1A1A2E',
        selectionBackground: 'rgba(139, 115, 85, 0.3)',
        black: '#1A1A2E',
        red: '#FC8181',
        green: '#68D391',
        yellow: '#ECC94B',
        blue: '#7AA2F7',
        magenta: '#BB9AF7',
        cyan: '#7DCFFF',
        white: '#F0EDE8',
        brightBlack: '#6A6A80',
        brightRed: '#FC8181',
        brightGreen: '#68D391',
        brightYellow: '#ECC94B',
        brightBlue: '#7AA2F7',
        brightMagenta: '#BB9AF7',
        brightCyan: '#7DCFFF',
        brightWhite: '#FFFFFF'
      },
      fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)

    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch {
      // WebGL not available, fallback to canvas
    }

    fitAddon.fit()
    termRef.current = term
    fitAddonRef.current = fitAddon

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (ptyId) {
        window.api.pty.resize(ptyId, term.cols, term.rows)
      }
    })
    resizeObserver.observe(containerRef.current)

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
      removeDataListener()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [ptyId])

  // Focus terminal when tab becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus()
      fitAddonRef.current?.fit()
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: isActive ? 'block' : 'none',
        overflow: 'hidden'
      }}
    />
  )
}
