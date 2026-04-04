import { create } from 'zustand'

export interface TerminalTab {
  id: string
  ptyId: string | null
  title: string
  cwd: string
  createdAt: number
  gitBranch?: string
  model?: string
  isRunning?: boolean
  isExited?: boolean
  mode?: 'suggest' | 'autoedit' | 'fullauto'
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  addTab: (tab: TerminalTab) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<TerminalTab>) => void
  /** Find tab by ptyId */
  getTabByPtyId: (ptyId: string) => TerminalTab | undefined
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    })),

  removeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id)
      const tabs = state.tabs.filter((t) => t.id !== id)
      let activeTabId = state.activeTabId
      if (state.activeTabId === id) {
        // Prefer next tab at same position, fallback to previous
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) =>
    set((state) => state.tabs.some((t) => t.id === id) ? { activeTabId: id } : {}),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),

  getTabByPtyId: (ptyId) => get().tabs.find((t) => t.ptyId === ptyId)
}))
