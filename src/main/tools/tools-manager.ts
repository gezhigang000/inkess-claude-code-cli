import { app } from 'electron'
import { join, delimiter, dirname } from 'path'
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  unlinkSync,
  readFileSync,
  chmodSync
} from 'fs'
import { execSync } from 'child_process'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import * as os from 'os'
import log from '../logger'
import {
  TOOLS_MIRROR_BASE_URL,
  TOOL_DEFINITIONS,
  type ToolName,
  type ToolDef,
  type RemoteManifest
} from './tools-manifest'

interface ToolStatus {
  installed: boolean
  path: string | null
  version: string | null
}

export type ToolsInfo = Record<ToolName, ToolStatus>

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

export class ToolsManager {
  private toolsDir: string
  private platformKey: string

  constructor() {
    this.toolsDir = join(app.getPath('userData'), 'tools')
    this.platformKey = `${os.platform()}-${os.arch()}`
  }

  /** Which tools are needed on this platform */
  private getRequiredTools(): ToolDef[] {
    return TOOL_DEFINITIONS.filter((t) => t.platforms.includes(this.platformKey))
  }

  /** Get the absolute binary path for a tool */
  private getBinPath(tool: ToolDef): string | null {
    const rel = tool.binPath[this.platformKey]
    if (!rel) return null
    return join(this.toolsDir, rel)
  }

  /** Check status of all tools for this platform */
  getInfo(): ToolsInfo {
    const info: Partial<ToolsInfo> = {}
    for (const def of TOOL_DEFINITIONS) {
      const binPath = this.getBinPath(def)
      if (!binPath || !def.platforms.includes(this.platformKey)) {
        info[def.name] = { installed: true, path: null, version: 'system' }
        continue
      }
      const installed = existsSync(binPath)
      let version: string | null = null
      if (installed) {
        try {
          const raw = execSync(`"${binPath}" ${def.verifyCommand.join(' ')}`, {
            timeout: 5000,
            encoding: 'utf-8'
          }).trim()
          const match = raw.match(/[\d.]+/)
          version = match ? match[0] : raw
        } catch {
          // binary exists but can't verify
        }
      }
      info[def.name] = { installed, path: binPath, version }
    }
    return info as ToolsInfo
  }

  /** Check if all required tools are installed */
  isAllInstalled(): boolean {
    const required = this.getRequiredTools()
    for (const def of required) {
      const binPath = this.getBinPath(def)
      if (binPath && !existsSync(binPath)) return false
    }
    return true
  }

  /**
   * Install all missing tools.
   * onProgress reports (step description, 0..1 overall progress)
   */
  async install(
    onProgress?: (step: string, progress: number) => void
  ): Promise<void> {
    if (!existsSync(this.toolsDir)) {
      mkdirSync(this.toolsDir, { recursive: true })
    }

    const required = this.getRequiredTools()
    const missing = required.filter((def) => {
      const binPath = this.getBinPath(def)
      return binPath && !existsSync(binPath)
    })

    if (missing.length === 0) {
      onProgress?.('All tools ready', 1.0)
      return
    }

    // Fetch remote manifest
    onProgress?.('Fetching tool manifest...', 0.05)
    const manifestRes = await fetchWithTimeout(
      `${TOOLS_MIRROR_BASE_URL}/manifest.json`
    )
    if (!manifestRes.ok) {
      throw new Error('Failed to fetch dev tools manifest')
    }
    const manifest: RemoteManifest = await manifestRes.json()

    // Install each missing tool
    for (let i = 0; i < missing.length; i++) {
      const def = missing[i]
      const baseProgress = i / missing.length
      const sliceSize = 1 / missing.length

      const toolManifest = manifest.tools[def.name]
      if (!toolManifest) {
        log.warn(`Tools: no manifest entry for ${def.name}, skipping`)
        continue
      }
      const platInfo = toolManifest.platforms[this.platformKey]
      if (!platInfo) {
        log.warn(
          `Tools: no platform ${this.platformKey} for ${def.name}, skipping`
        )
        continue
      }

      await this.installTool(
        def,
        toolManifest.version,
        platInfo,
        (step, pct) => {
          onProgress?.(step, baseProgress + pct * sliceSize)
        }
      )
    }

    onProgress?.('Development tools ready', 1.0)
  }

