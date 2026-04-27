import { useState, useCallback, useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { useSettingsStore } from '../../stores/settings'

const DEFAULT_SERVER_URL = 'https://llm.inkess.cc'

function getServerBase(): string {
  return useSettingsStore.getState().serverUrl || DEFAULT_SERVER_URL
}

interface LoginScreenProps {
  onLoginSuccess: () => void
}

type Tab = 'login' | 'register'

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { t } = useI18n()
  const serverUrl = useSettingsStore(s => s.serverUrl)
  const setServerUrl = useSettingsStore(s => s.setServerUrl)
  const [serverEditing, setServerEditing] = useState(false)
  const [serverDraft, setServerDraft] = useState(serverUrl || DEFAULT_SERVER_URL)
  const [serverError, setServerError] = useState<string | null>(null)
  const effectiveServerUrl = serverUrl || DEFAULT_SERVER_URL

  const commitServerUrl = () => {
    const trimmed = serverDraft.trim()
    if (trimmed && trimmed !== DEFAULT_SERVER_URL && !/^https?:\/\/[^\s]+$/.test(trimmed)) {
      setServerError(t('login.serverInvalid'))
      return
    }
    setServerError(null)
    setServerUrl(trimmed === DEFAULT_SERVER_URL ? '' : trimmed)
    setServerEditing(false)
  }

  const resetServerUrl = () => {
    setServerError(null)
    setServerDraft(DEFAULT_SERVER_URL)
    setServerUrl('')
    setServerEditing(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', overflowY: 'auto' }}>
      <div style={{ width: 380, margin: '32px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{t('login.title')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {tab === 'login' ? t('login.signInSubtitle') : t('login.registerSubtitle')}
          </p>
        </div>

        {/* Server URL — collapsible */}
        <div style={{ textAlign: 'left', marginBottom: 16 }}>
          {!serverEditing ? (
            <div
              style={{
                fontSize: 12, color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '6px 2px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t('login.serverLabel')}: {effectiveServerUrl}
              </span>
              <button
                type="button"
                onClick={() => {
                  setServerDraft(serverUrl || DEFAULT_SERVER_URL)
                  setServerEditing(true)
                  setServerError(null)
                }}
                style={{
                  fontSize: 12, color: 'var(--accent)', background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                }}
              >
                {t('login.serverEdit')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('login.serverLabel')}
              </label>
              <FocusInput
                value={serverDraft}
                onChange={e => setServerDraft(e.target.value)}
                placeholder={DEFAULT_SERVER_URL}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitServerUrl()
                  else if (e.key === 'Escape') {
                    setServerEditing(false)
                    setServerError(null)
                  }
                }}
                style={{ fontSize: 13 }}
              />
              {serverError && (
                <div style={{ fontSize: 12, color: 'var(--error-text)' }}>{serverError}</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={resetServerUrl}
                  style={{
                    fontSize: 12, color: 'var(--text-muted)', background: 'transparent',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  {t('login.serverReset')}
                </button>
                <button
                  type="button"
                  onClick={commitServerUrl}
                  style={{
                    fontSize: 12, color: 'var(--accent)', background: 'transparent',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, background: 'var(--bg-tertiary)', padding: 3 }}>
          {(['login', 'register'] as Tab[]).map(tb => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setError(null); setErrorCode(null); setSuccess(null) }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: tab === tb ? 'var(--bg-primary)' : 'transparent',
                color: tab === tb ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === tb ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                border: tab === tb ? '1px solid var(--border)' : '1px solid transparent'
              }}
            >
              {tb === 'login' ? t('login.signIn') : t('login.register')}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--error-text)', marginBottom: 12, textAlign: 'center' }}>
            {error}
            {errorCode === 'desktop_token_disabled' && (
              <div style={{ marginTop: 8 }}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.api.shell.openExternal(`${getServerBase()}/zh/console/tokens`) }}
                  style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
                >
                  Go to Console → Tokens
                </a>
              </div>
            )}
          </div>
        )}
        {success && <div style={{ fontSize: 13, color: 'var(--success)', marginBottom: 12, textAlign: 'center' }}>{success}</div>}

        {tab === 'login' ? (
          <LoginForm onSuccess={onLoginSuccess} onError={setError} onErrorCode={setErrorCode} />
        ) : (
          <RegisterForm onSuccess={onLoginSuccess} onError={setError} onMessage={setSuccess} />
        )}
      </div>
    </div>
  )
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6
}

/** Input with visible focus ring */
function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inputBaseStyle, ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; props.onBlur?.(e) }}
    />
  )
}

