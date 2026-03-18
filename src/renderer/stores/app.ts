import { create } from 'zustand'

type AppPhase = 'checking' | 'login' | 'installing' | 'ready' | 'error'

interface InstallStep {
  label: string
  status: 'done' | 'active' | 'pending'
}

interface AppState {
  phase: AppPhase
  cliInstalled: boolean
  cliVersion: string | null
  installSteps: InstallStep[]
  installError: string | null

  setPhase: (phase: AppPhase) => void
  setCliInfo: (installed: boolean, version: string | null) => void
  setInstallSteps: (steps: InstallStep[]) => void
  setInstallError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'checking',
  cliInstalled: false,
  cliVersion: null,
  installSteps: [],
  installError: null,

  setPhase: (phase) => set({ phase }),
  setCliInfo: (installed, version) => set({ cliInstalled: installed, cliVersion: version }),
  setInstallSteps: (steps) => set({ installSteps: steps }),
  setInstallError: (error) => set({ installError: error })
}))
