import { useState, useCallback, useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'

interface LoginScreenProps {
  onLoginSuccess: () => void
}

type Tab = 'login' | 'register'

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { t } = useI18n()

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

        {/* Tab switcher */}
        <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, background: 'var(--bg-tertiary)', padding: 3 }}>
          {(['login', 'register'] as Tab[]).map(tb => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setError(null); setSuccess(null) }}
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: tab === tb ? 'var(--bg-primary)' : 'transparent',
                color: tab === tb ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === tb ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {tb === 'login' ? t('login.signIn') : t('login.register')}
            </button>
          ))}
        </div>

        {error && <div style={{ fontSize: 13, color: 'var(--error-text)', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        {success && <div style={{ fontSize: 13, color: 'var(--success)', marginBottom: 12, textAlign: 'center' }}>{success}</div>}

        {tab === 'login' ? (
          <LoginForm onSuccess={onLoginSuccess} onError={setError} />
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

function LoginForm({ onSuccess, onError }: { onSuccess: () => void; onError: (e: string) => void }) {
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
    const result = await window.api.auth.login(login, password)
    setLoading(false)
    if (result.success) {
      onSuccess()
    } else {
      onError(result.error || t('login.loginFailed'))
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
          onClick={(e) => { e.preventDefault(); window.api.shell.openExternal('https://llm.starapp.net/zh/console/forgot-password') }}
          onKeyDown={(e) => { if (e.key === 'Enter') window.api.shell.openExternal('https://llm.starapp.net/zh/console/forgot-password') }}
          style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'none' }}
        >
          {t('login.forgotPassword')}
        </a>
      </div>
      <button
        type="submit" disabled={disabled}
        style={{
          width: '100%', padding: '10px 0', background: loading ? 'var(--accent-hover)' : 'var(--accent)',
          color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
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
    const result = await window.api.auth.sendCode(email)
    setCodeSending(false)
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
  }, [email, countdown, onError, onMessage, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !code || !password) return
    setLoading(true)
    onError('')
    const result = await window.api.auth.register(
      email, password, code,
      username || undefined,
      referralCode || undefined
    )
    setLoading(false)
    if (result.success) {
      onSuccess()
    } else {
      onError(result.error || t('login.registrationFailed'))
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
          color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
          ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : { cursor: 'pointer' }),
        }}
      >
        {loading ? t('login.creatingAccount') : t('login.createAccount')}
      </button>
    </form>
  )
}
