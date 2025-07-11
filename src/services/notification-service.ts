export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';
  private isSupported = false;

  private constructor() {
    this.checkSupport();
    this.requestPermission();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private checkSupport(): void {
    this.isSupported = 'Notification' in window;
    if (!this.isSupported) {
      console.warn('[NOTIFICATION] Browser notifications not supported');
    }
  }

  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      console.warn('[NOTIFICATION] Cannot request permission - notifications not supported');
      return 'denied';
    }

    try {
      this.permission = await Notification.requestPermission();
      console.log(`[NOTIFICATION] Permission status: ${this.permission}`);
      return this.permission;
    } catch (error) {
      console.error('[NOTIFICATION] Error requesting permission:', error);
      this.permission = 'denied';
      return 'denied';
    }
  }

  public async showNotification(options: NotificationOptions): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('[NOTIFICATION] Cannot show notification - not supported');
      return false;
    }

    if (this.permission !== 'granted') {
      console.warn('[NOTIFICATION] Cannot show notification - permission not granted');
      // Try to request permission again
      await this.requestPermission();
    }
    
    if (this.permission !== 'granted') {
      console.warn('[NOTIFICATION] Permission denied or not granted');
      return false;
    }

    try {
      const notification = new window.Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
        silent: false,
        requireInteraction: true // Keep notification visible until user interacts
      });

      // Add click handler if provided
      if (options.onClick) {
        notification.onclick = () => {
          options.onClick!();
          notification.close();
        };
      }

      // Auto-close after 10 seconds if no interaction
      setTimeout(() => {
        notification.close();
      }, 10000);

      console.log(`[NOTIFICATION] Notification shown: ${options.title}`);
      return true;
    } catch (error) {
      console.error('[NOTIFICATION] Error showing notification:', error);
      return false;
    }
  }

  public showAgentWaitingNotification(agentName: string, agentMessage: string): Promise<boolean> {
    return this.showNotification({
      title: `${agentName} needs your input`,
      body: agentMessage.substring(0, 100) + (agentMessage.length > 100 ? '...' : ''),
      icon: this.getAgentIcon(agentName),
      tag: 'agent-waiting',
      onClick: () => {
        // Focus the main window when notification is clicked
        this.focusMainWindow();
      }
    });
  }

  public showGenericAgentNotification(title: string, message: string): Promise<boolean> {
    return this.showNotification({
      title,
      body: message,
      icon: '/src/renderer/assets/labrats-icon.png',
      tag: 'agent-notification',
      onClick: () => {
        this.focusMainWindow();
      }
    });
  }

  private getAgentIcon(agentName: string): string {
    // Map agent names to their icons
    const agentIcons: Record<string, string> = {
      'cortex': '/src/renderer/assets/avatars/cortex.webp',
      'ziggy': '/src/renderer/assets/avatars/ziggy.webp',
      'scratchy': '/src/renderer/assets/avatars/scratchy.webp',
      'patchy': '/src/renderer/assets/avatars/patchy.webp',
      'shiny': '/src/renderer/assets/avatars/shiny.webp',
      'nestor': '/src/renderer/assets/avatars/nestor.webp',
      'clawsy': '/src/renderer/assets/avatars/clawsy.webp',
      'quill': '/src/renderer/assets/avatars/quill.webp',
      'sketchy': '/src/renderer/assets/avatars/sketchy.webp'
    };

    return agentIcons[agentName.toLowerCase()] || '/src/renderer/assets/labrats-icon.png';
  }

  private focusMainWindow(): void {
    // Focus the main window when notification is clicked
    try {
      // Use the exposed electron API to focus the window
      if (window.electronAPI && window.electronAPI.focusWindow) {
        window.electronAPI.focusWindow();
      } else {
        // Fallback to basic window focus
        window.focus();
      }
    } catch (error) {
      console.log('[NOTIFICATION] Could not focus window:', error);
    }
  }

  public getPermissionStatus(): NotificationPermission {
    return this.permission;
  }

  public isNotificationSupported(): boolean {
    return this.isSupported;
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();