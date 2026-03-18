import { create } from 'zustand'

const STORAGE_KEY = 'inkess-settings'

interface SettingsState {
  fontSize: number
  ideChoice: string
  proxyUrl: string

  setFontSize: (v: number) => void
  setIdeChoice: (v: string) => void
  setProxyUrl: (v: string) => void
}

function loadSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveSettings(state: Pick<SettingsState, 'fontSize' | 'ideChoice' | 'proxyUrl'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize: state.fontSize,
      ideChoice: state.ideChoice,
      proxyUrl: state.proxyUrl,
    }))
  } catch { /* ignore */ }
}

const saved = loadSettings()

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontSize: saved.fontSize ?? 14,
  ideChoice: saved.ideChoice ?? 'vscode',
  proxyUrl: saved.proxyUrl ?? '',

  setFontSize: (v) => { set({ fontSize: v }); saveSettings({ ...get(), fontSize: v }) },
  setIdeChoice: (v) => { set({ ideChoice: v }); saveSettings({ ...get(), ideChoice: v }) },
  setProxyUrl: (v) => { set({ proxyUrl: v }); saveSettings({ ...get(), proxyUrl: v }) },
}))
