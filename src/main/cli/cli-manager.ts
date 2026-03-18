import { app } from 'electron'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  chmodSync,
  createWriteStream,
  unlinkSync,
  readFileSync,
  renameSync,
  copyFileSync
} from 'fs'
import { execSync } from 'child_process'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import * as os from 'os'
import log from '../logger'

const MIRROR_BASE_URL =
  'https://inkess-install-file.oss-cn-beijing.aliyuncs.com/cli-mirror'

interface Manifest {
  version: string
  buildDate: string
  platforms: Record<
    string,
    { binary: string; checksum: string; size: number }
  >
}

interface CliInfo {
  installed: boolean
  path: string
  version: string | null
}

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  )
}

function sha256File(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

export class CliManager {
  private cliDir: string
  private binaryPath: string

  constructor() {
    this.cliDir = join(app.getPath('userData'), 'cli')
    const binaryName = os.platform() === 'win32' ? 'claude.exe' : 'claude'
    this.binaryPath = join(this.cliDir, binaryName)
  }

  getInfo(): CliInfo {
    const installed = existsSync(this.binaryPath)
    let version: string | null = null
    if (installed) {
      try {
        version = execSync(`"${this.binaryPath}" --version`, {
          timeout: 5000,
          encoding: 'utf-8'
        }).trim()
      } catch {
        // binary exists but can't get version
      }
    }
    return { installed, path: this.binaryPath, version }
  }

  getBinaryPath(): string {
    return this.binaryPath
  }

  isInstalled(): boolean {
    return existsSync(this.binaryPath)
  }

  async checkUpdate(): Promise<{
    available: boolean
    latestVersion: string | null
  }> {
    try {
      const res = await fetchWithTimeout(`${MIRROR_BASE_URL}/latest`)
      if (!res.ok) return { available: false, latestVersion: null }

      const latestVersion = (await res.text()).trim()
      const currentInfo = this.getInfo()

      if (!currentInfo.version)
        return { available: true, latestVersion }

      return {
        available: latestVersion !== currentInfo.version,
        latestVersion
      }
    } catch {
      return { available: false, latestVersion: null }
    }
  }

  async install(
    onProgress?: (step: string, progress: number) => void
  ): Promise<void> {
    if (!existsSync(this.cliDir)) {
      mkdirSync(this.cliDir, { recursive: true })
    }

    const platform = os.platform()
    const arch = os.arch()
    const platformKey = `${platform}-${arch}`

    onProgress?.('Checking latest version...', 0.05)

    // Fetch latest version
    const latestRes = await fetchWithTimeout(`${MIRROR_BASE_URL}/latest`)
    if (!latestRes.ok) {
      throw new Error('Failed to check latest CLI version')
    }
    const version = (await latestRes.text()).trim()
    log.info(`CLI: latest version is ${version}`)

    // Fetch manifest
    onProgress?.('Fetching manifest...', 0.1)
    const manifestRes = await fetchWithTimeout(
      `${MIRROR_BASE_URL}/${version}/manifest.json`
    )
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest for version ${version}`)
    }
    const manifest: Manifest = await manifestRes.json()

    const platInfo = manifest.platforms[platformKey]
    if (!platInfo) {
      throw new Error(`Your system (${platformKey}) is not supported yet`)
    }

    // Download binary
    const binaryUrl = `${MIRROR_BASE_URL}/${version}/${platformKey}/${platInfo.binary}`
    onProgress?.(`Downloading Claude Code CLI v${version}...`, 0.2)
    log.info(`CLI: downloading ${binaryUrl}`)

    const res = await fetchWithTimeout(binaryUrl, {}, 300000) // 5min for large binary
    if (!res.ok || !res.body) {
      throw new Error(
        `Download failed (HTTP ${res.status}). Please try again later.`
      )
    }

    const tmpPath = this.binaryPath + '.tmp'
    const fileStream = createWriteStream(tmpPath)

    // Track download progress
    const totalSize = platInfo.size
    let downloaded = 0
    const reader = res.body.getReader()
    const progressStream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        downloaded += value.byteLength
        const pct = Math.min(0.2 + (downloaded / totalSize) * 0.6, 0.8)
        onProgress?.(
          `Downloading... ${((downloaded / totalSize) * 100).toFixed(0)}%`,
          pct
        )
        controller.enqueue(value)
      }
    })

    await pipeline(Readable.fromWeb(progressStream as any), fileStream)

    // Verify sha256 checksum
    onProgress?.('Verifying checksum...', 0.82)
    const actual = sha256File(tmpPath)
    if (actual !== platInfo.checksum) {
      unlinkSync(tmpPath)
      throw new Error(
        `Checksum mismatch: expected ${platInfo.checksum}, got ${actual}`
      )
    }
    log.info('CLI: checksum verified')

    // Move to final path
    renameSync(tmpPath, this.binaryPath)

    // Set executable permission on unix
    if (platform !== 'win32') {
      chmodSync(this.binaryPath, 0o755)
    }

    // macOS: clear quarantine attribute
    if (platform === 'darwin') {
      try {
        execSync(`xattr -cr "${this.binaryPath}"`, { timeout: 5000 })
        log.info('CLI: cleared quarantine attribute')
      } catch {
        log.warn('CLI: failed to clear quarantine attribute (non-fatal)')
      }
    }

    onProgress?.('Verifying installation...', 0.9)

    try {
      execSync(`"${this.binaryPath}" --version`, { timeout: 10000 })
    } catch (verifyErr) {
      log.error('CLI: binary verification failed:', verifyErr)
      if (existsSync(this.binaryPath)) {
        unlinkSync(this.binaryPath)
      }
      throw new Error(
        'CLI installation verification failed. The downloaded file may be corrupted — please try again.'
      )
    }

    onProgress?.('Installation complete', 1.0)
  }

  async update(
    onProgress?: (step: string, progress: number) => void
  ): Promise<void> {
    const backupPath = this.binaryPath + '.bak'
    if (existsSync(this.binaryPath)) {
      copyFileSync(this.binaryPath, backupPath)
    }

    try {
      await this.install(onProgress)
      if (existsSync(backupPath)) {
        unlinkSync(backupPath)
      }
    } catch (err) {
      if (existsSync(backupPath)) {
        copyFileSync(backupPath, this.binaryPath)
        unlinkSync(backupPath)
      }
      throw err
    }
  }
}
