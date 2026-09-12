/**
 * SMRITI ABDM INTEGRATION & SECURITY TEST SUITE
 * Tests end-to-end ABHA linking, consent lifecycle, role/relationship enforcement,
 * and strict consent-guarded access to protected health records.
 */

import assert from 'assert';
import http from 'http';
import app from '../src/app.js';

let server;
let API_BASE = process.env.TEST_API_BASE;

async function startTestServer() {
  if (API_BASE) return API_BASE;
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  API_BASE = `http://127.0.0.1:${port}`;
  return API_BASE;
}

async function runAbdmTests() {
  console.log('🧪 Starting Smriti ABDM (Ayushman Bharat Digital Mission) Integration Test Suite...\n');

  try {
    const baseUrl = await startTestServer();
    console.log(`Targeting test server at: ${baseUrl}\n`);

    // Helper for OAuth sign-in simulation
    const authUser = async (id, name, email, role) => {
      const res = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oauthUser: { id, name, email, photoURL: '🧑‍💻' },
          intendedRole: role
        })
      });
      const data = await res.json();
      assert.strictEqual(data.success, true, `Auth failed for ${email}`);
      return { token: data.sessionToken, user: data.user };
    };

    // 1. Setup Test Users
    console.log('1. Setting up authenticated test accounts and caretaker-patient relationship...');
    const caretaker = await authUser('google_oauth_caretaker_aryan', 'Aryan', 'aryan@example.com', 'caretaker');
    const elderly = await authUser('google_oauth_elderly_sruti', 'Sruti', 'sruti@example.com', 'elderly_user');
    const stranger = await authUser('google_oauth_caretaker_hrisit', 'Hrisit', 'hrisit@example.com', 'caretaker');

    // Ensure relationship between Aryan and Sruti is created and accepted
    const relListRes = await fetch(`${baseUrl}/api/relationships/elderly`, {
      headers: { 'Authorization': `Bearer ${elderly.token}` }
    });
    const relListData = await relListRes.json();
    const existingRel = (relListData.relationships || []).find(r => r.caretakerId === caretaker.user.id);

    let targetRelId = existingRel ? existingRel.id : null;
    if (!existingRel) {
      const relReqRes = await fetch(`${baseUrl}/api/relationships/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${caretaker.token}`
        },
        body: JSON.stringify({ elderlyTarget: 'sruti@example.com' })
      });
      const relReqData = await relReqRes.json();
      targetRelId = relReqData.relationship ? relReqData.relationship.id : null;
    }

    if (targetRelId && (!existingRel || existingRel.status === 'pending')) {
      await fetch(`${baseUrl}/api/relationships/${targetRelId}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${elderly.token}`
        },
        body: JSON.stringify({ decision: 'accept' })
      });
    }
    // Reset ABHA state to unlinked for test repeatability
    await fetch(`${baseUrl}/api/abdm/unlink/${elderly.user.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });

    // 2. Test Initial ABHA Status
    console.log('2. Checking initial ABHA status for elderly user...');
    const initStatusRes = await fetch(`${baseUrl}/api/abdm/status/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    const initStatus = await initStatusRes.json();
    assert.strictEqual(initStatusRes.status, 200);
    assert.strictEqual(initStatus.success, true);
    assert.strictEqual(initStatus.isLinked, false);
    assert.strictEqual(initStatus.isMockMode, true);
    console.log('   ✅ Initial ABHA status is correctly unlinked\n');

    // 3. Security Boundary: Unauthorized Caretaker blocked by relationship-middleware
    console.log('3. Testing Relationship Security Guard (Unauthorized Caretaker accessing senior ABHA)...');
    const strangerAccessRes = await fetch(`${baseUrl}/api/abdm/status/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${stranger.token}` }
    });
    assert.strictEqual(strangerAccessRes.status, 403, 'Expected 403 Forbidden for unauthorized caretaker');
    console.log('   ✅ Access forbidden (403) for unrelated caretaker verified\n');

    // 4. Test ABHA Linking
    console.log('4. Linking ABHA identifier (sruti.sharma@abdm)...');
    const linkRes = await fetch(`${baseUrl}/api/abdm/link/${elderly.user.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caretaker.token}`
      },
      body: JSON.stringify({
        abhaAddress: 'sruti.sharma@abdm',
        abhaNumber: '91-1234-5678-9012',
        otp: '123456'
      })
    });
    const linkData = await linkRes.json();
    assert.strictEqual(linkRes.status, 200);
    assert.strictEqual(linkData.success, true);
    assert.strictEqual(linkData.abha.status, 'linked');
    assert.strictEqual(linkData.abha.abhaAddress, 'sruti.sharma@abdm');

    // Verify status endpoint reflects linked state
    const afterLinkStatusRes = await fetch(`${baseUrl}/api/abdm/status/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    const afterLinkStatus = await afterLinkStatusRes.json();
    assert.strictEqual(afterLinkStatus.isLinked, true);
    assert.strictEqual(afterLinkStatus.abha.abhaAddress, 'sruti.sharma@abdm');
    console.log('   ✅ ABHA successfully linked and verified\n');

    // 5. Protected Health Records Access: BLOCKED BEFORE CONSENT
    console.log('5. Testing Health Records Consent Guard (Access attempt WITHOUT consent)...');
    const noConsentRecordsRes = await fetch(`${baseUrl}/api/abdm/records/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    const noConsentRecordsData = await noConsentRecordsRes.json();
    assert.strictEqual(noConsentRecordsRes.status, 403);
    assert.strictEqual(noConsentRecordsData.success, false);
    assert.strictEqual(noConsentRecordsData.code, 'CONSENT_REQUIRED');
    console.log('   ✅ Access strictly blocked (403 CONSENT_REQUIRED) as mandated by ABDM\n');

    // 6. Create Consent Request
    console.log('6. Creating ABDM Consent Request...');
    const consentReqRes = await fetch(`${baseUrl}/api/abdm/consents/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caretaker.token}`
      },
      body: JSON.stringify({
        elderlyUserId: elderly.user.id,
        purpose: { code: 'CAREMGT', text: 'Geriatric Dementia Care & Cognitive Assessment' },
        hiTypes: ['Prescription', 'DiagnosticReport', 'OPDRecord', 'DischargeSummary']
      })
    });
    const consentReqData = await consentReqRes.json();
    assert.strictEqual(consentReqRes.status, 201);
    assert.strictEqual(consentReqData.success, true);
    assert.strictEqual(consentReqData.consent.status, 'REQUESTED');
    const consentId = consentReqData.consent.id;
    console.log(`   ✅ Consent Request Created (ID: ${consentId}, Status: REQUESTED)\n`);

    // 7. Protected Health Records Access: STILL BLOCKED IN REQUESTED STATE
    console.log('7. Testing Health Records Guard while consent is only REQUESTED...');
    const pendingRecordsRes = await fetch(`${baseUrl}/api/abdm/records/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    assert.strictEqual(pendingRecordsRes.status, 403);
    console.log('   ✅ Records still blocked while consent is in REQUESTED state\n');

    // 8. Grant / Approve Consent
    console.log('8. Granting / Approving Consent on behalf of patient...');
    const grantRes = await fetch(`${baseUrl}/api/abdm/consents/${consentId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caretaker.token}`
      },
      body: JSON.stringify({
        status: 'GRANTED',
        elderlyUserId: elderly.user.id
      })
    });
    const grantData = await grantRes.json();
    assert.strictEqual(grantRes.status, 200);
    assert.strictEqual(grantData.consent.status, 'GRANTED');
    assert.ok(grantData.consent.consentArtifactId);
    console.log(`   ✅ Consent GRANTED (Artifact ID: ${grantData.consent.consentArtifactId})\n`);

    // 9. Protected Health Records Access: UNLOCKED WITH VALID CONSENT
    console.log('9. Retrieving Protected Health Records with active GRANTED consent...');
    const recordsRes = await fetch(`${baseUrl}/api/abdm/records/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    const recordsData = await recordsRes.json();
    assert.strictEqual(recordsRes.status, 200);
    assert.strictEqual(recordsData.success, true);
    assert.ok(recordsData.records.length >= 4, 'Expected at least 4 clinical demo records');

    // Check specific record types
    const rx = recordsData.records.find(r => r.type === 'Prescription');
    const mri = recordsData.records.find(r => r.type === 'DiagnosticReport');
    const opd = recordsData.records.find(r => r.type === 'OPDRecord');
    const dis = recordsData.records.find(r => r.type === 'DischargeSummary');

    assert.ok(rx, 'Prescription record missing');
    assert.ok(rx.details.medications.some(m => m.name.includes('Donepezil')), 'Donepezil prescription missing');
    assert.ok(mri, 'MRI diagnostic report missing');
    assert.ok(mri.summary.toLowerCase().includes('hippocampal'), 'MRI summary missing hippocampal note');
    assert.ok(opd, 'OPD consultation missing');
    assert.ok(dis, 'Discharge summary missing');
    console.log(`   ✅ Successfully retrieved ${recordsData.records.length} clinical records (Rx, MRI, OPD, Discharge)\n`);

    // 10. Revoke Consent
    console.log('10. Testing Consent Revocation...');
    const revokeRes = await fetch(`${baseUrl}/api/abdm/consents/${consentId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caretaker.token}`
      },
      body: JSON.stringify({
        status: 'REVOKED',
        elderlyUserId: elderly.user.id
      })
    });
    const revokeData = await revokeRes.json();
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeData.consent.status, 'REVOKED');
    console.log('   ✅ Consent successfully transitioned to REVOKED\n');

    // 11. Protected Health Records Access: RELOCKED AFTER REVOCATION
    console.log('11. Verifying health records access is immediately relocked after revocation...');
    const postRevokeRecordsRes = await fetch(`${baseUrl}/api/abdm/records/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    assert.strictEqual(postRevokeRecordsRes.status, 403);
    const postRevokeData = await postRevokeRecordsRes.json();
    assert.strictEqual(postRevokeData.code, 'CONSENT_REQUIRED');
    console.log('   ✅ Records immediately relocked (403) upon revocation\n');

    // 12. Test Unlink ABHA
    console.log('12. Testing ABHA Unlink...');
    const unlinkRes = await fetch(`${baseUrl}/api/abdm/unlink/${elderly.user.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    assert.strictEqual(unlinkRes.status, 200);

    const finalStatusRes = await fetch(`${baseUrl}/api/abdm/status/${elderly.user.id}`, {
      headers: { 'Authorization': `Bearer ${caretaker.token}` }
    });
    const finalStatus = await finalStatusRes.json();
    assert.strictEqual(finalStatus.isLinked, false);
    console.log('   ✅ ABHA successfully unlinked\n');

    console.log('🎉 ALL ABDM INTEGRATION TESTS PASSED SUCCESSFULLY!\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runAbdmTests().catch(err => {
  console.error('\n❌ ABDM Integration Test Suite Failed:', err);
  if (server) server.close();
  process.exit(1);
});
