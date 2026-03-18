import * as pty from 'node-pty'
import { randomUUID } from 'crypto'
import * as os from 'os'
import log from '../logger'

interface PtySession {
  process: pty.IPty
  onDataCallbacks: ((data: string) => void)[]
  onExitCallbacks: ((exitCode: number) => void)[]
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()

  create(cwd: string, env?: Record<string, string>, command?: string, args?: string[]): string {
    const id = randomUUID()
    const shell = command || (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh')

    try {
      const ptyProcess = pty.spawn(shell, args || [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: {
          ...process.env,
          ...env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        } as Record<string, string>
      })

      const session: PtySession = {
        process: ptyProcess,
        onDataCallbacks: [],
        onExitCallbacks: []
      }

      ptyProcess.onData((data) => {
        session.onDataCallbacks.forEach((cb) => cb(data))
      })

      ptyProcess.onExit(({ exitCode }) => {
        session.onExitCallbacks.forEach((cb) => cb(exitCode))
        this.sessions.delete(id)
      })

      this.sessions.set(id, session)
      return id
    } catch (err) {
      log.error(`PTY spawn failed for shell="${shell}" cwd="${cwd}":`, err)
      throw new Error(`Failed to create terminal: ${(err as Error).message}`)
    }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.process.resize(cols, rows)
  }

  kill(id: string): void {
    this.sessions.get(id)?.process.kill()
    this.sessions.delete(id)
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }

  onData(id: string, callback: (data: string) => void): void {
    this.sessions.get(id)?.onDataCallbacks.push(callback)
  }

  onExit(id: string, callback: (exitCode: number) => void): void {
    this.sessions.get(id)?.onExitCallbacks.push(callback)
  }
}
