import { create } from 'zustand'

const STORAGE_KEY = 'inkess-settings'

type ThemeChoice = 'auto' | 'dark' | 'light'
type LanguageChoice = 'auto' | 'zh' | 'en'

interface SettingsState {
  fontSize: number
  ideChoice: string
  language: LanguageChoice
  theme: ThemeChoice
  notificationsEnabled: boolean
  notificationSound: boolean
  sleepInhibitorEnabled: boolean

  setFontSize: (v: number) => void
  setIdeChoice: (v: string) => void
  setLanguage: (v: LanguageChoice) => void
  setTheme: (v: ThemeChoice) => void
  setNotificationsEnabled: (v: boolean) => void
  setNotificationSound: (v: boolean) => void
  setSleepInhibitorEnabled: (v: boolean) => void
}

function loadSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveSettings(state: Pick<SettingsState, 'fontSize' | 'ideChoice' | 'language' | 'theme' | 'notificationsEnabled' | 'notificationSound' | 'sleepInhibitorEnabled'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize: state.fontSize,
      ideChoice: state.ideChoice,
      language: state.language,
      theme: state.theme,
      notificationsEnabled: state.notificationsEnabled,
      notificationSound: state.notificationSound,
      sleepInhibitorEnabled: state.sleepInhibitorEnabled,
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontSize: saved.fontSize ?? 14,
  ideChoice: saved.ideChoice ?? 'vscode',
  language: (saved as any).language ?? 'auto',
  theme: (saved as any).theme ?? 'auto',
  notificationsEnabled: (saved as any).notificationsEnabled ?? true,
  notificationSound: (saved as any).notificationSound ?? true,
  sleepInhibitorEnabled: (saved as any).sleepInhibitorEnabled ?? true,

  setFontSize: (v) => { set({ fontSize: v }); saveSettings({ ...get(), fontSize: v }) },
  setIdeChoice: (v) => { set({ ideChoice: v }); saveSettings({ ...get(), ideChoice: v }) },
  setLanguage: (v) => { set({ language: v }); saveSettings({ ...get(), language: v }) },
  setTheme: (v) => { set({ theme: v }); applyTheme(v); saveSettings({ ...get(), theme: v }) },
  setNotificationsEnabled: (v) => { set({ notificationsEnabled: v }); saveSettings({ ...get(), notificationsEnabled: v }) },
  setNotificationSound: (v) => { set({ notificationSound: v }); saveSettings({ ...get(), notificationSound: v }) },
  setSleepInhibitorEnabled: (v) => {
    set({ sleepInhibitorEnabled: v })
    saveSettings({ ...get(), sleepInhibitorEnabled: v })
    window.api?.power?.setSleepInhibitorEnabled(v)
  },
}))

// Apply theme on load
applyTheme((saved as any).theme ?? 'auto')
