import { create } from 'zustand'

const STORAGE_KEY = 'inkess-settings'

type ThemeChoice = 'auto' | 'dark' | 'light'
type LanguageChoice = 'auto' | 'zh' | 'en'

const VALID_THEMES: ThemeChoice[] = ['auto', 'dark', 'light']
const VALID_LANGUAGES: LanguageChoice[] = ['auto', 'zh', 'en']
const VALID_IDE_CHOICES = ['vscode', 'cursor', 'windsurf', 'zed']

interface SettingsState {
  fontSize: number
  ideChoice: string
  language: LanguageChoice
  theme: ThemeChoice
  notificationsEnabled: boolean
  notificationSound: boolean
  sleepInhibitorEnabled: boolean
  serverUrl: string

  setFontSize: (v: number) => void
  setIdeChoice: (v: string) => void
  setLanguage: (v: LanguageChoice) => void
  setTheme: (v: ThemeChoice) => void
  setNotificationsEnabled: (v: boolean) => void
  setNotificationSound: (v: boolean) => void
  setSleepInhibitorEnabled: (v: boolean) => void
  setServerUrl: (v: string) => void
}

function loadSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

/** Persist only serializable settings fields atomically from current store state */
function persistSettings(state: SettingsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize: state.fontSize,
      ideChoice: state.ideChoice,
      language: state.language,
      theme: state.theme,
      notificationsEnabled: state.notificationsEnabled,
      notificationSound: state.notificationSound,
      sleepInhibitorEnabled: state.sleepInhibitorEnabled,
      serverUrl: state.serverUrl,
    }))
  } catch { /* ignore */ }
}

/** Resolve theme to 'dark' or 'light', applying system preference for 'auto' */
export function resolveTheme(theme: ThemeChoice): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') return theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Apply theme to document root */
export function applyTheme(theme: ThemeChoice) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme))
}

const saved = loadSettings()

// Validate loaded values to prevent corrupted localStorage from breaking the app
const validatedTheme: ThemeChoice = VALID_THEMES.includes((saved as any).theme) ? (saved as any).theme : 'auto'
const validatedLanguage: LanguageChoice = VALID_LANGUAGES.includes((saved as any).language) ? (saved as any).language : 'auto'
const validatedFontSize = typeof saved.fontSize === 'number' && saved.fontSize >= 10 && saved.fontSize <= 24 ? saved.fontSize : 14

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontSize: validatedFontSize,
  ideChoice: VALID_IDE_CHOICES.includes((saved as any).ideChoice) ? (saved as any).ideChoice : 'vscode',
  language: validatedLanguage,
  theme: validatedTheme,
  notificationsEnabled: typeof (saved as any).notificationsEnabled === 'boolean' ? (saved as any).notificationsEnabled : true,
  notificationSound: typeof (saved as any).notificationSound === 'boolean' ? (saved as any).notificationSound : true,
  sleepInhibitorEnabled: typeof (saved as any).sleepInhibitorEnabled === 'boolean' ? (saved as any).sleepInhibitorEnabled : true,
  serverUrl: typeof (saved as any).serverUrl === 'string' ? (saved as any).serverUrl : '',

  // Each setter: set() first (synchronous), then persist the full post-set state
  // This avoids the race where get() returns stale pre-set values
  setFontSize: (v) => { set({ fontSize: v }); persistSettings(get()) },
  setIdeChoice: (v) => { set({ ideChoice: v }); persistSettings(get()) },
  setLanguage: (v) => { set({ language: v }); persistSettings(get()) },
  setTheme: (v) => { set({ theme: v }); applyTheme(v); persistSettings(get()) },
  setNotificationsEnabled: (v) => { set({ notificationsEnabled: v }); persistSettings(get()) },
  setNotificationSound: (v) => { set({ notificationSound: v }); persistSettings(get()) },
  setSleepInhibitorEnabled: (v) => {
    set({ sleepInhibitorEnabled: v })
    persistSettings(get())
    window.api?.power?.setSleepInhibitorEnabled(v)
  },
  setServerUrl: (v) => {
    set({ serverUrl: v })
    persistSettings(get())
    window.api?.auth?.setApiBase(v || null)
  },
}))

// Apply theme on load
applyTheme(validatedTheme)

// Sync persisted server URL override to main process so API calls
// hit the user-configured host before the first login attempt.
setTimeout(() => {
  const { serverUrl } = useSettingsStore.getState()
  if (serverUrl) {
    window.api?.auth?.setApiBase(serverUrl)
  }
}, 0)
