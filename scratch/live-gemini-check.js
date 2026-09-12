import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../.env');

console.log('--- LIVE GEMINI CONNECTION DIAGNOSTIC ---');
console.log('1. Checking root .env existence:', fs.existsSync(rootEnvPath));

dotenv.config({ path: rootEnvPath });

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

console.log('2. GEMINI_API_KEY detected:', Boolean(apiKey && apiKey.length > 5));
console.log('   Key length:', apiKey ? apiKey.length : 0);
console.log('3. GEMINI_MODEL detected:', modelName);

if (!apiKey) {
  console.error('FATAL: GEMINI_API_KEY is missing in root .env');
  process.exit(1);
}

// Perform ONE real call with the configured model
console.log(`4. Attempting ONE real Gemini API request with configured model: ${modelName}...`);

const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: 'Hello, reply with one short sentence.' }] }]
  });

  console.log('5. Real Gemini API response received!');
  console.log('   Response text:', response?.text?.trim());
  console.log('   SUCCESS: True live Gemini API call succeeded with model', modelName);
} catch (err) {
  console.error('5. Live Gemini API call FAILED with configured model:', modelName);
  console.error('   Status:', err?.status || 'No HTTP status code');
  console.error('   Error message:', err?.message?.replace(apiKey, '[REDACTED]'));

  // Test other compatible model if configured model encounters 429 / 404 / 503
  console.log('6. Testing candidate failover model (gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-flash)...');
  const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3-flash-preview'];
  let fallbackSuccess = false;
  for (const fbModel of fallbackModels) {
    try {
      console.log(`   Trying fallback model: ${fbModel}...`);
      const fbRes = await ai.models.generateContent({
        model: fbModel,
        contents: [{ role: 'user', parts: [{ text: 'Hello, reply with one short sentence.' }] }]
      });
      console.log(`   SUCCESS with fallback model ${fbModel}! Response:`, fbRes?.text?.trim());
      fallbackSuccess = true;
      break;
    } catch (fbErr) {
      console.log(`   Fallback ${fbModel} failed with status:`, fbErr?.status || fbErr?.message);
    }
  }
}
