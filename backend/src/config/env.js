/**
 * SMRITI BACKEND ENVIRONMENT VALIDATOR & CONFIGURATION
 * Loads environment variables safely without leaking secrets to the client.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check root .env and local .env
const rootEnvPath = path.resolve(__dirname, '../../../.env');
const localEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  dotenv.config();
}

function formatPrivateKey(key) {
  if (!key) return null;
  let formatted = String(key).trim();
  while (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1).trim();
  }
  return formatted.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

let parsedServiceAccount = null;
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_ADMIN_CREDENTIALS;
if (rawServiceAccount) {
  try {
    parsedServiceAccount = JSON.parse(rawServiceAccount);
  } catch (e) {
    // If not JSON, ignore
  }
}

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || parsedServiceAccount?.project_id || 'smriti-133e1';
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL || parsedServiceAccount?.client_email || null;
const firebasePrivateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY || parsedServiceAccount?.private_key);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  sessionSecret: process.env.SESSION_SECRET || 'smriti_dev_session_secret_2026',
  authTokenExpiry: process.env.AUTH_TOKEN_EXPIRY || '7d',
  firebase: {
    projectId: firebaseProjectId,
    clientEmail: firebaseClientEmail,
    privateKey: firebasePrivateKey,
  },
  supabase: {
    url: process.env.SUPABASE_URL || null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'smriti-media',
  },
  nerDefaults: {
    region: process.env.NER_DEFAULT_REGION || 'NER',
    language: process.env.DEFAULT_LANGUAGE || 'as',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  },
  abdm: {
    clientId: process.env.ABDM_CLIENT_ID || null,
    clientSecret: process.env.ABDM_CLIENT_SECRET || null,
    gatewayUrl: process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway',
    useMock: process.env.ABDM_USE_MOCK !== 'false',
  }
};

export const isProduction = Boolean(
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL === '1' ||
  process.env.VERCEL_ENV === 'production'
);

export function shouldUseLocalFallback(isFirebaseLive = false) {
  const currentIsProd = Boolean(
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production'
  );
  return !currentIsProd && !isFirebaseLive;
}
