/**
 * SMRITI OFFLINE SYSTEM COMPREHENSIVE VERIFICATION SUITE
 * Tests all 14 offline / low-connectivity scenarios without live external cloud dependencies.
 */

import assert from 'assert';

// Create realistic in-memory localStorage mock
function createLocalStorageMock() {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    _dump() {
      return { ...store };
    }
  };
}

// Emulate OfflineSyncService class in a Node environment with injected localStorage & fetch
class TestableOfflineSyncService {
  constructor(storage, fetchFn) {
    this.storage = storage;
    this.fetchFn = fetchFn;
    this.QUEUE_KEY = 'smriti_offline_session_queue';
    this.CACHE_PREFIX = 'smriti_cached_activity_pack_';
    this.isOnline = true;
    this.isSyncing = false;
    this.listeners = new Set();
    this.statusLog = [];
  }

  onStatusChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notifyStatus(status, message) {
    this.statusLog.push({ status, message });
    this.listeners.forEach(fn => fn({ isOnline: this.isOnline, status, message }));
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyStatus('offline', 'Offline mode — your activities are still available.');
  }

  async handleOnline() {
    this.isOnline = true;
    this.notifyStatus('syncing', 'Syncing saved sessions...');
    return await this.syncPendingQueue();
  }

  cacheActivityPack(elderlyUserId, pack) {
    if (!elderlyUserId || !pack) return;
    try {
      this.storage.setItem(`${this.CACHE_PREFIX}${elderlyUserId}`, JSON.stringify({
        cachedAt: new Date().toISOString(),
        pack
      }));
    } catch (e) {
      console.warn('[OfflineSync] Failed to cache activity pack:', e);
    }
  }

  getCachedActivityPack(elderlyUserId) {
    if (!elderlyUserId) return null;
    try {
      const raw = this.storage.getItem(`${this.CACHE_PREFIX}${elderlyUserId}`);
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

  queueOfflineSession(session) {
    if (!session || typeof session !== 'object') return;
    try {
      const queue = this.getPendingQueue();
      const sessionId = session.id || session.activityId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const exists = queue.some(s => s && s.id === sessionId);
      if (!exists) {
        queue.push({
          ...session,
          id: sessionId,
          offlineRecorded: true,
          queuedAt: new Date().toISOString()
        });
        this.storage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
      }
      this.notifyStatus('queued', 'Session saved locally.');
    } catch (e) {
      console.error('[OfflineSync] Failed to queue offline session:', e);
    }
  }

  getPendingQueue() {
    try {
      const raw = this.storage.getItem(this.QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  async syncPendingQueue() {
    if (this.isSyncing) {
      return { skipped: true, reason: 'already_syncing' };
    }

    const queueSnapshot = this.getPendingQueue();
    if (queueSnapshot.length === 0) {
      this.notifyStatus('online', 'Everything is up to date.');
      return { success: true, syncedCount: 0 };
    }

    this.isSyncing = true;
    try {
      const token = this.storage.getItem('smriti_session_token');
      const res = await this.fetchFn('/api/sync/sessions', {
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

      const currentQueue = this.getPendingQueue();
      const remainingQueue = currentQueue.filter(s => s && s.id && !successfulIds.has(s.id));

      if (remainingQueue.length === 0) {
        this.storage.removeItem(this.QUEUE_KEY);
        this.notifyStatus('synced', 'Everything is up to date.');
      } else {
        this.storage.setItem(this.QUEUE_KEY, JSON.stringify(remainingQueue));
        if (successfulIds.size > 0) {
          this.notifyStatus('partial_sync', `${successfulIds.size} session(s) synced, ${remainingQueue.length} session(s) waiting for retry.`);
        } else {
          this.notifyStatus('offline', 'Sync could not be completed. Sessions remain queued.');
        }
      }

      return data;
    } catch (e) {
      this.notifyStatus('offline', 'Offline mode — your activities are still available.');
      return { success: false, error: e.message };
    } finally {
      this.isSyncing = false;
    }
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('SMRITI OFFLINE SYSTEM VALIDATION: 14 SPEC TESTS');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function recordPass(testNum, desc) {
    console.log(`✅ TEST ${testNum}: ${desc}`);
    passed++;
  }

  function recordFail(testNum, desc, err) {
    console.error(`❌ TEST ${testNum}: ${desc}`, err);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 1: Online activity pack can be cached
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);
    const mockPack = { id: 'pack_123', activities: [{ id: 'act_1' }, { id: 'act_2' }] };
    service.cacheActivityPack('sruti_elderly', mockPack);

    const raw = storage.getItem('smriti_cached_activity_pack_sruti_elderly');
    assert.ok(raw, 'Raw cached data must exist in storage');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.pack.id, 'pack_123');
    recordPass(1, 'Online activity pack cached successfully in storage');
  } catch (err) {
    recordFail(1, 'Failed to cache activity pack', err);
  }

  // ----------------------------------------------------
  // TEST 2: Offline activity pack can be loaded from cache
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);
    const mockPack = { id: 'pack_123', activities: [{ id: 'act_1' }] };
    service.cacheActivityPack('sruti_elderly', mockPack);

    const retrieved = service.getCachedActivityPack('sruti_elderly');
    assert.deepStrictEqual(retrieved, mockPack);
    recordPass(2, 'Offline activity pack loads successfully from cache');
  } catch (err) {
    recordFail(2, 'Failed to retrieve cached activity pack', err);
  }

  // ----------------------------------------------------
  // TEST 3: Offline cognitive session is queued with valid generated ID
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);
    const sessionNoId = {
      elderlyUserId: 'sruti_elderly',
      activityId: 'sess_1700000001',
      category: 'memory',
      accuracy: 1.0,
      score: 100
    };
    service.queueOfflineSession(sessionNoId);
    const queue = service.getPendingQueue();
    assert.strictEqual(queue.length, 1);
    assert.ok(queue[0].id, 'Queued session must have a generated or preserved ID');
    assert.strictEqual(queue[0].id, 'sess_1700000001');
    assert.strictEqual(queue[0].offlineRecorded, true);
    recordPass(3, 'Offline cognitive session queued with valid ID');
  } catch (err) {
    recordFail(3, 'Failed to queue offline session with valid ID', err);
  }

  // ----------------------------------------------------
  // TEST 4: Multiple offline sessions remain distinct and do not collide
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);
    service.queueOfflineSession({ elderlyUserId: 'sruti', activityId: 'act_A', category: 'attention' });
    service.queueOfflineSession({ elderlyUserId: 'sruti', activityId: 'act_B', category: 'memory' });
    service.queueOfflineSession({ elderlyUserId: 'sruti', activityId: 'act_C', category: 'calculation' });

    const queue = service.getPendingQueue();
    assert.strictEqual(queue.length, 3, 'All 3 sessions must remain queued');
    const ids = queue.map(s => s.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, 3, 'All session IDs must be unique');
    recordPass(4, 'Multiple offline sessions remain distinct without collision');
  } catch (err) {
    recordFail(4, 'Multiple sessions collided or were dropped', err);
  }

