/**
 * Playback Utilities - Play recordings from IndexedDB
 * 
 * Provides helper functions for playing audio recordings stored in IndexedDB.
 */

import { recordingService } from './recordingService';

interface PlaybackHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  onEnded: (callback: () => void) => void;
}

/**
 * Play a recording from IndexedDB by recordingId
 */
export async function playRecording(recordingId: string): Promise<PlaybackHandle> {
  const recording = await recordingService.getRecording(recordingId);
  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`);
  }

  // Create Object URL from Blob (on-demand, not stored in memory)
  const audioUrl = URL.createObjectURL(recording.audioBlob);
  const audio = new Audio(audioUrl);

  return {
    play: () => audio.play(),
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(audioUrl);
    },
    seek: (time: number) => {
      audio.currentTime = time;
    },
    onEnded: (callback: () => void) => {
      audio.onended = callback;
    },
  };
}

/**
 * Get all recordings for a session with display info
 */
export async function getSessionRecordingsWithInfo(
  sessionId: string
): Promise<Array<{
  id: string;
  transcript: string;
  duration: string;
  confidence?: number;
  createdAt: string;
  syncStatus: 'pending' | 'done' | 'failed';
}>> {
  const recordings = await recordingService.getSessionRecordings(sessionId);
  
  return recordings.map(rec => ({
    id: rec.id,
    transcript: rec.transcript || '[No transcript]',
    duration: formatDuration(rec.duration_ms),
    confidence: rec.confidence,
    createdAt: new Date(rec.created_at).toLocaleString(),
    syncStatus: rec.synced ? 'done' : 'pending',
  }));
}

/**
 * Format duration in ms to readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${remainingSeconds}s`;
}

/**
 * Get storage size info
 */
export async function getStorageInfo(): Promise<{
  totalRecordings: number;
  totalSize: string;
  totalSizeBytes: number;
}> {
  const stats = await recordingService.getStorageStats();
  
  // Convert bytes to readable format
  let totalSize: string;
  if (stats.totalSizeBytes > 1024 * 1024) {
    totalSize = `${(stats.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  } else if (stats.totalSizeBytes > 1024) {
    totalSize = `${(stats.totalSizeBytes / 1024).toFixed(2)} KB`;
  } else {
    totalSize = `${stats.totalSizeBytes} B`;
  }

  return {
    totalRecordings: stats.totalRecordings,
    totalSize,
    totalSizeBytes: stats.totalSizeBytes,
  };
}

/**
 * Export recording as downloadable file
 */
export async function downloadRecording(recordingId: string, filename?: string): Promise<void> {
  const recording = await recordingService.getRecording(recordingId);
  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`);
  }

  const url = URL.createObjectURL(recording.audioBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `recording_${recordingId}.webm`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Delete recording from IndexedDB
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  await recordingService.deleteRecording(recordingId);
}

/**
 * Delete all recordings for a session
 */
export async function deleteSessionRecordings(sessionId: string): Promise<void> {
  const recordings = await recordingService.getSessionRecordings(sessionId);
  for (const recording of recordings) {
    await recordingService.deleteRecording(recording.id);
  }
}