  private async installTool(
    def: ToolDef,
    version: string,
    platInfo: { archive: string; checksum: string; size: number },
    onProgress: (step: string, progress: number) => void
  ): Promise<void> {
    const archiveUrl = `${TOOLS_MIRROR_BASE_URL}/${def.name}/${version}/${this.platformKey}/${platInfo.archive}`

    onProgress(`Downloading ${def.displayName} v${version}...`, 0.1)
    log.info(`Tools: downloading ${archiveUrl}`)

    const res = await fetchWithTimeout(archiveUrl, {}, 600000) // 10min timeout
    if (!res.ok || !res.body) {
      throw new Error(
        `Failed to download ${def.displayName} (HTTP ${res.status})`
      )
    }

    // Download to temp file
    const archiveExt = platInfo.archive.endsWith('.zip') ? '.zip' : '.tar.gz'
    const tmpPath = join(this.toolsDir, `${def.name}${archiveExt}.tmp`)

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
        const pct = Math.min(0.1 + (downloaded / totalSize) * 0.6, 0.7)
        onProgress(
          `Downloading ${def.displayName}... ${((downloaded / totalSize) * 100).toFixed(0)}%`,
          pct
        )
        controller.enqueue(value)
      }
    })

    const fileStream = createWriteStream(tmpPath)
    await pipeline(Readable.fromWeb(progressStream as any), fileStream)

    // Verify checksum
    onProgress(`Verifying ${def.displayName}...`, 0.72)
    const actual = sha256File(tmpPath)
    if (actual !== platInfo.checksum) {
      unlinkSync(tmpPath)
      throw new Error(
        `${def.displayName} checksum mismatch: expected ${platInfo.checksum}, got ${actual}`
      )
    }
    log.info(`Tools: ${def.name} checksum verified`)

    // Extract
    onProgress(`Extracting ${def.displayName}...`, 0.75)
    const extractDir = join(this.toolsDir, def.name)
    if (!existsSync(extractDir)) {
      mkdirSync(extractDir, { recursive: true })
    }

    if (archiveExt === '.zip') {
      // Use system unzip (available on Windows via PowerShell and macOS)
      if (os.platform() === 'win32') {
        execSync(
          `powershell -NoProfile -Command "Expand-Archive -Force -Path '${tmpPath}' -DestinationPath '${extractDir}'"`,
          { timeout: 120000 }
        )
      } else {
        execSync(`unzip -o -q "${tmpPath}" -d "${extractDir}"`, {
          timeout: 120000
        })
      }
    } else {
      // tar.gz
      execSync(`tar -xzf "${tmpPath}" -C "${extractDir}"`, {
        timeout: 120000
      })
    }

    unlinkSync(tmpPath)

    // Set executable permission on unix
    if (os.platform() !== 'win32') {
      const binPath = this.getBinPath(def)
      if (binPath && existsSync(binPath)) {
        chmodSync(binPath, 0o755)
      }
    }

    // macOS: clear quarantine
    if (os.platform() === 'darwin') {
      try {
        execSync(`xattr -cr "${extractDir}"`, { timeout: 10000 })
        log.info(`Tools: cleared quarantine for ${def.name}`)
      } catch {
        log.warn(`Tools: failed to clear quarantine for ${def.name} (non-fatal)`)
      }
    }

    // Verify
    onProgress(`Verifying ${def.displayName} installation...`, 0.9)
    const binPath = this.getBinPath(def)
    if (binPath) {
      try {
        execSync(`"${binPath}" ${def.verifyCommand.join(' ')}`, {
          timeout: 10000
        })
        log.info(`Tools: ${def.name} verified successfully`)
      } catch (err) {
        log.error(`Tools: ${def.name} verification failed:`, err)
        throw new Error(
          `${def.displayName} installation verification failed. Please try again.`
        )
      }
    }

    onProgress(`${def.displayName} ready`, 1.0)
  }

  /**
   * Returns PATH-prepend entries for all installed tools.
   * These directories should be prepended to PATH in PTY env.
   */
  getEnvPatch(): Record<string, string> {
    const dirs: string[] = []
    for (const def of this.getRequiredTools()) {
      const binPath = this.getBinPath(def)
      if (binPath && existsSync(binPath)) {
        dirs.push(dirname(binPath))
      }
    }
    if (dirs.length === 0) return {}

    const currentPath = process.env.PATH || ''
    return {
      PATH: dirs.join(delimiter) + delimiter + currentPath
    }
  }
}