  // ----------------------------------------------------
  // TEST 5: Network returns -> pending sessions are submitted
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    let submittedPayload = null;
    const mockFetch = async (url, options) => {
      submittedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          syncedCount: submittedPayload.sessions.length,
          errors: 0,
          results: submittedPayload.sessions.map(s => ({ id: s.id, success: true }))
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, mockFetch);
    service.queueOfflineSession({ id: 'sess_1', elderlyUserId: 'sruti', score: 90 });
    service.queueOfflineSession({ id: 'sess_2', elderlyUserId: 'sruti', score: 85 });

    await service.handleOnline();

    assert.ok(submittedPayload, 'Payload must have been submitted to API');
    assert.strictEqual(submittedPayload.sessions.length, 2);
    assert.strictEqual(submittedPayload.sessions[0].id, 'sess_1');
    assert.strictEqual(submittedPayload.sessions[1].id, 'sess_2');
    recordPass(5, 'Reconnection triggers automatic submission of pending sessions');
  } catch (err) {
    recordFail(5, 'Pending sessions were not submitted on reconnect', err);
  }

  // ----------------------------------------------------
  // TEST 6: Successful sync removes only successfully synchronized sessions
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const mockFetch = async (url, options) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          syncedCount: body.sessions.length,
          errors: 0,
          results: body.sessions.map(s => ({ id: s.id, success: true }))
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, mockFetch);
    service.queueOfflineSession({ id: 'sess_clean', elderlyUserId: 'sruti', score: 100 });
    assert.strictEqual(service.getPendingQueue().length, 1);

    await service.syncPendingQueue();
    assert.strictEqual(service.getPendingQueue().length, 0, 'Queue must be empty after full sync');
    assert.strictEqual(storage.getItem('smriti_offline_session_queue'), null);
    recordPass(6, 'Successful sync safely removes confirmed sessions from storage');
  } catch (err) {
    recordFail(6, 'Failed to clear queue after successful sync', err);
  }

  // ----------------------------------------------------
  // TEST 7: Sync failure -> sessions remain queued
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const mockFailingFetch = async () => {
      throw new Error('Network timeout (simulated 500 / unreachable)');
    };

    const service = new TestableOfflineSyncService(storage, mockFailingFetch);
    service.queueOfflineSession({ id: 'sess_persist', elderlyUserId: 'sruti', score: 95 });

    const result = await service.syncPendingQueue();
    assert.strictEqual(result.success, false);

    const queue = service.getPendingQueue();
    assert.strictEqual(queue.length, 1, 'Queue must remain intact after network failure');
    assert.strictEqual(queue[0].id, 'sess_persist');
    recordPass(7, 'Sync failure retains sessions safely in offline queue');
  } catch (err) {
    recordFail(7, 'Sessions were lost during sync failure', err);
  }

  // ----------------------------------------------------
  // TEST 8: Partial batch failure -> failed sessions remain available for retry
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const mockPartialFetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: false,
          syncedCount: 2,
          errors: 1,
          results: [
            { id: 'sess_1', success: true },
            { id: 'sess_2', success: false, error: 'Validation error' },
            { id: 'sess_3', success: true }
          ]
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, mockPartialFetch);
    service.queueOfflineSession({ id: 'sess_1', score: 10 });
    service.queueOfflineSession({ id: 'sess_2', score: 20 });
    service.queueOfflineSession({ id: 'sess_3', score: 30 });

    await service.syncPendingQueue();

    const remaining = service.getPendingQueue();
    assert.strictEqual(remaining.length, 1, 'Exactly 1 failed session must remain in queue');
    assert.strictEqual(remaining[0].id, 'sess_2', 'sess_2 must be the retained session');

    // Retry when sess_2 succeeds
    service.fetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        syncedCount: 1,
        errors: 0,
        results: [{ id: 'sess_2', success: true }]
      })
    });

    await service.syncPendingQueue();
    assert.strictEqual(service.getPendingQueue().length, 0, 'Queue must be empty after successful retry');
    recordPass(8, 'Partial batch failure retains failed sessions and allows subsequent retry');
  } catch (err) {
    recordFail(8, 'Failed sessions were prematurely removed on partial batch failure', err);
  }

  // ----------------------------------------------------
  // TEST 9: Malformed localStorage queue does not crash
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);

    storage.setItem(service.QUEUE_KEY, 'invalid{json::');
    assert.deepStrictEqual(service.getPendingQueue(), []);

    storage.setItem(service.QUEUE_KEY, JSON.stringify("not an array"));
    assert.deepStrictEqual(service.getPendingQueue(), []);

    storage.setItem(service.QUEUE_KEY, JSON.stringify({ bad: 'object' }));
    assert.deepStrictEqual(service.getPendingQueue(), []);

    storage.setItem(service.QUEUE_KEY, '42');
    assert.deepStrictEqual(service.getPendingQueue(), []);

    storage.setItem(service.QUEUE_KEY, 'null');
    assert.deepStrictEqual(service.getPendingQueue(), []);

    service.queueOfflineSession({ id: 'sess_recovered', score: 50 });
    assert.strictEqual(service.getPendingQueue().length, 1);
    recordPass(9, 'Malformed localStorage data handled safely without crashing');
  } catch (err) {
    recordFail(9, 'Application crashed on malformed localStorage data', err);
  }

  // ----------------------------------------------------
  // TEST 10: Empty queue safely does nothing
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    };

    const service = new TestableOfflineSyncService(storage, mockFetch);
    const res = await service.syncPendingQueue();
    assert.strictEqual(res.syncedCount, 0);
    assert.strictEqual(fetchCalled, false, 'Fetch must not be called when queue is empty');
    recordPass(10, 'Empty queue safely does nothing without network calls');
  } catch (err) {
    recordFail(10, 'Empty queue triggered unnecessary network call or error', err);
  }

  // ----------------------------------------------------
  // TEST 11: Repeated online events cannot trigger concurrent duplicate sync
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    let networkCallCount = 0;
    const mockSlowFetch = async () => {
      networkCallCount++;
      await new Promise(r => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          syncedCount: 1,
          errors: 0,
          results: [{ id: 'sess_concurrent', success: true }]
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, mockSlowFetch);
    service.queueOfflineSession({ id: 'sess_concurrent', score: 99 });

    const p1 = service.handleOnline();
    const p2 = service.handleOnline();
    const p3 = service.handleOnline();

    await Promise.all([p1, p2, p3]);

    assert.strictEqual(networkCallCount, 1, 'Only one synchronization network request must execute');
    assert.strictEqual(service.isSyncing, false, 'Mutex must be released after completion');
    recordPass(11, 'Concurrency mutex prevents duplicate sync requests from repeated online events');
  } catch (err) {
    recordFail(11, 'Concurrent online events caused duplicate network requests', err);
  }

  // ----------------------------------------------------
  // TEST 12: VR cognitive game offline session follows safe queue mechanism
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);
    
    const vrPayload = {
      elderlyUserId: 'elderly_sruti',
      activityId: `vr_sess_${Date.now()}`,
      category: 'spatial_memory',
      difficulty: 2,
      language: 'as',
      accuracy: 0.85,
      score: 85,
      responseTimeMs: 3200,
      totalQuestions: 5,
      correctAnswers: 4,
      hintsUsed: 1,
      attempts: 5,
      completed: true,
      questionsAnswered: [{ questionIndex: 0, correct: true }]
    };

    service.queueOfflineSession(vrPayload);
    const queue = service.getPendingQueue();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].category, 'spatial_memory');
    assert.strictEqual(queue[0].offlineRecorded, true);
    assert.ok(queue[0].id);
    recordPass(12, 'VR cognitive session follows standard safe offline queue schema');
  } catch (err) {
    recordFail(12, 'VR cognitive session failed offline queuing', err);
  }

  // ----------------------------------------------------
  // TEST 13: 2D cognitive game offline session follows safe queue mechanism
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const service = new TestableOfflineSyncService(storage, null);

    const twoDPayload = {
      elderlyUserId: 'elderly_sruti',
      activityId: `sess_${Date.now()}`,
      category: 'routine_recall',
      difficulty: 1,
      language: 'as',
      accuracy: 1.0,
      score: 100,
      responseTimeMs: 2400,
      totalQuestions: 3,
      correctAnswers: 3,
      hintsUsed: 0,
      attempts: 3,
      completed: true,
      questionsAnswered: [{ qIndex: 1, correct: true }]
    };

    service.queueOfflineSession(twoDPayload);
    const queue = service.getPendingQueue();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].category, 'routine_recall');
    assert.strictEqual(queue[0].accuracy, 1.0);
    recordPass(13, '2D cognitive session follows standard safe offline queue schema');
  } catch (err) {
    recordFail(13, '2D cognitive session failed offline queuing', err);
  }

  // ----------------------------------------------------
  // TEST 14: Reconnect after prolonged offline period -> queued sessions synchronize
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const batchSize = 15;
    let syncedTotal = 0;
    const mockBatchFetch = async (url, options) => {
      const body = JSON.parse(options.body);
      syncedTotal = body.sessions.length;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          syncedCount: body.sessions.length,
          errors: 0,
          results: body.sessions.map(s => ({ id: s.id, success: true }))
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, mockBatchFetch);
    for (let i = 0; i < batchSize; i++) {
      service.queueOfflineSession({
        elderlyUserId: 'sruti',
        activityId: `prolonged_sess_${i}`,
        score: 80 + i,
        completedAt: new Date(Date.now() - (batchSize - i) * 3600000).toISOString()
      });
    }

    assert.strictEqual(service.getPendingQueue().length, batchSize);
    await service.handleOnline();

    assert.strictEqual(syncedTotal, batchSize);
    assert.strictEqual(service.getPendingQueue().length, 0);
    recordPass(14, 'Prolonged offline period accumulation synchronizes completely upon reconnect');
  } catch (err) {
    recordFail(14, 'Prolonged offline sync failed', err);
  }

  // ----------------------------------------------------
  // BONUS TEST: New session queued WHILE sync is in-flight is preserved
  // ----------------------------------------------------
  try {
    const storage = createLocalStorageMock();
    const slowFetch = async (url, options) => {
      await new Promise(r => setTimeout(r, 60));
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          syncedCount: body.sessions.length,
          errors: 0,
          results: body.sessions.map(s => ({ id: s.id, success: true }))
        })
      };
    };

    const service = new TestableOfflineSyncService(storage, slowFetch);
    service.queueOfflineSession({ id: 'sess_initial', score: 100 });

    const syncPromise = service.syncPendingQueue();
    service.queueOfflineSession({ id: 'sess_new_during_flight', score: 90 });

    await syncPromise;

    const remaining = service.getPendingQueue();
    assert.strictEqual(remaining.length, 1, 'Session queued during in-flight sync must NOT be deleted');
    assert.strictEqual(remaining[0].id, 'sess_new_during_flight');
    console.log('✅ BONUS TEST: Session created during in-flight sync is preserved without data loss');
    passed++;
  } catch (err) {
    console.error('❌ BONUS TEST failed: In-flight session was lost', err);
    failed++;
  }

  console.log('====================================================');
  console.log(`OFFLINE VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests();
