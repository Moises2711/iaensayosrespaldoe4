/**
 * Sync Service - Handles syncing recording metadata to backend
 * 
 * Tracks which recordings need backend sync, handles retry logic,
 * and manages periodic sync + network reconnect sync.
 */

import { recordingService } from './recordingService';

interface SyncOptions {
  apiEndpoint?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  syncIntervalMs?: number;
}

class SyncService {
  private maxRetries = 3;
  private retryDelayMs = 1000;
  private syncIntervalMs = 5 * 60 * 1000; // 5 minutes
  private syncIntervalId: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private syncCallbacks: ((status: 'pending' | 'done' | 'error') => void)[] = [];

  async init(options: SyncOptions = {}): Promise<void> {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.syncIntervalMs = options.syncIntervalMs ?? 5 * 60 * 1000;

    // Start periodic sync
    this.startPeriodicSync();

    // Listen for network changes
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.syncOnReconnect());
    }
  }

  /**
   * Register callback for sync status changes
   */
  onSyncStatusChange(callback: (status: 'pending' | 'done' | 'error') => void): void {
    this.syncCallbacks.push(callback);
  }

  /**
   * Trigger immediate sync
   */
  async syncNow(): Promise<void> {
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.notifyCallbacks('pending');

    try {
      const pendingItems = await recordingService.getPendingSyncItems();

      for (const item of pendingItems) {
        await this.syncItem(item.id);
      }

      this.notifyCallbacks('done');
    } catch (error) {
      console.error('Sync error:', error);
      this.notifyCallbacks('error');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync individual item with retry logic
   */
  private async syncItem(queueId: string): Promise<void> {
    const item = await recordingService.getPendingSyncItems().then(items =>
      items.find(i => i.id === queueId)
    );

    if (!item) return;

    // Update status to syncing
    await recordingService.updateSyncQueueItem(queueId, {
      status: 'syncing',
      lastAttemptAt: Date.now(),
    });

    try {
      // Send metadata to backend (NOT the audio file)
      const response = await fetch('/api/rehearsals/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: item.metadata.sessionId,
          transcript: item.metadata.transcript,
          confidence: item.metadata.confidence,
          duration_ms: item.metadata.duration_ms,
          userId: 'current-user', // TODO: Get from auth context
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      // Mark as synced
      await recordingService.updateSyncQueueItem(queueId, {
        status: 'done',
      });

      // Update recording as synced
      const recording = await recordingService.getRecording(item.recordingId);
      if (recording) {
        await recordingService.updateRecording(item.recordingId, {
          synced: true,
          transcript: item.metadata.transcript,
          confidence: item.metadata.confidence,
        });
      }
    } catch (error) {
      const attempts = (item.attempts ?? 0) + 1;

      if (attempts >= this.maxRetries) {
        // Max retries exceeded
        await recordingService.updateSyncQueueItem(queueId, {
          status: 'failed',
          attempts,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          lastAttemptAt: Date.now(),
        });
      } else {
        // Retry later
        await recordingService.updateSyncQueueItem(queueId, {
          status: 'pending',
          attempts,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          lastAttemptAt: Date.now(),
        });

        // Schedule retry with exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempts - 1);
        setTimeout(() => this.syncItem(queueId), delay);
      }
    }
  }

  /**
   * Start periodic sync every 5 minutes
   */
  private startPeriodicSync(): void {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);

    this.syncIntervalId = setInterval(() => {
      this.syncNow().catch(console.error);
    }, this.syncIntervalMs);
  }

  /**
   * Sync when network reconnects
   */
  private async syncOnReconnect(): Promise<void> {
    // Wait a bit for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.syncNow().catch(console.error);
  }

  /**
   * Get sync status for a recording
   */
  async getSyncStatus(recordingId: string): Promise<'pending' | 'syncing' | 'done' | 'failed' | 'unknown'> {
    const pendingItems = await recordingService.getPendingSyncItems();
    const item = pendingItems.find(i => i.recordingId === recordingId);

    if (item) {
      return item.status;
    }

    const recording = await recordingService.getRecording(recordingId);
    if (recording?.synced) {
      return 'done';
    }

    return 'unknown';
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => this.syncOnReconnect());
    }
  }

  private notifyCallbacks(status: 'pending' | 'done' | 'error'): void {
    for (const callback of this.syncCallbacks) {
      try {
        callback(status);
      } catch (e) {
        console.error('Sync callback error:', e);
      }
    }
  }
}

// Export singleton instance
export const syncService = new SyncService();
