/**
 * Command Approval Handler
 * Manages allowed commands and approval dialog
 */

import { dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';

interface AllowedCommand {
  cmd: string;
  addedAt: Date;
}

export class CommandApprovalManager {
  private store: Store;
  private allowedCommands: Set<string>;

  constructor() {
    this.store = new Store({ name: 'mcp-allowed-commands' });
    this.allowedCommands = new Set((this.store as any).get('allowedCommands', []) as string[]);
    
    // Add default allowed commands
    const defaults = [
      'npm test',
      'npm run build',
      'npm run lint',
      'npm run typecheck',
      'git status',
      'git diff',
      'git log --oneline -10',
      'ls',
      'pwd',
    ];
    
    defaults.forEach(cmd => this.allowedCommands.add(cmd));
  }

  isAllowed(cmd: string): boolean {
    return this.allowedCommands.has(cmd);
  }

  async requestApproval(cmd: string, cwd: string): Promise<boolean> {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      return false;
    }

    const result = await dialog.showMessageBox(focusedWindow, {
      type: 'warning',
      title: 'Command Approval Required',
      message: 'The AI wants to execute a command',
      detail: `Command: ${cmd}\nDirectory: ${cwd}\n\nDo you want to allow this command?`,
      buttons: ['Cancel', 'Run Once', 'Always Allow'],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response === 1) {
      // Run once
      return true;
    } else if (result.response === 2) {
      // Always allow
      this.addAllowedCommand(cmd);
      return true;
    }

    return false;
  }

  addAllowedCommand(cmd: string): void {
    this.allowedCommands.add(cmd);
    (this.store as any).set('allowedCommands', Array.from(this.allowedCommands));
  }

  removeAllowedCommand(cmd: string): void {
    this.allowedCommands.delete(cmd);
    (this.store as any).set('allowedCommands', Array.from(this.allowedCommands));
  }

  getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }
}

export const commandApprovalManager = new CommandApprovalManager();