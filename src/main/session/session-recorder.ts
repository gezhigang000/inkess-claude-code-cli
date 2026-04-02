import { appendFileSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import log from '../logger'

export interface SessionMeta {
  id: string
  ptyId: string
  cwd: string
  title: string
  createdAt: number
  closedAt?: number
  size: number
}

interface ActiveRecording {
  sessionId: string
  ptyId: string
  cwd: string
  title: string
  createdAt: number
  filePath: string
  bytesWritten: number
}

const MAX_SESSION_SIZE = 10 * 1024 * 1024 // 10MB
const MIN_SESSION_SIZE = 100 // bytes

export class SessionRecorder {
  private recordings = new Map<string, ActiveRecording>()
  private sessionsDir: string

  constructor(userDataPath: string) {
    this.sessionsDir = join(userDataPath, 'sessions')
    mkdirSync(this.sessionsDir, { recursive: true })
  }

  getSessionsDir(): string {
    return this.sessionsDir
  }

  startRecording(ptyId: string, sessionId: string, cwd: string, title: string): void {
    if (this.recordings.has(ptyId)) {
      log.warn(`[SessionRecorder] Already recording ptyId=${ptyId}, stopping previous`)
      this.stopRecording(ptyId)
    }

    const filePath = join(this.sessionsDir, `${sessionId}.jsonl`)
    const recording: ActiveRecording = {
      sessionId,
      ptyId,
      cwd,
      title,
      createdAt: Date.now(),
      filePath,
      bytesWritten: 0
    }
    this.recordings.set(ptyId, recording)
    log.info(`[SessionRecorder] Started recording ptyId=${ptyId} sessionId=${sessionId}`)
  }

  recordData(ptyId: string, data: string): void {
    const recording = this.recordings.get(ptyId)
    if (!recording) return
    if (recording.bytesWritten >= MAX_SESSION_SIZE) return

    const line = JSON.stringify({ t: Date.now(), d: data }) + '\n'
    try {
      appendFileSync(recording.filePath, line, 'utf8')
      recording.bytesWritten += Buffer.byteLength(line, 'utf8')
      if (recording.bytesWritten >= MAX_SESSION_SIZE) {
        log.warn(`[SessionRecorder] Session ${recording.sessionId} reached 10MB limit, stopping recording`)
      }
    } catch (err) {
      log.error(`[SessionRecorder] Failed to write data for ptyId=${ptyId}:`, err)
    }
  }

  recordInput(ptyId: string, data: string): void {
    const recording = this.recordings.get(ptyId)
    if (!recording) return
    if (recording.bytesWritten >= MAX_SESSION_SIZE) return

    const line = JSON.stringify({ t: Date.now(), d: data, s: 'input' }) + '\n'
    try {
      appendFileSync(recording.filePath, line, 'utf8')
      recording.bytesWritten += Buffer.byteLength(line, 'utf8')
    } catch (err) {
      log.error(`[SessionRecorder] Failed to write input for ptyId=${ptyId}:`, err)
    }
  }

  stopRecording(ptyId: string): SessionMeta | null {
    const recording = this.recordings.get(ptyId)
    if (!recording) return null

    this.recordings.delete(ptyId)

    // Get actual file size
    let actualSize = 0
    try {
      actualSize = statSync(recording.filePath).size
    } catch {
      // File may not exist if nothing was written
      return null
    }

    // Delete empty sessions
    if (actualSize < MIN_SESSION_SIZE) {
      try {
        unlinkSync(recording.filePath)
      } catch (err) {
        log.warn(`[SessionRecorder] Failed to delete empty session file:`, err)
      }
      log.info(`[SessionRecorder] Deleted empty session ${recording.sessionId} (${actualSize} bytes)`)
      return null
    }

    const meta: SessionMeta = {
      id: recording.sessionId,
      ptyId: recording.ptyId,
      cwd: recording.cwd,
      title: recording.title,
      createdAt: recording.createdAt,
      closedAt: Date.now(),
      size: actualSize
    }

    log.info(`[SessionRecorder] Stopped recording sessionId=${recording.sessionId} size=${actualSize}`)
    return meta
  }
}
