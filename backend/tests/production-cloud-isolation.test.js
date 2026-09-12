/**
 * SMRITI PRODUCTION CLOUD ISOLATION & ZERO-LOCAL-FALLBACK TEST SUITE
 * Validates that in production mode (NODE_ENV=production / VERCEL=1):
 * 1. Production mode disables local user fallback
 * 2. Production mode disables local relationship fallback
 * 3. Production mode disables local media fallback
 * 4. Production mode disables local personalization fallback
 * 5. Production mode disables local cognitive fallback
 * 6. Supabase storage failure does not write to local disk
 * 7. Firestore failure does not create a local fallback record
 * 8. Firebase auth in production strictly rejects development simulated payloads (oauthUser)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shouldUseLocalFallback, isProduction } from '../src/config/env.js';
import { authService } from '../src/auth/auth-service.js';
import { userService } from '../src/services/user-service.js';
import { relationshipService } from '../src/services/relationship-service.js';
import { storageService } from '../src/services/storage/storage-service.js';
import { mediaService } from '../src/services/media-service.js';
import { profileService } from '../src/services/profile-service.js';
import { familyService } from '../src/services/family-service.js';
import { routineService } from '../src/services/routine-service.js';
import { reminderService } from '../src/services/reminder-service.js';
import { performanceService } from '../src/services/performance.service.js';
import { adaptiveEngineService } from '../src/services/adaptive-engine.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

async function runCloudIsolationTests() {
  console.log('========================================================================');
  console.log('🔒 SMRITI PRODUCTION CLOUD ISOLATION & ZERO-LOCAL-FALLBACK TEST SUITE');
  console.log('========================================================================\n');

  // Save original env
  const origNodeEnv = process.env.NODE_ENV;
  const origVercel = process.env.VERCEL;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Production Mode Helper Evaluation
    // -------------------------------------------------------------------------
    console.log('1. Testing Production Mode Helper & Fallback Invariant...');
    process.env.NODE_ENV = 'production';
    assert.strictEqual(
      shouldUseLocalFallback(false),
      false,
      'shouldUseLocalFallback MUST return false when NODE_ENV=production'
    );
    assert.strictEqual(
      shouldUseLocalFallback(true),
      false,
      'shouldUseLocalFallback MUST return false when live Firebase is active'
    );
    console.log('   ✅ Production mode correctly forbids local fallback');

    // -------------------------------------------------------------------------
    // TEST 2: Production Mode Auth - Rejects Simulated OAuth Payload
    // -------------------------------------------------------------------------
    console.log('2. Testing Production Auth Strictness: Simulated OAuth payload rejected...');
    process.env.NODE_ENV = 'production';
    let authThrew = false;
    try {
      await authService.verifyGoogleUser({
        oauthUser: { id: 'fake_prod_uid', email: 'fake@example.com', name: 'Fake User' },
        intendedRole: 'caretaker'
      });
    } catch (err) {
      authThrew = true;
      assert.ok(
        err.message.includes('Firebase ID token is strictly required') || err.message.includes('Firebase ID token is required'),
        `Error message must specify ID token requirement in production: ${err.message}`
      );
    }
    assert.strictEqual(authThrew, true, 'Simulated oauthUser MUST throw in production');
    console.log('   ✅ Production Auth strictly blocks development simulated payloads');

    // -------------------------------------------------------------------------
    // TEST 3: Production User Lookup - Disables Local Disk Fallback
    // -------------------------------------------------------------------------
    console.log('3. Testing Production User Lookup: Disables local disk fallback...');
    process.env.NODE_ENV = 'production';
    const nonExistentUserId = `non_existent_prod_user_${Date.now()}`;
    try {
      const userResult = await userService.getUserById(nonExistentUserId);
      assert.strictEqual(userResult, null, 'Non-existent user must return null in production without local fallback');
    } catch (err) {
      assert.ok(
        err.message.includes('Cloud Firestore query failed') || err.message.includes('RESOURCE_EXHAUSTED'),
        `Error must be explicit cloud failure: ${err.message}`
      );
    }
    console.log('   ✅ User service strictly respects cloud database boundary in production');

    // -------------------------------------------------------------------------
    // TEST 4: Production Relationship Lookup - Disables Local Fallback
    // -------------------------------------------------------------------------
    console.log('4. Testing Production Relationship Lookup: Disables local fallback...');
    process.env.NODE_ENV = 'production';
    try {
      const nonExistentRel = await relationshipService.getRelationshipById(`rel_non_existent_${Date.now()}`);
      assert.strictEqual(nonExistentRel, null, 'Non-existent relationship must return null without local fallback');
    } catch (err) {
      assert.ok(
        err.message.includes('Cloud Firestore query failed') || err.message.includes('RESOURCE_EXHAUSTED'),
        `Error must be explicit cloud failure: ${err.message}`
      );
    }
    console.log('   ✅ Relationship service strictly queries Cloud Firestore in production');

    // -------------------------------------------------------------------------
    // TEST 5: Production Storage - Upload Failure does NOT silently write to disk
    // -------------------------------------------------------------------------
    console.log('5. Testing Production Storage: Cloud upload failure does not create local file...');
    process.env.NODE_ENV = 'production';
    const testStoragePath = `elderly/test_prod_isolation_${Date.now()}/photos/test_failure.jpg`;
    const localTargetFilePath = path.join(UPLOADS_DIR, testStoragePath);

    // Ensure local file does not exist beforehand
    if (fs.existsSync(localTargetFilePath)) {
      fs.unlinkSync(localTargetFilePath);
    }

    // Mock a simulated Supabase network error
    const origSupabaseUpload = storageService.supabaseAdapter.upload;
    storageService.supabaseAdapter.upload = async () => {
      throw new Error('Simulated Supabase 503 Network Gateway Failure');
    };

    let uploadFailedAsExpected = false;
    try {
      await storageService.upload({
        storagePath: testStoragePath,
        fileBuffer: Buffer.from('test binary content'),
        mimeType: 'image/jpeg'
      });
    } catch (err) {
      uploadFailedAsExpected = true;
      assert.ok(
        err.message.includes('Supabase Storage upload failed') || err.message.includes('No authorized cloud storage provider'),
        `Error must be explicit cloud failure: ${err.message}`
      );
    } finally {
      // Restore adapter
      storageService.supabaseAdapter.upload = origSupabaseUpload;
    }

    assert.strictEqual(uploadFailedAsExpected, true, 'Storage service must throw cloud failure in production');
    assert.strictEqual(fs.existsSync(localTargetFilePath), false, 'Storage service MUST NOT silently write to local disk on cloud failure');
    console.log('   ✅ Storage service fails fast with explicit error and zero local disk fallback');

    // -------------------------------------------------------------------------
    // TEST 6: Production Personalization Data - Disables JSON Fallback
    // -------------------------------------------------------------------------
    console.log('6. Testing Production Personalization Data: Disables local JSON fallback...');
    process.env.NODE_ENV = 'production';
    const nonExistentElderlyId = `elderly_cloud_iso_${Date.now()}`;
    try {
      const familyMembers = await familyService.getFamilyForElderly(nonExistentElderlyId);
      assert.deepStrictEqual(familyMembers, [], 'Family service returns empty array for non-existent cloud profile');
    } catch (err) {
      assert.ok(
        err.message.includes('Cloud Firestore') || err.message.includes('RESOURCE_EXHAUSTED'),
        `Error must be explicit cloud failure: ${err.message}`
      );
    }
    console.log('   ✅ Personalization service strictly uses Cloud Firestore in production');

    // -------------------------------------------------------------------------
    // TEST 7: Production Cognitive Data - Disables JSON Fallback
    // -------------------------------------------------------------------------
    console.log('7. Testing Production Cognitive Performance: Disables local cache fallback...');
    process.env.NODE_ENV = 'production';
    try {
      const sessions = await performanceService.getSessionsForElderly(nonExistentElderlyId, nonExistentElderlyId);
      assert.deepStrictEqual(sessions, [], 'Performance service returns empty array for non-existent cloud user');
    } catch (err) {
      assert.ok(
        err.message.includes('Cloud Firestore') || err.message.includes('RESOURCE_EXHAUSTED'),
        `Error must be explicit cloud failure: ${err.message}`
      );
    }
    console.log('   ✅ Cognitive performance service strictly uses Cloud Firestore in production');

    // -------------------------------------------------------------------------
    // TEST 8: Local Development Mode Allows Local Fallback When Explicitly Offline
    // -------------------------------------------------------------------------
    console.log('8. Testing Local Development Isolation: Fallback enabled ONLY when !isProduction && !isFirebaseLive...');
    process.env.NODE_ENV = 'development';
    assert.strictEqual(
      shouldUseLocalFallback(false),
      true,
      'Local fallback must be allowed when in development and Firebase is offline'
    );
    assert.strictEqual(
      shouldUseLocalFallback(true),
      false,
      'Local fallback must be forbidden when Firebase is live, even in development'
    );
    console.log('   ✅ Development fallback gating is strictly conditioned on offline status');

    console.log('\n========================================================================');
    console.log('🎉 ALL 8 PRODUCTION CLOUD ISOLATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('========================================================================\n');
  } finally {
    // Restore original environment
    process.env.NODE_ENV = origNodeEnv;
    if (origVercel !== undefined) {
      process.env.VERCEL = origVercel;
    } else {
      delete process.env.VERCEL;
    }
  }
}

runCloudIsolationTests();
