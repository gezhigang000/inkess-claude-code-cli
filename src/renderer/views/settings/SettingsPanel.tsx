import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useI18n } from '../../i18n'

interface SettingsPanelProps {
  onClose: () => void
  onLogout: () => void
}

export function SettingsPanel({ onClose, onLogout }: SettingsPanelProps) {
  const { user, balance, setBalance } = useAuthStore()
  const [activeSection, setActiveSection] = useState<'account' | 'appearance' | 'language'>('account')
  const { fontSize, language, theme, setFontSize, setLanguage, setTheme } = useSettingsStore()
  const { t } = useI18n()

  useEffect(() => {
    window.api.auth.getBalance().then(({ balance: b }) => {
      setBalance(b)
    })
  }, [setBalance])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sections = [
    { id: 'account' as const, label: t('settings.account'), icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' },
    { id: 'appearance' as const, label: t('settings.appearance'), icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'language' as const, label: t('settings.language'), icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', margin: 'auto', width: 640, height: 480,
        background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)',
        display: 'flex', overflow: 'hidden'
      }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: 'var(--bg-secondary)', padding: '16px 8px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px', marginBottom: 8 }}>{t('settings.title')}</div>
          {sections.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6,
                fontSize: 13, cursor: 'pointer',
                color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeSection === s.id ? 'var(--bg-hover)' : 'transparent'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={s.icon} /></svg>
              {s.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              {sections.find(s => s.id === activeSection)?.label}
            </h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          {activeSection === 'account' && (
            <AccountSection user={user} balance={balance} onLogout={onLogout} />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection fontSize={fontSize} onFontSizeChange={setFontSize} theme={theme} onThemeChange={setTheme} />
          )}
          {activeSection === 'language' && (
            <LanguageSection language={language} onChange={setLanguage} />
          )}
        </div>
      </div>
    </div>
  )
}

// --- Shared styles ---

const focusableInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

const disabledBtnBase: React.CSSProperties = {
  cursor: 'not-allowed', opacity: 0.5,
}

// --- Section Components ---

function AccountSection({ user, balance, onLogout }: {
  user: { username: string; email: string } | null
  balance: number
  onLogout: () => void
}) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* User info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--accent)', fontWeight: 600 }}>
          {(user?.username || user?.email)?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          {user?.username && <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user.username}</div>}
          <div style={{ fontSize: user?.username ? 12 : 14, color: user?.username ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: user?.username ? 400 : 500 }}>{user?.email || ''}</div>
        </div>
      </div>

      {/* Balance */}
      <SettingsGroup title={t('settings.balance')}>
        <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('settings.balance')}</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>¥{(balance / 100).toFixed(2)}</div>
        </div>
        <button
          onClick={() => window.api.shell.openExternal('https://llm.starapp.net/zh/console/topup')}
          style={{ marginTop: 8, padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
        >
          {t('settings.topUp')}
        </button>
      </SettingsGroup>

      {/* Change Password */}
      <ChangePasswordSection />

      {/* Logout */}
      <button
        onClick={onLogout}
        style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'transparent', color: 'var(--error-text)', border: '1px solid var(--error)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
      >
        {t('settings.signOut')}
      </button>
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const { t } = useI18n()

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd) return
    if (newPwd !== confirmPwd) {
      setMsg({ type: 'error', text: t('settings.passwordsNotMatch') })
      return
    }
    setLoading(true)
    setMsg(null)
    const result = await window.api.auth.changePassword(currentPwd, newPwd)
    setLoading(false)
    if (result.success) {
      setMsg({ type: 'success', text: t('settings.passwordChanged') })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    } else {
      setMsg({ type: 'error', text: result.error || 'Failed' })
    }
  }

  const disabled = loading || !currentPwd || !newPwd || !confirmPwd

  return (
    <SettingsGroup title={t('settings.changePassword')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FocusInput type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder={t('settings.currentPassword')} />
        <FocusInput type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t('settings.newPassword')} />
        <FocusInput type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder={t('settings.confirmPassword')} />
        {msg && <div style={{ fontSize: 12, color: msg.type === 'error' ? 'var(--error-text)' : 'var(--success)' }}>{msg.text}</div>}
        <button
          onClick={handleSubmit}
          disabled={disabled}
          style={{
            alignSelf: 'flex-start', padding: '6px 14px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 12,
            ...(disabled ? disabledBtnBase : { cursor: 'pointer' }),
          }}
        >
          {loading ? t('settings.changingPassword') : t('settings.changePassword')}
        </button>
      </div>
    </SettingsGroup>
  )
}

function AppearanceSection({ fontSize, onFontSizeChange, theme, onThemeChange }: {
  fontSize: number; onFontSizeChange: (v: number) => void
  theme: 'auto' | 'dark' | 'light'; onThemeChange: (v: 'auto' | 'dark' | 'light') => void
}) {
  const { t } = useI18n()
  const themeOptions: { id: 'auto' | 'dark' | 'light'; label: string }[] = [
    { id: 'auto', label: t('settings.themeAuto') },
    { id: 'dark', label: t('settings.themeDark') },
    { id: 'light', label: t('settings.themeLight') },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsGroup title={t('settings.theme')}>
        {themeOptions.map(opt => (
          <div
            key={opt.id}
            onClick={() => onThemeChange(opt.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 6, cursor: 'pointer',
              background: theme === opt.id ? 'var(--accent-subtle)' : 'transparent'
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: theme === opt.id ? 'var(--accent)' : 'transparent',
              border: theme === opt.id ? 'none' : '2px solid var(--text-muted)'
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</span>
          </div>
        ))}
      </SettingsGroup>
      <SettingsGroup title={t('settings.terminalFontSize')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range" min={10} max={24} value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 30 }}>{fontSize}px</span>
        </div>
      </SettingsGroup>
    </div>
  )
}

function LanguageSection({ language, onChange }: { language: 'auto' | 'zh' | 'en'; onChange: (v: 'auto' | 'zh' | 'en') => void }) {
  const { t } = useI18n()
  const options: { id: 'auto' | 'zh' | 'en'; label: string }[] = [
    { id: 'auto', label: t('settings.languageAuto') },
    { id: 'zh', label: t('settings.languageZh') },
    { id: 'en', label: t('settings.languageEn') },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsGroup title={t('settings.languageLabel')}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{t('settings.languageHint')}</div>
        {options.map(opt => (
          <div
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 6, cursor: 'pointer',
              background: language === opt.id ? 'var(--accent-subtle)' : 'transparent'
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: language === opt.id ? 'var(--accent)' : 'transparent',
              border: language === opt.id ? 'none' : '2px solid var(--text-muted)'
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</span>
          </div>
        ))}
      </SettingsGroup>
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

/** Input with visible focus ring */
function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...focusableInputStyle, ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; props.onBlur?.(e) }}
    />
  )
}
