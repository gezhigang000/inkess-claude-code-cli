import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
}))

// Mock fs
const mockExistsSync = vi.fn(() => false)
vi.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(() => ({ on: vi.fn() })),
}))

// Mock child_process
const mockExecFileSync = vi.fn()
vi.mock('child_process', () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
}))

// Mock stream/promises
vi.mock('stream/promises', () => ({
  pipeline: vi.fn(async () => {}),
}))

// Mock logger
vi.mock('@main/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { CliManager } from '@main/cli/cli-manager'

describe('CliManager', () => {
  let cli: CliManager

  beforeEach(() => {
    vi.clearAllMocks()
    cli = new CliManager()
  })

  describe('getInfo', () => {
    it('returns not installed when binary missing', () => {
      mockExistsSync.mockReturnValue(false)
      const info = cli.getInfo()
      expect(info.installed).toBe(false)
      expect(info.version).toBeNull()
    })

    it('returns installed with version', () => {
      // Return true for binary path, false for marker — forces version check via execFileSync
      mockExistsSync.mockImplementation((p: string) => !String(p).endsWith('.installed'))
      mockExecFileSync.mockReturnValue('1.0.5\n')
      const info = cli.getInfo()
      expect(info.installed).toBe(true)
      expect(info.version).toBe('1.0.5')
    })
  })

  describe('checkUpdate', () => {
    it('returns available when versions differ', async () => {
      // Force version check path (no marker)
      mockExistsSync.mockImplementation((p: string) => !String(p).endsWith('.installed'))
      mockExecFileSync.mockReturnValue('1.0.0\n')
      // checkUpdate calls fetchWithTimeout which returns res.text()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '1.1.0',
      })
      // Need a fresh instance to avoid cached info
      const freshCli = new CliManager()
      const result = await freshCli.checkUpdate()
      expect(result.available).toBe(true)
      expect(result.latestVersion).toBe('1.1.0')
    })

    it('returns not available on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await cli.checkUpdate()
      expect(result.available).toBe(false)
      expect(result.latestVersion).toBeNull()
    })
  })

  describe('isInstalled', () => {
    it('returns false when binary missing', () => {
      mockExistsSync.mockReturnValue(false)
      expect(cli.isInstalled()).toBe(false)
    })

    it('returns true when binary exists', () => {
      mockExistsSync.mockReturnValue(true)
      expect(cli.isInstalled()).toBe(true)
    })
  })
})