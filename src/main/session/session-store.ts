import fs from 'fs'
import path from 'path'
import readline from 'readline'
import log from '../logger'
import type { SessionMeta } from './session-recorder'

const INDEX_FILE = 'index.json'
const MAX_STORAGE_BYTES = 500 * 1024 * 1024 // 500MB
const MAX_QUERY_LENGTH = 500
const ANSI_REGEX = /\x1B\[[0-9;]*[A-Za-z]/g
const VALID_SESSION_ID = /^[a-zA-Z0-9_-]{1,128}$/

export class SessionStore {
  private sessionsDir: string
  private index: SessionMeta[]

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir
    this.index = this.loadIndex()
    this.enforceStorageLimit()
    this.saveIndex()
  }

  /** Validate session ID and return safe file path, or null if invalid */
  private safeSessionPath(id: string): string | null {
    if (!VALID_SESSION_ID.test(id)) return null
    const resolved = path.resolve(this.sessionsDir, `${id}.jsonl`)
    if (!resolved.startsWith(path.resolve(this.sessionsDir) + path.sep)) return null
    return resolved
  }

  private indexPath(): string {
    return path.join(this.sessionsDir, INDEX_FILE)
  }

  private loadIndex(): SessionMeta[] {
    try {
      const raw = fs.readFileSync(this.indexPath(), 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private saveIndex(): void {
    const tmp = this.indexPath() + '.tmp'
    try {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(this.index), 'utf-8')
      fs.renameSync(tmp, this.indexPath())
    } catch (err) {
      log.error('[SessionStore] Failed to save index:', err)
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  private enforceStorageLimit(): void {
    let totalSize = 0
    for (const meta of this.index) {
      totalSize += meta.size ?? 0
    }
    // Remove oldest sessions (end of array = oldest, since we keep newest first)
    while (totalSize > MAX_STORAGE_BYTES && this.index.length > 0) {
      const oldest = this.index[this.index.length - 1]
      totalSize -= oldest.size ?? 0
      this.index.pop()
      const filePath = this.safeSessionPath(oldest.id)
      if (filePath) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (err) {
          log.warn('[SessionStore] Failed to delete old session file:', err)
        }
      }
    }
  }

  addSession(meta: SessionMeta): void {
    // Dedup by id
    this.index = this.index.filter((m) => m.id !== meta.id)
    // Newest first
    this.index.unshift(meta)
    this.enforceStorageLimit()
    this.saveIndex()
  }

  listSessions(): SessionMeta[] {
    return [...this.index]
  }

  getSession(id: string): SessionMeta | null {
    return this.index.find((m) => m.id === id) ?? null
  }

  async readSession(id: string): Promise<Array<{ t: number; d: string; s?: string }>> {
    const filePath = this.safeSessionPath(id)
    if (!filePath || !fs.existsSync(filePath)) {
      return []
    }

    const results: Array<{ t: number; d: string; s?: string }> = []
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        results.push(JSON.parse(trimmed))
      } catch {
        // skip malformed lines
      }
    }

    return results
  }

  deleteSession(id: string): void {
    const filePath = this.safeSessionPath(id)
    if (!filePath) return
    this.index = this.index.filter((m) => m.id !== id)
    this.saveIndex()
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      log.warn('[SessionStore] Failed to delete session file:', err)
    }
  }

  clearAll(): void {
    for (const meta of this.index) {
      const filePath = this.safeSessionPath(meta.id)
      if (!filePath) continue
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (err) {
        log.warn('[SessionStore] Failed to delete session file during clearAll:', err)
      }
    }
    this.index = []
    this.saveIndex()
  }

  async searchSessions(query: string): Promise<Array<{ id: string; matches: number }>> {
    if (!query || query.length > MAX_QUERY_LENGTH) return []
    const lowerQuery = query.toLowerCase()
    const results: Array<{ id: string; matches: number }> = []

    for (const meta of this.index) {
      try {
        const lines = await this.readSession(meta.id)
        let matches = 0
        for (const entry of lines) {
          const text = entry.d.replace(ANSI_REGEX, '').toLowerCase()
          let pos = 0
          while ((pos = text.indexOf(lowerQuery, pos)) !== -1) {
            matches++
            pos += lowerQuery.length
          }
        }
        if (matches > 0) {
          results.push({ id: meta.id, matches })
        }
      } catch (err) {
        log.warn(`[SessionStore] Failed to search session ${meta.id}:`, err)
      }
    }

    return results.sort((a, b) => b.matches - a.matches)
  }
}