function LoginForm({ onSuccess, onError, onErrorCode }: { onSuccess: () => void; onError: (e: string) => void; onErrorCode?: (code: string | null) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const disabled = loading || !login || !password
  const { t } = useI18n()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!login || !password) return
    setLoading(true)
    onError('')
    onErrorCode?.(null)
    try {
      const result = await window.api.auth.login(login, password) as { success: boolean; error?: string; errorCode?: string }
      if (result.success) {
        onSuccess()
      } else {
        onError(result.error || t('login.loginFailed'))
        if (result.errorCode) onErrorCode?.(result.errorCode)
      }
    } catch {
      onError(t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('login.emailOrUsername')}</label>
        <FocusInput
          type="text" value={login} onChange={(e) => setLogin(e.target.value)}
          placeholder={t('login.emailPlaceholder')} autoFocus
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>{t('login.password')}</label>
        <FocusInput
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.passwordPlaceholder')}
        />
      </div>
      <div style={{ textAlign: 'right', marginBottom: 20 }}>
        <a
          href="#"
          role="link"
          tabIndex={0}
          onClick={(e) => { e.preventDefault(); window.api.shell.openExternal(`${getServerBase()}/zh/console/forgot-password`) }}
          onKeyDown={(e) => { if (e.key === 'Enter') window.api.shell.openExternal(`${getServerBase()}/zh/console/forgot-password`) }}
          style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'none' }}
        >
          {t('login.forgotPassword')}
        </a>
      </div>
      <button
        type="submit" disabled={disabled}
        style={{
          width: '100%', padding: '10px 0', background: loading ? 'var(--accent-hover)' : 'var(--accent)',
          color: 'var(--accent-text)', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
          ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : { cursor: 'pointer' }),
        }}
      >
        {loading ? t('login.signingIn') : t('login.signIn')}
      </button>
    </form>
  )
}

function RegisterForm({ onSuccess, onError, onMessage }: {
  onSuccess: () => void; onError: (e: string) => void; onMessage: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [codeSending, setCodeSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const disabled = loading || !email || !code || !password
  const { t } = useI18n()

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleSendCode = useCallback(async () => {
    if (!email || countdown > 0) return
    setCodeSending(true)
    onError('')
    try {
      const result = await window.api.auth.sendCode(email)
      if (result.success) {
        onMessage(t('login.codeSent'))
        setCountdown(60)
        timerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current)
              timerRef.current = null
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        onError(result.error || t('login.sendCodeFailed'))
      }
    } catch {
      onError(t('login.sendCodeFailed'))
    } finally {
      setCodeSending(false)
    }
  }, [email, countdown, onError, onMessage, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !code || !password) return
    setLoading(true)
    onError('')
    try {
      const result = await window.api.auth.register(
        email, password, code,
        username || undefined,
        referralCode || undefined
      )
      if (result.success) {
        onSuccess()
      } else {
        onError(result.error || t('login.registrationFailed'))
      }
    } catch {
      onError(t('login.registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('login.email')}</label>
        <FocusInput
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t('login.emailPlaceholder')} autoFocus
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('login.verificationCode')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <FocusInput
            type="text" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder={t('login.enterCode')} maxLength={6}
            style={{ flex: 1 }}
          />
          <button
            type="button" onClick={handleSendCode}
            disabled={!email || codeSending || countdown > 0}
            style={{
              padding: '0 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 6, color: (!email || countdown > 0) ? 'var(--text-muted)' : 'var(--accent)',
              fontSize: 13, whiteSpace: 'nowrap',
              cursor: (!email || countdown > 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {codeSending ? '...' : countdown > 0 ? `${countdown}s` : t('login.sendCode')}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('login.password')}</label>
        <FocusInput
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.createPassword')}
        />
      </div>

      {/* Collapsible optional fields */}
      {!showMore ? (
        <div
          onClick={() => setShowMore(true)}
          style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', marginBottom: 20, textAlign: 'center' }}
        >
          {t('login.moreOptions')}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('login.username')}</label>
            <FocusInput
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.chooseUsername')}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t('login.referralCode')}</label>
            <FocusInput
              type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value)}
              placeholder={t('login.enterReferralCode')}
            />
          </div>
        </>
      )}

      <button
        type="submit" disabled={disabled}
        style={{
          width: '100%', padding: '10px 0', background: loading ? 'var(--accent-hover)' : 'var(--accent)',
          color: 'var(--accent-text)', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
          ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : { cursor: 'pointer' }),
        }}
      >
        {loading ? t('login.creatingAccount') : t('login.createAccount')}
      </button>
    </form>
  )
}
