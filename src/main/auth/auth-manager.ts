import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'fs'
import log from '../logger'
import { buildApiUrl } from '../api-url'

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
  private encFile: string
  private legacyFile: string
  private credFile: string
  private authData: AuthData | null = null
  private useEncryption: boolean
  private balanceInFlight: Promise<{ balance: number; error?: string }> | null = null

  constructor() {
    this.dataDir = join(app.getPath('userData'), 'auth')
    this.encFile = join(this.dataDir, 'session.enc')
    this.legacyFile = join(this.dataDir, 'session.json')
    this.credFile = join(this.dataDir, 'credentials.enc')
    this.useEncryption = safeStorage.isEncryptionAvailable()
    this.migrate()
    this.load()
  }

  /** Migrate legacy plaintext session.json → encrypted session.enc */
  private migrate(): void {
    try {
      if (!existsSync(this.legacyFile)) return
      if (existsSync(this.encFile)) {
        // Already migrated, just remove legacy file
        unlinkSync(this.legacyFile)
        return
      }
      const raw = readFileSync(this.legacyFile, 'utf-8')
      JSON.parse(raw) // validate JSON
      if (this.useEncryption) {
        if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true })
        const encrypted = safeStorage.encryptString(raw)
        // Atomic write: tmp → rename
        const tmpEnc = this.encFile + '.tmp'
        writeFileSync(tmpEnc, encrypted)
        renameSync(tmpEnc, this.encFile)
      } else {
        // No encryption available, keep as-is (will be read from legacy path)
        return
      }
      unlinkSync(this.legacyFile)
      log.info('Auth: migrated session to encrypted storage')
    } catch (err) {
      log.error('Auth: migration failed', err)
    }
  }

  private load(): void {
    try {
      if (this.useEncryption && existsSync(this.encFile)) {
        const buffer = readFileSync(this.encFile)
        const raw = safeStorage.decryptString(buffer)
        this.authData = JSON.parse(raw)
      } else if (existsSync(this.legacyFile)) {
        const raw = readFileSync(this.legacyFile, 'utf-8')
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
      const json = JSON.stringify(this.authData)
      if (this.useEncryption) {
        const encrypted = safeStorage.encryptString(json)
        const tmp = this.encFile + '.tmp'
        writeFileSync(tmp, encrypted)
        renameSync(tmp, this.encFile)
      } else {
        const tmp = this.legacyFile + '.tmp'
        writeFileSync(tmp, json, 'utf-8')
        renameSync(tmp, this.legacyFile)
      }
    }
  }

  private clear(): void {
    this.authData = null
    try {
      if (existsSync(this.encFile)) unlinkSync(this.encFile)
    } catch { /* ignore */ }
    try {
      if (existsSync(this.legacyFile)) unlinkSync(this.legacyFile)
    } catch { /* ignore */ }
    this.clearCredentials()
  }

  private saveCredentials(login: string, password: string): void {
    try {
      if (!this.useEncryption) return
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true })
      const json = JSON.stringify({ login, password })
      const encrypted = safeStorage.encryptString(json)
      const tmp = this.credFile + '.tmp'
      writeFileSync(tmp, encrypted)
      renameSync(tmp, this.credFile)
    } catch (err) {
      log.error('Auth: failed to save credentials', err)
    }
  }

  private loadCredentials(): { login: string; password: string } | null {
    try {
      if (!this.useEncryption || !existsSync(this.credFile)) return null
      const buffer = readFileSync(this.credFile)
      const raw = safeStorage.decryptString(buffer)
      const parsed = JSON.parse(raw)
      if (typeof parsed?.login !== 'string' || typeof parsed?.password !== 'string') return null
      return { login: parsed.login, password: parsed.password }
    } catch {
      return null
    }
  }

  private clearCredentials(): void {
    try {
      if (existsSync(this.credFile)) unlinkSync(this.credFile)
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

  async login(login: string, password: string): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    try {
      log.info(`Auth: login attempt for ${login}`)
      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string; errorCode?: string }
        if (data.errorCode === 'desktop_token_disabled') {
          return { success: false, error: 'System token is disabled. Please enable it in Console → Tokens', errorCode: data.errorCode }
        }
        return { success: false, error: data.message || httpErrorMessage(res.status, 'Login'), errorCode: data.errorCode }
      }

      const data = await res.json() as { token: string; user: UserInfo }
      this.authData = { token: data.token, user: data.user }
      this.save()
      this.saveCredentials(login, password)
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

      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/register'), {
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
      this.saveCredentials(email, password)
      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async sendCode(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/send-code'), {
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
      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/forgot-password'), {
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
      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/change-password'), {
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

      // Update saved credentials with new password
      const creds = this.loadCredentials()
      if (creds) this.saveCredentials(creds.login, newPassword)

      return { success: true }
    } catch (err) {
      return { success: false, error: catchErrorMessage(err) }
    }
  }

  async getBalance(): Promise<{ balance: number; error?: string }> {
    // Deduplicate concurrent calls to prevent write races on save()
    if (this.balanceInFlight) return this.balanceInFlight

    this.balanceInFlight = (async () => {
      const token = this.getToken()
      if (!token) return { balance: 0, error: 'Not logged in' }

      try {
        const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/me'), {
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
    })()

    try {
      return await this.balanceInFlight
    } finally {
      this.balanceInFlight = null
    }
  }

  logout(): void {
    this.clear()
  }

  async autoLogin(): Promise<{ success: boolean; user: UserInfo | null }> {
    const creds = this.loadCredentials()
    if (!creds) return { success: false, user: null }

    log.info('Auth: attempting auto-login with saved credentials')
    try {
      const res = await fetchWithTimeout(buildApiUrl('/api/llm/desktop/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: creds.login, password: creds.password })
      })

      if (!res.ok) {
        // Only clear credentials on auth failures (wrong password / account disabled)
        // Keep credentials on transient errors (5xx, 429) so next launch can retry
        if (res.status === 401) {
          log.info(`Auth: auto-login auth failed (${res.status}), clearing saved credentials`)
          this.clearCredentials()
        } else if (res.status === 403) {
          const data = await res.json().catch(() => ({})) as { errorCode?: string }
          if (data.errorCode === 'desktop_token_disabled') {
            // Token disabled by user — keep credentials, show login screen
            log.info('Auth: auto-login failed — desktop token disabled by user')
          } else {
            // Account disabled — clear credentials
            log.info(`Auth: auto-login auth failed (403), clearing saved credentials`)
            this.clearCredentials()
          }
        } else {
          log.info(`Auth: auto-login failed (${res.status}), keeping credentials for retry`)
        }
        return { success: false, user: null }
      }

      const data = await res.json() as { token: string; user: UserInfo }
      this.authData = { token: data.token, user: data.user }
      this.save()
      // Re-save credentials to keep them fresh (login identifier may have been normalized)
      this.saveCredentials(creds.login, creds.password)
      log.info('Auth: auto-login successful')
      return { success: true, user: this.getUser() }
    } catch (err) {
      // Network error — keep credentials, user can retry next launch
      log.info('Auth: auto-login network error, keeping credentials', (err as Error).message)
      return { success: false, user: null }
    }
  }

  getStatus(): { loggedIn: boolean; user: UserInfo | null } {
    return {
      loggedIn: this.isLoggedIn(),
      user: this.getUser()
    }
  }
}
