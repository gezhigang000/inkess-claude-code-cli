import { useAppStore } from '../../stores/app'

export function SetupScreen() {
  const { phase, installSteps, installError } = useAppStore()

  const handleRetry = async () => {
    useAppStore.getState().setPhase('installing')
    useAppStore.getState().setInstallError(null)
    startInstall()
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}
    >
      <div style={{ width: 420, textAlign: 'center' }}>
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 24px',
            borderRadius: 16,
            background: 'var(--accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg
            width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="var(--accent)" strokeWidth="1.5"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 8,
            color: 'var(--text-primary)'
          }}
        >
          {phase === 'checking' ? 'Checking environment...' : 'Setting up Claude Code'}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            marginBottom: 32
          }}
        >
          {phase === 'checking'
            ? 'Verifying Claude Code CLI installation'
            : 'First-time setup — this only takes a moment'}
        </p>

        {/* Steps */}
        {installSteps.length > 0 && (
          <div style={{ textAlign: 'left' }}>
            {installSteps.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderTop: i > 0 ? '1px solid rgba(58, 58, 85, 0.5)' : 'none',
                  fontSize: 13
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background:
                      step.status === 'done'
                        ? 'rgba(56, 161, 105, 0.2)'
                        : step.status === 'active'
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-tertiary)',
                    color:
                      step.status === 'done'
                        ? 'var(--success-text)'
                        : step.status === 'active'
                          ? 'var(--accent)'
                          : 'var(--text-muted)'
                  }}
                >
                  {step.status === 'done' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : step.status === 'active' ? (
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      style={{ animation: 'spin 1s linear infinite' }}
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="1" />
                    </svg>
                  )}
                </div>
                <span
                  style={{
                    color:
                      step.status === 'done'
                        ? 'var(--text-secondary)'
                        : step.status === 'active'
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                    fontWeight: step.status === 'active' ? 500 : 400
                  }}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {phase === 'installing' && (
          <div
            style={{
              width: '100%',
              height: 4,
              background: 'var(--bg-tertiary)',
              borderRadius: 2,
              marginTop: 24,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'var(--accent)',
                borderRadius: 2,
                width: '60%',
                animation: 'progress-move 2s ease-in-out infinite'
              }}
            />
          </div>
        )}

        {/* Error */}
        {installError && (
          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--error-text)', marginBottom: 12 }}>
              {installError}
            </p>
            <button
              onClick={handleRetry}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes progress-move { 0% { width: 40%; } 50% { width: 70%; } 100% { width: 40%; } }
      `}</style>
    </div>
  )
}

/** Start the CLI install flow. Call from App after detecting CLI is not installed. */
export async function startInstall(): Promise<boolean> {
  const { setInstallSteps, setPhase, setCliInfo, setInstallError } = useAppStore.getState()

  setPhase('installing')
  setInstallSteps([
    { label: 'Checking environment', status: 'done' },
    { label: 'Downloading Claude Code CLI...', status: 'active' },
    { label: 'Verifying installation', status: 'pending' }
  ])

  // Listen for progress
  const removeListener = window.api.cli.onInstallProgress(({ step }) => {
    if (step.includes('Verifying')) {
      setInstallSteps([
        { label: 'Checking environment', status: 'done' },
        { label: 'Download complete', status: 'done' },
        { label: 'Verifying installation...', status: 'active' }
      ])
    }
  })

  const result = await window.api.cli.install()
  removeListener()

  if (result.success) {
    setInstallSteps([
      { label: 'Checking environment', status: 'done' },
      { label: 'Download complete', status: 'done' },
      { label: 'Installation complete', status: 'done' }
    ])

    const info = await window.api.cli.getInfo()
    setCliInfo(info.installed, info.version)
    setPhase('ready')
    return true
  } else {
    setInstallError(result.error || 'Unknown error')
    setPhase('error')
    return false
  }
}
