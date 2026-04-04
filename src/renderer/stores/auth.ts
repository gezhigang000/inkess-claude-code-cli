import { create } from 'zustand'

interface UserInfo {
  id: number
  email: string
  username: string
  balance: number
}

interface AuthState {
  loggedIn: boolean
  user: UserInfo | null
  balance: number

  setAuth: (loggedIn: boolean, user: UserInfo | null) => void
  setBalance: (balance: number) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: false,
  user: null,
  balance: 0,

  setAuth: (loggedIn, user) => set({ loggedIn, user, balance: user?.balance ?? 0 }),
  setBalance: (balance) => set((state) => ({
    balance,
    user: state.user ? { ...state.user, balance } : null,
  })),
  logout: () => set({ loggedIn: false, user: null, balance: 0 })
}))
