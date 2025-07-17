import * as fs from 'fs';
import { unifiedFileWatcher } from './unified-file-watcher-service';

/**
 * Adapter to help migrate from fs.FSWatcher to unified file watcher
 * This allows gradual migration of existing code
 */
export class FileWatcherAdapter {
  /**
   * Check if unified file watcher should be used based on environment or feature flag
   */
  static shouldUseUnifiedWatcher(): boolean {
    // For now, enable unified watcher for code vectorization only
    // TODO: Gradually enable for other services
    return process.env.USE_UNIFIED_WATCHER === 'true' || false;
  }

  /**
   * Create a watcher that delegates to either fs.watch or unified watcher
   */
  static createWatcher(
    path: string,
    options: { recursive?: boolean },
    listener: (eventType: string, filename: string | null) => void
  ): fs.FSWatcher | { close: () => void } {
    if (this.shouldUseUnifiedWatcher()) {
      // Create a fake FSWatcher interface that uses unified watcher
      const subscriberId = `fs-adapter-${Date.now()}-${Math.random()}`;
      
      unifiedFileWatcher.subscribe(
        subscriberId,
        ['**/*'], // Watch all files
        (event) => {
          const filename = event.filePath.substring(event.filePath.lastIndexOf('/') + 1);
          const eventType = event.type === 'unlink' ? 'rename' : 'change';
          listener(eventType, filename);
        }
      );

      // Return an object with close method
      return {
        close: () => {
          unifiedFileWatcher.unsubscribe(subscriberId);
        }
      };
    } else {
      // Use traditional fs.watch
      return fs.watch(path, options, listener);
    }
  }
}