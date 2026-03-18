import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    window.api?.log.error(error.message, error.stack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: 32,
          background: 'var(--bg-primary)', color: 'var(--text-primary)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 500, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#fff', cursor: 'pointer',
              fontSize: 14, fontWeight: 500
            }}
          >
            Reload App
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
