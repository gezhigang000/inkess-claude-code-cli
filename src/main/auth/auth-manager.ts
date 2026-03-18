import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import log from '../logger'

const API_BASE = 'https://llm.starapp.net'

function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/** Map HTTP status to user-friendly message */
function httpErrorMessage(status: number, context: string): string {
  switch (status) {
    case 400: return 'Request invalid, please check your input'
    case 401: return 'Incorrect email/username or password'
    case 403: return 'Account is disabled, please contact support'
    case 404: return 'Service unavailable, please try again later'
    case 409: return 'Account already exists'
    case 422: return 'Please check your input and try again'
    case 429: return 'Too many attempts, please wait a moment'
    case 500: case 502: case 503:
      return 'Server error, please try again later'
    default: return `${context} failed (${status})`
  }
}

/** Map catch errors to user-friendly message */
function catchErrorMessage(err: unknown): string {
  const msg = (err as Error).message || String(err)
  if (msg.includes('aborted') || msg.includes('AbortError'))
    return 'Request timed out, please check your network'
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND'))
    return 'Unable to connect to server, please check your network'
  if (msg.includes('network') || msg.includes('Network'))
    return 'Network error, please check your connection'
  return msg
}

interface UserInfo {
  id: number
  email: string
  username: string
  balance: number
}

interface AuthData {
  token: string
  user: UserInfo
}

export class AuthManager {
  private dataDir: string
  private authFile: string
  private authData: AuthData | null = null

  constructor() {
    this.dataDir = join(app.getPath('userData'), 'auth')
    this.authFile = join(this.dataDir, 'session.json')
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(this.authFile)) {
        const raw = readFileSync(this.authFile, 'utf-8')
        this.authData = JSON.parse(raw)
      }
    } catch {
      this.authData = null
    }
  }

  private save(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
    if (this.authData) {
      writeFileSync(this.authFile, JSON.stringify(this.authData), 'utf-8')
    }
  }

  private clear(): void {
    this.authData = null
    try {
      if (existsSync(this.authFile)) unlinkSync(this.authFile)
    } catch { /* ignore */ }
  }

  isLoggedIn(): boolean {
    return this.authData !== null
  }

  getUser(): UserInfo | null {
    return this.authData?.user ?? null
  }

  getToken(): string | null {
    return this.authData?.token ?? null
  }

  async login(login: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      log.info(`Auth: login attempt for ${login}`)
      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Login') }
      }

      const data = await res.json() as { token: string; user: UserInfo }
      this.authData = { token: data.token, user: data.user }
      this.save()
      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async register(email: string, password: string, code: string, username?: string, referralCode?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const body: Record<string, string> = { email, password, code }
      if (username) body.username = username
      if (referralCode) body.referralCode = referralCode

      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Registration') }
      }

      const data = await res.json() as { token: string; user: UserInfo }
      this.authData = { token: data.token, user: data.user }
      this.save()
      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async sendCode(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Send code') }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Reset password') }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const token = this.getToken()
    if (!token) return { success: false, error: 'Not logged in' }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Change password') }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async getBalance(): Promise<{ balance: number; error?: string }> {
    const token = this.getToken()
    if (!token) return { balance: 0, error: 'Not logged in' }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/llm/desktop/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) return { balance: 0, error: httpErrorMessage(res.status, 'Get balance') }

      const data = await res.json() as { balance: number }
      // Update cached user balance
      if (this.authData) {
        this.authData.user.balance = data.balance
        this.save()
      }
      return { balance: data.balance }
    } catch (err) {
      return { balance: 0, error: catchErrorMessage(err) }
    }
  }

  logout(): void {
    this.clear()
  }

  getStatus(): { loggedIn: boolean; user: UserInfo | null } {
    return {
      loggedIn: this.isLoggedIn(),
      user: this.getUser()
    }
  }
}
