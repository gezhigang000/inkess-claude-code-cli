import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/auth'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, balance, setBalance, logout } = useAuthStore()
  const [activeSection, setActiveSection] = useState<'account' | 'appearance' | 'ide' | 'network'>('account')
  const [fontSize, setFontSize] = useState(14)
  const [ideChoice, setIdeChoice] = useState('vscode')

  useEffect(() => {
    window.api.auth.getBalance().then(({ balance: b }) => {
      setBalance(b)
    })
  }, [setBalance])

  const handleLogout = () => {
    window.api.auth.logout()
    logout()
    onClose()
    location.reload()
  }

  const sections = [
    { id: 'account' as const, label: 'Account', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' },
    { id: 'appearance' as const, label: 'Appearance', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'ide' as const, label: 'IDE', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
    { id: 'network' as const, label: 'Network', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9' }
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', margin: 'auto', width: 640, maxHeight: '80vh',
        background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)',
        display: 'flex', overflow: 'hidden'
      }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: 'var(--bg-secondary)', padding: '16px 8px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px', marginBottom: 8 }}>Settings</div>
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
            <AccountSection user={user} balance={balance} onLogout={handleLogout} />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection fontSize={fontSize} onFontSizeChange={setFontSize} />
          )}
          {activeSection === 'ide' && (
            <IdeSection choice={ideChoice} onChange={setIdeChoice} />
          )}
          {activeSection === 'network' && <NetworkSection />}
        </div>
      </div>
    </div>
  )
}

// --- Section Components ---

function AccountSection({ user, balance, onLogout }: {
  user: { username: string; email: string } | null
  balance: number
  onLogout: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* User info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--accent)', fontWeight: 600 }}>
          {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.username || 'Unknown'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.email || ''}</div>
        </div>
      </div>

      {/* Balance */}
      <SettingsGroup title="Balance">
        <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Balance</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>¥{(balance / 100).toFixed(2)}</div>
        </div>
        <button
          onClick={() => window.api.shell.openExternal('https://llm.starapp.net/zh/console/topup')}
          style={{ marginTop: 8, padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
        >
          Top Up
        </button>
      </SettingsGroup>

      {/* Change Password */}
      <ChangePasswordSection />

      {/* Logout */}
      <button
        onClick={onLogout}
        style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'transparent', color: 'var(--error-text)', border: '1px solid var(--error)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
      >
        Sign Out
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

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd) return
    if (newPwd !== confirmPwd) {
      setMsg({ type: 'error', text: 'Passwords do not match' })
      return
    }
    setLoading(true)
    setMsg(null)
    const result = await window.api.auth.changePassword(currentPwd, newPwd)
    setLoading(false)
    if (result.success) {
      setMsg({ type: 'success', text: 'Password changed' })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    } else {
      setMsg({ type: 'error', text: result.error || 'Failed' })
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
  }

  return (
    <SettingsGroup title="Change Password">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Current password" style={inputStyle} />
        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password" style={inputStyle} />
        <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Confirm new password" style={inputStyle} />
        {msg && <div style={{ fontSize: 12, color: msg.type === 'error' ? 'var(--error-text)' : 'var(--success)' }}>{msg.text}</div>}
        <button
          onClick={handleSubmit}
          disabled={loading || !currentPwd || !newPwd || !confirmPwd}
          style={{
            alignSelf: 'flex-start', padding: '6px 14px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 12, cursor: loading ? 'wait' : 'pointer',
            opacity: (!currentPwd || !newPwd || !confirmPwd) ? 0.5 : 1
          }}
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </SettingsGroup>
  )
}

function AppearanceSection({ fontSize, onFontSizeChange }: { fontSize: number; onFontSizeChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsGroup title="Terminal Font Size">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range" min={10} max={24} value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 30 }}>{fontSize}px</span>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Theme">
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Dark theme (more themes coming soon)</div>
      </SettingsGroup>
    </div>
  )
}

function IdeSection({ choice, onChange }: { choice: string; onChange: (v: string) => void }) {
  const options = [
    { id: 'vscode', label: 'VS Code', scheme: 'vscode://' },
    { id: 'cursor', label: 'Cursor', scheme: 'cursor://' },
    { id: 'zed', label: 'Zed', scheme: 'zed://' }
  ]
  return (
    <SettingsGroup title="Default IDE">
      {options.map(opt => (
        <div
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            borderRadius: 6, cursor: 'pointer',
            background: choice === opt.id ? 'var(--accent-subtle)' : 'transparent'
          }}
        >
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: choice === opt.id ? 'var(--accent)' : 'transparent',
            border: choice === opt.id ? 'none' : '2px solid var(--text-muted)'
          }} />
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{opt.scheme}</span>
        </div>
      ))}
    </SettingsGroup>
  )
}

function NetworkSection() {
  return (
    <SettingsGroup title="HTTP Proxy">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        Set a proxy for API requests (leave empty to use system proxy)
      </div>
      <input
        type="text"
        placeholder="http://127.0.0.1:7890"
        style={{
          width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text-primary)', fontSize: 13, outline: 'none'
        }}
      />
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
