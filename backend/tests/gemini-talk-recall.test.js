/**
 * REAL GEMINI CONVERSATION INTEGRATION TEST FOR SMRITI TALK & RECALL
 * Validates real multi-turn Gemini-powered AI conversations through
 * POST /api/cognitive/conversation/message and GET /api/cognitive/conversation/prompt/:id
 */

import assert from 'assert';
import { config } from '../src/config/env.js';
import { profileService } from '../src/services/profile-service.js';
import { familyService } from '../src/services/family-service.js';
import { routineService } from '../src/services/routine-service.js';

const API_BASE = `http://localhost:${config.port || 3000}`;

async function runGeminiIntegrationTests() {
  console.log('\n======================================================');
  console.log('🤖 RUNNING REAL GEMINI TALK & RECALL INTEGRATION TESTS');
  console.log('======================================================\n');

  // 1. Diagnostic Environment Check (Never log actual key)
  const hasKey = Boolean(config.gemini?.apiKey || process.env.GEMINI_API_KEY);
  const configuredModel = config.gemini?.model || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  console.log('1. Verifying Gemini Environment Configuration...');
  console.log(`   - Gemini API Key configured on server: ${hasKey}`);
  console.log(`   - Configured Gemini Model: ${configuredModel}`);
  assert.strictEqual(hasKey, true, 'CRITICAL: GEMINI_API_KEY must be configured on the server');

  // 2. Authenticate Senior Test User
  console.log('\n2. Authenticating test elderly user...');
  const authRes = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oauthUser: {
        id: 'gemini_test_senior_01',
        name: 'Bhaben',
        email: 'bhaben.baba@smriti-test.org',
        photoURL: '👤',
        gender: 'male'
      },
      intendedRole: 'elderly_user'
    })
  });
  const authData = await authRes.json();
  assert.strictEqual(authRes.status, 200, `Authentication failed: ${authData.error}`);
  const token = authData.sessionToken;
  const seniorUserId = authData.user.id;
  console.log(`   ✅ Authenticated as ${seniorUserId} (token received)`);

  // 3. Populate verified background records for test senior
  console.log('\n3. Grounding senior background records...');
  await profileService.saveProfile(seniorUserId, {
    gender: 'male',
    displayName: 'Bhaben',
    preferredLanguage: 'en'
  });
  await familyService.addFamilyMember({
    elderlyUserId: seniorUserId,
    name: 'Rupali Borah',
    relationship: 'Daughter',
    location: 'Guwahati',
    isFavorite: true,
    personalContext: 'Music teacher'
  });
  await routineService.seedDefaultRoutines(seniorUserId);
  console.log('   ✅ Profile, Daughter (Rupali), and Routines saved.');

  // 4. Test Opening Prompt via GET /api/cognitive/conversation/prompt/:elderlyUserId
  console.log('\n4. Testing GET /api/cognitive/conversation/prompt/:elderlyUserId...');
  const promptRes = await fetch(`${API_BASE}/api/cognitive/conversation/prompt/${seniorUserId}?language=en`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(promptRes.status, 200, `Expected 200, got ${promptRes.status}`);
  const promptData = await promptRes.json();
  console.log('   Prompt Result:', promptData.promptText);
  console.log('   Suggested Chips:', promptData.suggestedReplies);
  assert(promptData.success, 'Expected success: true');
  assert(promptData.promptText && promptData.promptText.length > 5, 'Expected non-empty promptText');
  assert(Array.isArray(promptData.suggestedReplies) && promptData.suggestedReplies.length > 0, 'Expected suggestedReplies array');
  assert.strictEqual(promptData.seniorName, 'Bhaben Baba', 'Expected title to be "Bhaben Baba"');

  // 5. Real Multi-Turn Conversational Chain (5 Turns) via POST /api/cognitive/conversation/message
  console.log('\n5. Testing 5-Turn Real Gemini Conversation Chain...');
  const turns = [
    'Hello Smriti.',
    'When I was young I used to visit Puri.',
    'I went there with my brother.',
    'We used to sit near the sea.',
    'I still remember the smell of the food.'
  ];

  const conversationHistory = [
    { role: 'assistant', content: promptData.promptText }
  ];

  for (let i = 0; i < turns.length; i++) {
    const userMessage = turns[i];
    console.log(`\n   --- Turn ${i + 1} ---`);
    console.log(`   Senior: "${userMessage}"`);

    conversationHistory.push({ role: 'user', content: userMessage });

    const msgRes = await fetch(`${API_BASE}/api/cognitive/conversation/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        elderlyUserId: seniorUserId,
        userMessage,
        conversationHistory,
        language: 'en'
      })
    });

    assert.strictEqual(msgRes.status, 200, `Turn ${i + 1} failed with status ${msgRes.status}`);
    const msgData = await msgRes.json();
    assert(msgData.success, `Turn ${i + 1} failed: ${JSON.stringify(msgData)}`);
    assert(msgData.replyText && msgData.replyText.length > 5, `Turn ${i + 1} replyText missing`);
    assert(Array.isArray(msgData.suggestedReplies), `Turn ${i + 1} suggestedReplies must be array`);

    console.log(`   Smriti (via ${msgData.modelUsed || 'Gemini'}): "${msgData.replyText}"`);
    console.log(`   Suggested Replies:`, msgData.suggestedReplies);

    // Verify Title and respect
    assert(!msgData.replyText.includes('Baba Bhaben'), 'Must NEVER say "Baba [Name]"');
    assert(!msgData.replyText.includes('As an AI'), 'Must never speak like a generic robotic AI');

    conversationHistory.push({ role: 'assistant', content: msgData.replyText });
  }

  // 6. Test Multi-lingual capabilities (Assamese and Hindi)
  console.log('\n6. Testing Multi-lingual Gemini Conversations...');

  // Assamese test
  const asTurn = await fetch(`${API_BASE}/api/cognitive/conversation/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      elderlyUserId: seniorUserId,
      userMessage: 'মই আজি পুৱা চাহ খালোঁ। বৰ ভাল লাগিছে।',
      conversationHistory: [],
      language: 'as'
    })
  });
  assert.strictEqual(asTurn.status, 200);
  const asData = await asTurn.json();
  console.log('   Assamese Smriti Response:', asData.replyText);
  assert(asData.replyText && asData.replyText.length > 5, 'Expected Assamese reply');

  // Hindi test
  const hiTurn = await fetch(`${API_BASE}/api/cognitive/conversation/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      elderlyUserId: seniorUserId,
      userMessage: 'आज का मौसम बहुत सुहावना है।',
      conversationHistory: [],
      language: 'hi'
    })
  });
  assert.strictEqual(hiTurn.status, 200);
  const hiData = await hiTurn.json();
  console.log('   Hindi Smriti Response:', hiData.replyText);
  assert(hiData.replyText && hiData.replyText.length > 5, 'Expected Hindi reply');

  // 7. Error Handling Verification
  console.log('\n7. Testing Error Handling...');
  const emptyRes = await fetch(`${API_BASE}/api/cognitive/conversation/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      elderlyUserId: seniorUserId,
      userMessage: '',
      conversationHistory: []
    })
  });
  assert.strictEqual(emptyRes.status, 503, 'Empty userMessage should return controlled error');
  const emptyData = await emptyRes.json();
  assert.strictEqual(emptyData.success, false);
  console.log(`   ✅ Empty message returned controlled error: "${emptyData.error}"`);

  console.log('\n======================================================');
  console.log('🎉 ALL REAL GEMINI TALK & RECALL TESTS PASSED!');
  console.log('======================================================\n');
}

runGeminiIntegrationTests().catch(err => {
  console.error('\n❌ GEMINI INTEGRATION TEST FAILED:\n', err);
  process.exit(1);
});
