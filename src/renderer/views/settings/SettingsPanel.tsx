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
  const [activeSection, setActiveSection] = useState<'account' | 'billing' | 'appearance' | 'language' | 'about'>('account')
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
    { id: 'billing' as const, label: t('settings.billing'), icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
    { id: 'appearance' as const, label: t('settings.appearance'), icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'language' as const, label: t('settings.language'), icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' },
    { id: 'about' as const, label: t('settings.about'), icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
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
            <AccountSection user={user} onLogout={onLogout} />
          )}
          {activeSection === 'billing' && (
            <BillingSection balance={balance} />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection
              fontSize={fontSize} onFontSizeChange={setFontSize}
              theme={theme} onThemeChange={setTheme}
            />
          )}
          {activeSection === 'language' && (
            <LanguageSection language={language} onChange={setLanguage} />
          )}
          {activeSection === 'about' && (
            <AboutSection />
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

function AccountSection({ user, onLogout }: {
  user: { username: string; email: string } | null
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

function BillingSection({ balance }: { balance: number }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsGroup title={t('settings.balance')}>
        <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('settings.balance')}</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>¥{(balance / 100).toFixed(2)}</div>
        </div>
        <button
          onClick={() => window.api.shell.openExternal('https://llm.starapp.net/zh/console/topup')}
          style={{ marginTop: 12, padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
        >
          {t('settings.topUp')}
        </button>
      </SettingsGroup>
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
    try {
      const result = await window.api.auth.changePassword(currentPwd, newPwd)
      if (result.success) {
        setMsg({ type: 'success', text: t('settings.passwordChanged') })
        setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      } else {
        setMsg({ type: 'error', text: result.error || 'Failed' })
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed' })
    } finally {
      setLoading(false)
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
            alignSelf: 'flex-start', padding: '6px 14px', background: 'var(--accent)', color: 'var(--accent-text)',
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
  const {
    notificationsEnabled, setNotificationsEnabled,
    sleepInhibitorEnabled, setSleepInhibitorEnabled
  } = useSettingsStore()
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
      <SettingsGroup title={t('settings.notifications')}>
        <ToggleRow
          label={t('settings.notificationsEnabled')}
          checked={notificationsEnabled}
          onChange={setNotificationsEnabled}
        />
      </SettingsGroup>
      <SettingsGroup title={t('settings.sleepInhibitor')}>
        <ToggleRow
          label={t('settings.sleepInhibitorEnabled')}
          checked={sleepInhibitorEnabled}
          onChange={setSleepInhibitorEnabled}
        />
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

function AboutSection() {
  const { t } = useI18n()
  const [appVersion, setAppVersion] = useState('')
  const [cliVersion, setCliVersion] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState('')

  useEffect(() => {
    window.api.app.getVersion().then(setAppVersion)
    window.api.cli.getInfo().then(info => setCliVersion(info.version))

    const timers: ReturnType<typeof setTimeout>[] = []
    const unsub = window.api.appUpdate.onStatus((status) => {
      if (status.type === 'available') {
        setUpdateStatus('available')
        setUpdateVersion(status.version || '')
      } else if (status.type === 'not-available') {
        setUpdateStatus('not-available')
        timers.push(setTimeout(() => setUpdateStatus('idle'), 3000))
      } else if (status.type === 'error') {
        setUpdateStatus('error')
        timers.push(setTimeout(() => setUpdateStatus('idle'), 3000))
      } else if (status.type === 'checking') {
        setUpdateStatus('checking')
      }
    })
    return () => { unsub(); timers.forEach(clearTimeout) }
  }, [])

  const handleUploadLogs = async () => {
    setUploadStatus('uploading')
    try {
      const result = await window.api.log.uploadFile()
      setUploadStatus(result.success ? 'success' : 'error')
    } catch {
      setUploadStatus('error')
    }
    setTimeout(() => setUploadStatus('idle'), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsGroup title={t('settings.version')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Inkess Claude Code CLI</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>v{appVersion}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Claude Code CLI</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>{cliVersion ? `v${cliVersion}` : '—'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => window.api.appUpdate.check()}
            disabled={updateStatus === 'checking'}
            style={{
              padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
              ...(updateStatus === 'checking' ? disabledBtnBase : { cursor: 'pointer' }),
            }}
          >
            {updateStatus === 'checking' ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
          </button>
          {updateStatus === 'available' && (
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>
              {t('settings.updateAvailable').replace('{version}', updateVersion)}
            </span>
          )}
          {updateStatus === 'not-available' && (
            <span style={{ fontSize: 12, color: 'var(--success)' }}>{t('settings.updateNotAvailable')}</span>
          )}
          {updateStatus === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--error-text)' }}>{t('settings.updateError')}</span>
          )}
        </div>
      </SettingsGroup>
      <ClearHistorySection />
      <SettingsGroup title={t('settings.diagnostics')}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('settings.diagnosticsHint')}</div>
        <button
          onClick={handleUploadLogs}
          disabled={uploadStatus === 'uploading'}
          style={{
            padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
            ...(uploadStatus === 'uploading' ? disabledBtnBase : { cursor: 'pointer' }),
          }}
        >
          {uploadStatus === 'uploading' ? t('settings.uploadingLogs') :
           uploadStatus === 'success' ? t('settings.logsUploaded') :
           uploadStatus === 'error' ? t('settings.logsUploadFailed') :
           t('settings.uploadLogs')}
        </button>
      </SettingsGroup>
    </div>
  )
}

function ClearHistorySection() {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)

  return (
    <SettingsGroup title={t('history.title')}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('history.clearConfirm')}</div>
      {confirming ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={async () => { await window.api.session.clearAll(); setConfirming(false) }}
            style={{
              padding: '6px 14px', background: 'var(--error)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            }}
          >
            {t('history.confirmClear')}
          </button>
          <button
            onClick={() => setConfirming(false)}
            style={{
              padding: '6px 14px', background: 'var(--bg-active)', color: 'var(--text-secondary)',
              border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            }}
          >
            {t('history.cancel')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          style={{
            padding: '6px 14px', background: 'transparent', color: 'var(--error-text)',
            border: '1px solid var(--error)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
          }}
        >
          {t('history.clearAll')}
        </button>
      )}
    </SettingsGroup>
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

/** Toggle switch (pill style, 40x22) */
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
          background: checked ? 'var(--accent)' : 'var(--bg-active)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: checked ? '#fff' : 'var(--toggle-knob)',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  )
}
