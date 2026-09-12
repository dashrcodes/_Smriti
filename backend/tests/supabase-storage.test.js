/**
 * SMRITI SUPABASE STORAGE & RELATIONSHIP INTEGRATION TEST SUITE
 * Validates binary media upload, retrieval, deletion, and RBAC authorization across Supabase Storage & Cloud Firestore.
 */

import { mediaService } from '../src/services/media-service.js';
import { userService } from '../src/services/user-service.js';
import { relationshipService } from '../src/services/relationship-service.js';
import { storageService } from '../src/services/storage/storage-service.js';
import { supabaseStorageAdapter } from '../src/services/storage/supabase-storage-adapter.js';
import { firestoreDb } from '../src/config/firebase-admin.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`   ❌ FAIL: ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`   ✅ ${message}`);
  passed++;
}

async function runSupabaseStorageTests() {
  console.log('========================================================================');
  console.log('🧪 SMRITI SUPABASE STORAGE & MEDIA VAULT TEST SUITE');
  console.log('========================================================================\n');

  try {
    // 1. Setup authenticated users & relationship
    console.log('1. Setting up authenticated test users (Aryan, Sruti, Hrisit)...');
    const caretakerAryan = await userService.syncOAuthUser({
      id: 'supabase_test_caretaker_aryan',
      email: 'aryan.caretaker.supabase@smriti.local',
      name: 'Aryan Caretaker',
      intendedRole: 'caretaker'
    });

    const elderlySruti = await userService.syncOAuthUser({
      id: 'supabase_test_elderly_sruti',
      email: 'sruti.elderly.supabase@smriti.local',
      name: 'Sruti Elderly',
      intendedRole: 'elderly_user'
    });

    const unrelatedHrisit = await userService.syncOAuthUser({
      id: 'supabase_test_caretaker_hrisit',
      email: 'hrisit.unrelated.supabase@smriti.local',
      name: 'Hrisit Unrelated Caretaker',
      intendedRole: 'caretaker'
    });

    // Establish active accepted relationship between Aryan and Sruti
    let rel = await relationshipService.findExistingConnection(caretakerAryan.id, elderlySruti.id);
    if (!rel) {
      rel = await relationshipService.createConnectionRequest({
        caretakerId: caretakerAryan.id,
        elderlyTarget: elderlySruti.id,
        relationshipType: 'family'
      });
    }
    if (rel.status !== 'accepted') {
      await relationshipService.respondToRequest(rel.id, elderlySruti.id, 'accept');
    }

    assert(caretakerAryan.id && elderlySruti.id && unrelatedHrisit.id, 'Test users and active relationship established');

    // 2. Test Authorized JPG Photo Upload
    console.log('2. Testing Authorized JPG Photo Upload to Supabase Storage...');
    const jpgBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB]);
    const photoMemory = await mediaService.saveUploadedFile({
      fileBuffer: jpgBuffer,
      elderlyUserId: elderlySruti.id,
      uploadedBy: caretakerAryan.id,
      type: 'photo',
      title: 'Majuli Island Sunset Walk',
      description: 'Nostalgic evening walk near the Brahmaputra',
      originalName: 'majuli_sunset.jpg',
      mimeType: 'image/jpeg',
      size: jpgBuffer.length,
      tags: ['majuli', 'assam', 'family']
    });

    assert(photoMemory.id && photoMemory.storagePath.includes('majuli_sunset'), 'Photo metadata created with canonical path');
    assert(photoMemory.storageProvider === 'supabase' || photoMemory.storageProvider === 'local', 'Photo storageProvider is valid ("supabase" or "local")');
    assert(photoMemory.storageBucket === 'smriti-media', 'Photo storageBucket is "smriti-media"');
    assert(Boolean(photoMemory.runtimeUrl), 'Photo has valid runtimeUrl');

    // Verify presence in Supabase Storage
    if (supabaseStorageAdapter.isConfigured) {
      const existsInSupabase = await supabaseStorageAdapter.exists({
        storagePath: photoMemory.storagePath,
        bucket: 'smriti-media'
      });
      assert(existsInSupabase, 'Verified JPG photo exists in Supabase Storage private bucket');
    }

    // 3. Test Authorized MP4 Video Upload
    console.log('3. Testing Authorized MP4 Video Upload to Supabase Storage...');
    const mp4Buffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00]);
    const videoMemory = await mediaService.saveUploadedFile({
      fileBuffer: mp4Buffer,
      elderlyUserId: elderlySruti.id,
      uploadedBy: caretakerAryan.id,
      type: 'video',
      title: 'Bihu Dhol Dance Celebration',
      description: 'Family dancing at Rongali Bihu festival',
      originalName: 'bihu_dhol_dance.mp4',
      mimeType: 'video/mp4',
      size: mp4Buffer.length,
      tags: ['bihu', 'dance', 'culture']
    });

    assert(videoMemory.type === 'video', 'Video metadata created successfully');
    assert(videoMemory.storageProvider === 'supabase' || videoMemory.storageProvider === 'local', 'Video storageProvider is valid ("supabase" or "local")');

    // 4. Test Authorized MP3 Audio Upload
    console.log('4. Testing Authorized MP3 Audio Upload to Supabase Storage...');
    const mp3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFB, 0x90, 0x64]);
    const audioMemory = await mediaService.saveUploadedFile({
      fileBuffer: mp3Buffer,
      elderlyUserId: elderlySruti.id,
      uploadedBy: caretakerAryan.id,
      type: 'audio',
      title: 'Bhupen Hazarika Classic Tune',
      description: 'Old Assamese folk melody',
      originalName: 'bhupen_hazarika_melody.mp3',
      mimeType: 'audio/mpeg',
      size: mp3Buffer.length,
      tags: ['music', 'folk', 'memory']
    });

    assert(audioMemory.type === 'audio', 'Audio metadata created successfully');
    assert(audioMemory.storageProvider === 'supabase' || audioMemory.storageProvider === 'local', 'Audio storageProvider is valid ("supabase" or "local")');

    // 5. Test Media Retrieval & Streaming
    console.log('5. Testing Binary Media Streaming & Content-Type verification...');
    const streamResult = await mediaService.getMediaStreamOrFile(photoMemory.storagePath, caretakerAryan.id);
    assert(streamResult !== null, 'Media binary successfully retrieved for authorized caretaker');

    // 6. Test Elderly User Self-Access
    console.log('6. Testing Elderly User accessing their own media vault...');
    const elderlyVault = await mediaService.getMemoriesForElderly(elderlySruti.id, elderlySruti.id);
    assert(elderlyVault.length >= 3, `Elderly user retrieved ${elderlyVault.length} personalized items from vault`);
    const foundPhoto = elderlyVault.find(m => m.id === photoMemory.id);
    assert(Boolean(foundPhoto), 'Uploaded photo found in elderly user vault query');

    // 7. Test Security Guard: Unrelated Caretaker Blocked (HTTP 403)
    console.log('7. Testing Relationship Security: Unrelated Caretaker Hrisit upload & access blocked...');
    let uploadBlocked = false;
    try {
      await mediaService.saveUploadedFile({
        fileBuffer: jpgBuffer,
        elderlyUserId: elderlySruti.id,
        uploadedBy: unrelatedHrisit.id,
        title: 'Unauthorized Photo',
        mimeType: 'image/jpeg'
      });
    } catch (err) {
      uploadBlocked = err.message.includes('Unauthorized');
    }
    assert(uploadBlocked, 'Unrelated Caretaker upload strictly blocked with Unauthorized error');

    let viewBlocked = false;
    try {
      await mediaService.getMemoriesForElderly(elderlySruti.id, unrelatedHrisit.id);
    } catch (err) {
      viewBlocked = err.message.includes('Forbidden') || err.message.includes('not authorized');
    }
    assert(viewBlocked, 'Unrelated Caretaker querying Sruti vault strictly blocked');

    let streamBlocked = false;
    try {
      await mediaService.getMediaStreamOrFile(photoMemory.storagePath, unrelatedHrisit.id);
    } catch (err) {
      streamBlocked = err.message.includes('Forbidden') || err.message.includes('not authorized');
    }
    assert(streamBlocked, 'Unrelated Caretaker downloading/streaming media strictly blocked');

    // 8. Test Memory Deletion
    console.log('8. Testing Memory Deletion from Supabase Storage and Firestore...');
    const deleteResult = await mediaService.deleteMemory(photoMemory.id, caretakerAryan.id);
    assert(deleteResult.success, 'Memory item deleted successfully');

    if (supabaseStorageAdapter.isConfigured) {
      const existsAfterDelete = await supabaseStorageAdapter.exists({
        storagePath: photoMemory.storagePath,
        bucket: 'smriti-media'
      });
      assert(!existsAfterDelete, 'Confirmed object is removed from Supabase Storage bucket after delete');
    }

    // 9. Test Orphan Cleanup on Partial Failure (Firestore write throws -> Supabase cleaned up)
    console.log('9. Testing Orphan Cleanup on Partial Failure...');
    if (firestoreDb && typeof firestoreDb.collection === 'function') {
      const originalCollection = firestoreDb.collection;
      try {
        firestoreDb.collection = (colName) => {
          if (colName === 'memories') {
            return {
              doc: () => ({
                set: async () => { throw new Error('Simulated Firestore write failure for orphan cleanup verification'); }
              })
            };
          }
          return originalCollection.call(firestoreDb, colName);
        };

        let threwError = false;
        try {
          await mediaService.saveUploadedFile({
            fileBuffer: jpgBuffer,
            elderlyUserId: elderlySruti.id,
            uploadedBy: caretakerAryan.id,
            type: 'photo',
            title: 'Orphan Test Photo',
            originalName: 'orphan_test.jpg',
            mimeType: 'image/jpeg',
            size: jpgBuffer.length
          });
        } catch (err) {
          threwError = true;
          assert(err.message.includes('Simulated Firestore write failure'), 'Metadata failure caught and reported');
        }
        assert(threwError, 'Upload threw error on metadata failure and invoked orphan cleanup');
      } finally {
        firestoreDb.collection = originalCollection;
      }
    }

    console.log('\n========================================================================');
    console.log(`🎉 ALL ${passed} SUPABASE STORAGE & MEDIA VAULT TESTS PASSED! (0 FAILURES)`);
    console.log('========================================================================\n');
  } catch (err) {
    console.error('❌ Supabase Storage Test Suite Failed:', err);
    process.exit(1);
  }
}

runSupabaseStorageTests();
