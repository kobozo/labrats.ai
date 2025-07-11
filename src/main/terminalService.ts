import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as pty from 'node-pty';

interface TerminalSession {
  id: string;
  pid: number;
  pty: pty.IPty;
  cwd: string;
  title?: string;
  cols: number;
  rows: number;
}

export class TerminalService extends EventEmitter {
  private terminals: Map<string, TerminalSession> = new Map();
  private static instance: TerminalService;

  constructor() {
    super();
  }

  static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  async createTerminal(options: { cwd: string; cols: number; rows: number }): Promise<{ pid: number; cols: number; rows: number }> {
    const { cwd, cols, rows } = options;

    try {
      // Generate unique terminal ID
      const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine shell based on platform
      const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
      
      // Create PTY process
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: cols,
        rows: rows,
        cwd: cwd,
        env: process.env as any
      });

      const session: TerminalSession = {
        id: terminalId,
        pid: ptyProcess.pid,
        pty: ptyProcess,
        cwd,
        cols,
        rows,
        title: `Terminal ${ptyProcess.pid}`
      };

      // Handle data from PTY
      ptyProcess.onData((data) => {
        this.emit('terminal-data', ptyProcess.pid, data);
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode }) => {
        this.emit('terminal-exit', ptyProcess.pid, exitCode);
        this.terminals.delete(terminalId);
      });

      this.terminals.set(terminalId, session);

      return {
        pid: ptyProcess.pid,
        cols,
        rows
      };
    } catch (error) {
      console.error('Failed to create terminal:', error);
      throw error;
    }
  }


  writeToTerminal(pid: number, data: string): void {
    // Find session by PID
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (session && session.pty) {
      try {
        session.pty.write(data);
      } catch (error) {
        console.error('Error writing to terminal:', error);
      }
    }
  }

  resizeTerminal(pid: number, cols: number, rows: number): void {
    // Find session by PID
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (session && session.pty) {
      try {
        // Update the stored dimensions
        session.cols = cols;
        session.rows = rows;
        
        // Resize the PTY
        session.pty.resize(cols, rows);
      } catch (error) {
        console.error('Error resizing terminal:', error);
      }
    }
  }

  killTerminal(pid: number): void {
    // Find session by PID
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (session) {
      try {
        // Kill the PTY process
        if (session.pty) {
          session.pty.kill();
        }
      } catch (error) {
        console.error('Error killing terminal:', error);
      }
      this.terminals.delete(session.id);
    }
  }

  getTerminals(): TerminalSession[] {
    return Array.from(this.terminals.values());
  }

  hasTerminal(pid: number): boolean {
    return Array.from(this.terminals.values()).some(s => s.pid === pid);
  }

  async checkItermAvailability(): Promise<boolean> {
    // Not needed for integrated terminal
    return false;
  }

  async openInIterm(cwd: string): Promise<boolean> {
    // Not needed for integrated terminal
    return false;
  }

  async changeWorkingDirectory(pid: number, newCwd: string): Promise<boolean> {
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (!session || !session.pty) {
      return false;
    }

    try {
      // Send cd command to the terminal
      session.pty.write(`cd "${newCwd}"\n`);
      session.cwd = newCwd;
      return true;
    } catch (error) {
      console.error('Failed to change working directory:', error);
      return false;
    }
  }

  async getTerminalTitle(pid: number): Promise<string | null> {
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (!session) {
      return null;
    }

    return session.title || `Terminal ${pid}`;
  }

  async setTerminalTitle(pid: number, title: string): Promise<boolean> {
    const session = Array.from(this.terminals.values()).find(s => s.pid === pid);
    if (!session || !session.pty) {
      return false;
    }

    try {
      // Send title escape sequence to the terminal
      session.pty.write(`\x1b]0;${title}\x07`);
      session.title = title;
      return true;
    } catch (error) {
      console.error('Failed to set terminal title:', error);
      return false;
    }
  }

  dispose(): void {
    // Clean up all terminal sessions
    for (const [id, session] of this.terminals) {
      try {
        if (session.pty) {
          session.pty.kill();
        }
      } catch (error) {
        console.error(`Error killing terminal ${id}:`, error);
      }
    }
    this.terminals.clear();
    this.removeAllListeners();
  }
}