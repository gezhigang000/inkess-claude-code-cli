import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`ENC:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('ENC:', '')),
  },
}))

// Mock fs
const mockExistsSync = vi.fn(() => false)
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockRenameSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
  renameSync: (...args: any[]) => mockRenameSync(...args),
}))

// Mock logger
vi.mock('@main/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { AuthManager } from '@main/auth/auth-manager'
import { safeStorage } from 'electron'

describe('AuthManager', () => {
  let auth: AuthManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
    auth = new AuthManager()
  })

  describe('encrypted storage', () => {
    it('saves encrypted data when safeStorage is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          user: { id: 1, email: 'test@test.com', username: 'test', balance: 100 },
        }),
      })

      await auth.login('test@test.com', 'password')

      expect(safeStorage.encryptString).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session.enc'),
        expect.any(Buffer)
      )
    })

    it('loads encrypted data on construction', () => {
      const authData = { token: 'tok', user: { id: 1, email: 'a@b.com', username: 'a', balance: 0 } }
      const encrypted = Buffer.from(`ENC:${JSON.stringify(authData)}`)

      mockExistsSync.mockImplementation((path: string) =>
        typeof path === 'string' && path.endsWith('session.enc')
      )
      mockReadFileSync.mockReturnValue(encrypted)

      const mgr = new AuthManager()
      expect(safeStorage.decryptString).toHaveBeenCalledWith(encrypted)
      expect(mgr.isLoggedIn()).toBe(true)
      expect(mgr.getToken()).toBe('tok')
    })
  })

  describe('migration', () => {
    it('migrates legacy session.json to session.enc', () => {
      const authData = { token: 'old-tok', user: { id: 1, email: 'a@b.com', username: 'a', balance: 0 } }
      const json = JSON.stringify(authData)

      mockExistsSync.mockImplementation((path: string) =>
        typeof path === 'string' && path.endsWith('session.json')
      )
      mockReadFileSync.mockReturnValue(json)

      new AuthManager()

      expect(safeStorage.encryptString).toHaveBeenCalledWith(json)
      // Atomic write: writes to .tmp then renames
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session.enc.tmp'),
        expect.any(Buffer)
      )
      expect(mockRenameSync).toHaveBeenCalledWith(
        expect.stringContaining('session.enc.tmp'),
        expect.stringContaining('session.enc')
      )
      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('session.json'))
    })

    it('removes legacy file if enc already exists', () => {
      mockExistsSync.mockReturnValue(true) // both files exist

      new AuthManager()

      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('session.json'))
    })
  })

  describe('fallback (no encryption)', () => {
    it('saves plaintext when safeStorage unavailable', async () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      auth = new AuthManager()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          user: { id: 1, email: 'test@test.com', username: 'test', balance: 100 },
        }),
      })

      await auth.login('test@test.com', 'password')

      expect(safeStorage.encryptString).not.toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session.json'),
        expect.any(String),
        'utf-8'
      )
    })

    it('loads plaintext when safeStorage unavailable', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      const authData = { token: 'tok', user: { id: 1, email: 'a@b.com', username: 'a', balance: 0 } }

      mockExistsSync.mockImplementation((path: string) =>
        typeof path === 'string' && path.endsWith('session.json')
      )
      mockReadFileSync.mockReturnValue(JSON.stringify(authData))

      const mgr = new AuthManager()
      expect(mgr.isLoggedIn()).toBe(true)
    })
  })

  describe('login', () => {
    it('returns success with valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          user: { id: 1, email: 'test@test.com', username: 'test', balance: 100 },
        }),
      })

      const result = await auth.login('test@test.com', 'password')
      expect(result.success).toBe(true)
    })

    it('returns error with invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid credentials' }),
      })

      const result = await auth.login('bad@test.com', 'wrong')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')
    })

    it('returns error on network timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'))

      const result = await auth.login('test@test.com', 'password')
      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    })
  })

  describe('register', () => {
    it('returns success with valid data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'new-token',
          user: { id: 2, email: 'new@test.com', username: 'new', balance: 0 },
        }),
      })

      const result = await auth.register('new@test.com', 'pass', '123456')
      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Email already exists' }),
      })

      const result = await auth.register('dup@test.com', 'pass', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email already exists')
    })
  })

  describe('getBalance', () => {
    it('returns 0 when not logged in', async () => {
      const result = await auth.getBalance()
      expect(result.balance).toBe(0)
      expect(result.error).toBe('Not logged in')
    })

    it('returns balance when logged in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'tok',
          user: { id: 1, email: 'a@b.com', username: 'a', balance: 50 },
        }),
      })
      await auth.login('a@b.com', 'pass')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: 99.5 }),
      })
      const result = await auth.getBalance()
      expect(result.balance).toBe(99.5)
    })
  })

  describe('logout', () => {
    it('clears auth data and removes files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'tok',
          user: { id: 1, email: 'a@b.com', username: 'a', balance: 0 },
        }),
      })
      await auth.login('a@b.com', 'pass')
      expect(auth.isLoggedIn()).toBe(true)

      mockExistsSync.mockReturnValue(true)
      auth.logout()
      expect(auth.isLoggedIn()).toBe(false)
      expect(auth.getToken()).toBeNull()
      // Should attempt to remove both enc and json files
      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('session.enc'))
      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('session.json'))
    })
  })

  describe('changePassword', () => {
    it('rejects when not logged in', async () => {
      const result = await auth.changePassword('old', 'new')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not logged in')
    })
  })
})
