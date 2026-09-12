/**
 * SMRITI OFFLINE SYNC SERVICE
 * Manages local caching of personalized cognitive activities and queues offline sessions
 * for automatic synchronization when connectivity is restored.
 */

const QUEUE_KEY = 'smriti_offline_session_queue';
const CACHE_PREFIX = 'smriti_cached_activity_pack_';

class OfflineSyncService {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isSyncing = false;
    this.listeners = new Set();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  onStatusChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notifyStatus(status, message) {
    this.listeners.forEach(fn => {
      try {
        fn({ isOnline: this.isOnline, status, message });
      } catch (e) {
        console.error('[OfflineSync] Status listener error:', e);
      }
    });
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyStatus('offline', 'Offline mode — your activities are still available.');
  }

  async handleOnline() {
    this.isOnline = true;
    this.notifyStatus('syncing', 'Syncing saved sessions...');
    await this.syncPendingQueue();
  }

  /**
   * Caches a personalized activity pack locally
   */
  cacheActivityPack(elderlyUserId, pack) {
    if (!elderlyUserId || !pack) return;
    try {
      localStorage.setItem(`${CACHE_PREFIX}${elderlyUserId}`, JSON.stringify({
        cachedAt: new Date().toISOString(),
        pack
      }));
    } catch (e) {
      console.warn('[OfflineSync] Failed to cache activity pack:', e);
    }
  }

  /**
   * Retrieves cached activity pack when offline
   */
  getCachedActivityPack(elderlyUserId) {
    if (!elderlyUserId) return null;
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${elderlyUserId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.pack && typeof parsed.pack === 'object') {
        return parsed.pack;
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to read cached activity pack:', e);
    }
    return null;
  }

  /**
   * Queues an offline session locally
   */
  queueOfflineSession(session) {
    if (!session || typeof session !== 'object') return;
    try {
      const queue = this.getPendingQueue();

      // Ensure stable unique ID
      const sessionId = session.id || session.activityId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Deduplicate by non-null ID
      const exists = queue.some(s => s && s.id === sessionId);
      if (!exists) {
        queue.push({
          ...session,
          id: sessionId,
          offlineRecorded: true,
          queuedAt: new Date().toISOString()
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      }
      this.notifyStatus('queued', 'Session saved locally.');
    } catch (e) {
      console.error('[OfflineSync] Failed to queue offline session:', e);
    }
  }

  /**
   * Gets list of pending sessions in queue
   */
  getPendingQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[OfflineSync] Corrupt queue in localStorage, safely returning empty array:', e);
      return [];
    }
  }

  /**
   * Synchronizes pending sessions with backend API
   */
  async syncPendingQueue() {
    if (this.isSyncing) {
      return;
    }

    const queueSnapshot = this.getPendingQueue();
    if (queueSnapshot.length === 0) {
      this.notifyStatus('online', 'Everything is up to date.');
      return;
    }

    this.isSyncing = true;
    try {
      const token = localStorage.getItem('smriti_session_token') || sessionStorage.getItem('smriti_session_token');
      const res = await fetch('/api/sync/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessions: queueSnapshot })
      });

      if (!res.ok) {
        throw new Error(`Sync request failed: HTTP ${res.status}`);
      }

      const data = await res.json();

      // Determine which session IDs succeeded from backend results
      const successfulIds = new Set();
      if (Array.isArray(data.results)) {
        data.results.forEach(r => {
          if (r && r.success && r.id) {
            successfulIds.add(r.id);
          }
        });
      } else if (data.success && !data.errors) {
        queueSnapshot.forEach(s => {
          if (s && s.id) successfulIds.add(s.id);
        });
      }

      // Re-read queue from storage so we don't overwrite sessions added while request was in-flight
      const currentQueue = this.getPendingQueue();
      const remainingQueue = currentQueue.filter(s => s && s.id && !successfulIds.has(s.id));

      if (remainingQueue.length === 0) {
        localStorage.removeItem(QUEUE_KEY);
        this.notifyStatus('synced', 'Everything is up to date.');
      } else {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
        if (successfulIds.size > 0) {
          this.notifyStatus('partial_sync', `${successfulIds.size} session(s) synced, ${remainingQueue.length} session(s) waiting for retry.`);
        } else {
          this.notifyStatus('offline', 'Sync could not be completed. Sessions remain queued.');
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Auto-sync failed (network still unstable):', e);
      this.notifyStatus('offline', 'Offline mode — your activities are still available.');
    } finally {
      this.isSyncing = false;
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
