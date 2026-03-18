import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

// Mock logger
vi.mock('@main/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { AuthManager } from '@main/auth/auth-manager'
import { existsSync, readFileSync } from 'fs'

describe('AuthManager', () => {
  let auth: AuthManager

  beforeEach(() => {
    vi.clearAllMocks()
    auth = new AuthManager()
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
    it('clears auth data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'tok',
          user: { id: 1, email: 'a@b.com', username: 'a', balance: 0 },
        }),
      })
      await auth.login('a@b.com', 'pass')
      expect(auth.isLoggedIn()).toBe(true)

      auth.logout()
      expect(auth.isLoggedIn()).toBe(false)
      expect(auth.getToken()).toBeNull()
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