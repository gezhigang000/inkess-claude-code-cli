import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

// Global error reporting to main process log
window.onerror = (_msg, _src, _line, _col, err) => {
  window.api?.log?.error(err?.message || String(_msg), err?.stack)
}
window.onunhandledrejection = (event) => {
  const reason = event.reason
  window.api?.log?.error(
    reason?.message || String(reason),
    reason?.stack
  )
}

// Intercept console.error/warn → forward to main process for server reporting
const _origError = console.error
const _origWarn = console.warn
console.error = (...args: unknown[]) => {
  _origError.apply(console, args)
  const msg = args.map(a => a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  const stack = args.find(a => a instanceof Error)?.stack
  window.api?.log?.error(msg, stack)
}
console.warn = (...args: unknown[]) => {
  _origWarn.apply(console, args)
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  window.api?.log?.warn(msg)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
