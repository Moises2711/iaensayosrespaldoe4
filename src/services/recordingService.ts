/**
 * Recording Service - IndexedDB wrapper for audio storage
 * 
 * Handles all IndexedDB operations for storing audio Blobs and recording metadata.
 * No Base64 encoding - stores Blobs natively for instant access.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface Recording extends Record<string, any> {
  id: string;
  sessionId: string;
  userId: string;
  audioBlob: Blob;
  audioFormat: string;
  duration_ms: number;
  transcript?: string;
  confidence?: number;
  created_at: number; // timestamp
  synced: boolean;
  syncAttempts: number;
}

interface SyncQueueItem extends Record<string, any> {
  id: string;
  recordingId: string;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  attempts: number;
  lastError?: string;
  lastAttemptAt?: number;
  metadata: {
    sessionId: string;
    transcript: string;
    duration_ms: number;
    confidence?: number;
  };
}

interface RehearsalsDB extends DBSchema {
  recordings: {
    key: string;
    value: Recording;
    indexes: { 'sessionId': string; 'created_at': number };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'status': string };
  };
}

const DB_NAME = 'rehearsals';
const DB_VERSION = 1;

class RecordingService {
  private db: IDBPDatabase<RehearsalsDB> | null = null;

  /**
   * Initialize IndexedDB database on first use
   * Creates object stores automatically if they don't exist
   */
  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<RehearsalsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create recordings store
        if (!db.objectStoreNames.contains('recordings')) {
          const recordingsStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingsStore.createIndex('sessionId', 'sessionId');
          recordingsStore.createIndex('created_at', 'created_at');
        }

        // Create sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('status', 'status');
        }
      },
    });
  }

  /**
   * Save audio recording to IndexedDB
   * Stores Blob directly (no Base64 encoding)
   * 
   * @returns recordingId for tracking
   */
  async saveRecording(options: {
    sessionId: string;
    userId: string;
    audioBlob: Blob;
    audioFormat?: string;
    durationMs: number;
  }): Promise<string> {
    await this.init();

    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const recording: Recording = {
      id: recordingId,
      sessionId: options.sessionId,
      userId: options.userId,
      audioBlob: options.audioBlob,
      audioFormat: options.audioFormat || 'audio/webm',
      duration_ms: options.durationMs,
      created_at: Date.now(),
      synced: false,
      syncAttempts: 0,
    };

    await this.db!.add('recordings', recording);
    return recordingId;
  }

  /**
   * Get recording by ID with full Blob
   */
  async getRecording(recordingId: string): Promise<Recording | undefined> {
    await this.init();
    return this.db!.get('recordings', recordingId);
  }

  /**
   * Get all recordings for a session
   */
  async getSessionRecordings(sessionId: string): Promise<Recording[]> {
    await this.init();
    return this.db!.getAllFromIndex('recordings', 'sessionId', sessionId);
  }

  /**
   * Update recording with transcript and sync status
   */
  async updateRecording(
    recordingId: string,
    updates: Partial<Recording>
  ): Promise<void> {
    await this.init();

    const recording = await this.db!.get('recordings', recordingId);
    if (!recording) throw new Error(`Recording ${recordingId} not found`);

    const updated = { ...recording, ...updates };
    await this.db!.put('recordings', updated);
  }

  /**
   * Delete recording (remove from IndexedDB)
   */
  async deleteRecording(recordingId: string): Promise<void> {
    await this.init();
    await this.db!.delete('recordings', recordingId);
    
    // Also remove from sync queue if exists
    const syncItems = await this.db!.getAllFromIndex('syncQueue', 'status', 'pending');
    const syncItem = syncItems.find(s => s.recordingId === recordingId);
    if (syncItem) {
      await this.db!.delete('syncQueue', syncItem.id);
    }
  }

  /**
   * Get storage stats
   */
  async getStorageStats(): Promise<{ totalRecordings: number; totalSizeBytes: number }> {
    await this.init();

    const recordings = await this.db!.getAll('recordings');
    let totalSizeBytes = 0;

    for (const rec of recordings) {
      totalSizeBytes += rec.audioBlob.size;
    }

    return {
      totalRecordings: recordings.length,
      totalSizeBytes,
    };
  }

  /**
   * Add recording to sync queue (for backend sync)
   */
  async addToSyncQueue(recordingId: string, metadata: {
    sessionId: string;
    transcript: string;
    duration_ms: number;
    confidence?: number;
  }): Promise<void> {
    await this.init();

    const syncQueueId = `sync_${recordingId}_${Date.now()}`;
    const syncItem: SyncQueueItem = {
      id: syncQueueId,
      recordingId,
      status: 'pending',
      attempts: 0,
      metadata,
    };

    await this.db!.add('syncQueue', syncItem);
  }

  /**
   * Get pending sync items
   */
  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    await this.init();
    return this.db!.getAllFromIndex('syncQueue', 'status', 'pending');
  }

  /**
   * Update sync queue item status
   */
  async updateSyncQueueItem(
    queueId: string,
    updates: Partial<SyncQueueItem>
  ): Promise<void> {
    await this.init();

    const item = await this.db!.get('syncQueue', queueId);
    if (!item) throw new Error(`Sync queue item ${queueId} not found`);

    const updated = { ...item, ...updates };
    await this.db!.put('syncQueue', updated);
  }

  /**
   * Clear all data (for testing/debugging)
   */
  async clear(): Promise<void> {
    await this.init();
    await this.db!.clear('recordings');
    await this.db!.clear('syncQueue');
  }
}

// Export singleton instance
export const recordingService = new RecordingService();
