import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '../../stores/settings'
import { getTerminalTheme } from './terminal-theme'
import { useI18n } from '../../i18n'

function safeFit(container: HTMLDivElement | null, fitAddon: FitAddon | null) {
  if (!fitAddon || !container) return
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return
  try {
    fitAddon.fit()
  } catch {
    // Ignore fit errors
  }
}

interface PendingImage {
  path: string
  name: string
  size: string
}

export function TerminalView({ ptyId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const theme = useSettingsStore((s) => s.theme)
  const { t } = useI18n()
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  const confirmImage = useCallback(() => {
    if (!pendingImage || !ptyId) return
    const normalized = pendingImage.path.replace(/\\/g, '/')
    const quoted = normalized.includes(' ') ? `"${normalized}"` : normalized
    window.api.pty.write(ptyId, quoted)
    setPendingImage(null)
    termRef.current?.focus()
  }, [pendingImage, ptyId])

  const cancelImage = useCallback(() => {
    setPendingImage(null)
    termRef.current?.focus()
  }, [])

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
      const modifier = window.api?.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (!modifier) return true

      if (event.type === 'keydown' && event.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }

      if (event.type === 'keydown' && event.key === 'v') {
        // Check for image in clipboard first
        navigator.clipboard.read().then(async (items) => {
          for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'))
            if (imageType) {
              const blob = await item.getType(imageType)
              const buffer = await blob.arrayBuffer()
              const path = await window.api.clipboard.saveImage(buffer)
              const sizeKB = (buffer.byteLength / 1024).toFixed(0)
              const name = path.split('/').pop() || 'image.png'
              setPendingImage({ path, name, size: `${sizeKB} KB` })
              return
            }
          }
          // No image — fall back to text paste
          const text = await navigator.clipboard.readText()
          if (ptyId && text) window.api.pty.write(ptyId, text)
        }).catch(() => {
          // Fallback if clipboard.read() not supported
          navigator.clipboard.readText().then(text => {
            if (ptyId && text) window.api.pty.write(ptyId, text)
          })
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

  // Handle Enter/Escape for image confirm bar
  useEffect(() => {
    if (!pendingImage) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmImage() }
      if (e.key === 'Escape') { e.preventDefault(); cancelImage() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pendingImage, confirmImage, cancelImage])

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      display: isActive ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden',
    }}>
      {pendingImage && (
        <div style={{
          padding: '8px 16px', background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          animation: 'slideDown 0.15s ease-out',
        }}>
          <span style={{ fontSize: 16 }}>🖼</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{pendingImage.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pendingImage.size} · PNG</div>
          </div>
          <div
            onClick={confirmImage}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff',
            }}
          >
            {t('terminal.sendImage')}
          </div>
          <div
            onClick={cancelImage}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-active)', color: 'var(--text-secondary)',
            }}
          >
            {t('terminal.cancelImage')}
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}
