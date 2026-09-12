/**
 * SMRITI USER SERVICE
 * Manages user profile persistence, retrieval, and role assignments.
 * In production, strictly interacts with Cloud Firestore (users collection).
 * Local disk fallback is strictly isolated to offline development/testing without cloud credentials.
 */

import { firestoreDb, isFirebaseLive } from '../config/firebase-admin.js';
import { isProduction, shouldUseLocalFallback } from '../config/env.js';
import { createUserModel } from '../models/user.model.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_PATH = path.join(__dirname, '../../data/users.json');

// In-memory store for offline dev/test only
let localUsers = new Map();

function initLocalStorage() {
  if (!shouldUseLocalFallback(isFirebaseLive)) return;
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      const data = JSON.parse(raw || '{}');
      Object.entries(data).forEach(([k, v]) => localUsers.set(k, v));
    }
  } catch (e) {
    logger.warn('Failed to read local users file', { error: e.message });
  }
}

function persistLocalStorage() {
  if (!shouldUseLocalFallback(isFirebaseLive)) return;
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj = {};
    for (const [k, v] of localUsers.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // Read-only serverless environment fallback
  }
}

initLocalStorage();

export const userService = {
  /**
   * Retrieves a user by their unique ID
   */
  async getUserById(userId) {
    if (!userId) return null;

    if (isFirebaseLive && firestoreDb) {
      try {
        const doc = await firestoreDb.collection('users').doc(userId).get();
        if (doc.exists) {
          return doc.data();
        }
        return null;
      } catch (err) {
        logger.error('Cloud Firestore getUserById query error', { userId, errorCode: err.code, error: err.message });
        if (!shouldUseLocalFallback(isFirebaseLive)) {
          throw new Error(`Cloud Firestore query failed for user ${userId}: ${err.message}`);
        }
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      if (localUsers.has(userId)) {
        return localUsers.get(userId);
      }
      try {
        if (fs.existsSync(LOCAL_DB_PATH)) {
          const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
          const data = JSON.parse(raw || '{}');
          if (data[userId]) {
            localUsers.set(userId, data[userId]);
            return data[userId];
          }
        }
      } catch (e) {}
    }

    return null;
  },

  /**
   * Retrieves a user by email
   */
  async getUserByEmail(email) {
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();

    if (isFirebaseLive && firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('users').where('email', '==', normalizedEmail).limit(1).get();
        if (!snapshot.empty) {
          return snapshot.docs[0].data();
        }
        return null;
      } catch (err) {
        logger.error('Cloud Firestore getUserByEmail query error', { errorCode: err.code, error: err.message });
        if (!shouldUseLocalFallback(isFirebaseLive)) {
          throw new Error(`Cloud Firestore query failed for email: ${err.message}`);
        }
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      for (const user of localUsers.values()) {
        if (user.email && user.email.toLowerCase() === normalizedEmail) {
          return user;
        }
      }
      try {
        if (fs.existsSync(LOCAL_DB_PATH)) {
          const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
          const data = JSON.parse(raw || '{}');
          for (const user of Object.values(data)) {
            if (user.email && user.email.toLowerCase() === normalizedEmail) {
              localUsers.set(user.id, user);
              return user;
            }
          }
        }
      } catch (e) {}
    }

    return null;
  },

  /**
   * Upserts or creates a user profile from authenticated OAuth data
   */
  async syncOAuthUser({ id, email, name, photoURL, intendedRole, plan = 'basic' }) {
    logger.info('[AUTH_DIAGNOSTIC] stage=FIRESTORE_USER_LOOKUP_STARTED', { id_prefix: id ? id.substring(0, 6) + '***' : 'none' });
    let existing = await this.getUserById(id);
    if (!existing && email) {
      existing = await this.getUserByEmail(email);
    }
    logger.info('[AUTH_DIAGNOSTIC] stage=FIRESTORE_USER_LOOKUP_COMPLETED', {
      userFound: Boolean(existing),
      role: existing?.role
    });

    if (existing) {
      logger.info('[AUTH_DIAGNOSTIC] stage=USER_CREATION_UPDATE_STARTED', { isNewUser: false });
      const updated = {
        ...existing,
        role: intendedRole || existing.role,
        name: name || existing.name,
        email: email ? email.trim().toLowerCase() : existing.email,
        photoURL: photoURL || existing.photoURL,
        metadata: {
          ...existing.metadata,
          lastLogin: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      };

      if (isFirebaseLive && firestoreDb) {
        try {
          await firestoreDb.collection('users').doc(updated.id).set(updated, { merge: true });
        } catch (err) {
          logger.error('[AUTH_DIAGNOSTIC] stage=FIRESTORE_USER_UPDATE_FAILED', { userId: updated.id, errorCode: err.code, error: err.message });
          throw new Error(`Cloud Firestore user sync failed: ${err.message}`);
        }
      }

      if (shouldUseLocalFallback(isFirebaseLive)) {
        localUsers.set(updated.id, updated);
        persistLocalStorage();
      }

      logger.info('[AUTH_DIAGNOSTIC] stage=USER_CREATION_UPDATE_SUCCEEDED', { userId_prefix: updated.id.substring(0, 6) + '***', role: updated.role });
      return updated;
    }

    // First-time user creation
    logger.info('[AUTH_DIAGNOSTIC] stage=USER_CREATION_UPDATE_STARTED', { isNewUser: true, intendedRole });
    const newUser = createUserModel({
      id,
      email,
      name,
      photoURL,
      role: intendedRole || 'elderly_user',
      plan: plan || 'basic',
      region: 'NER',
      language: 'as',
      status: 'active'
    });

    if (isFirebaseLive && firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(newUser.id).set(newUser);
      } catch (err) {
        logger.error('[AUTH_DIAGNOSTIC] stage=FIRESTORE_USER_CREATE_FAILED', { userId: newUser.id, errorCode: err.code, error: err.message });
        throw new Error(`Cloud Firestore user creation failed: ${err.message}`);
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      localUsers.set(newUser.id, newUser);
      persistLocalStorage();
    }

    logger.info('[AUTH_DIAGNOSTIC] stage=USER_CREATION_UPDATE_SUCCEEDED', { userId_prefix: newUser.id.substring(0, 6) + '***', role: newUser.role });
    return newUser;
  },

  /**
   * Update profile fields
   */
  async updateProfile(userId, fields = {}) {
    const existing = await this.getUserById(userId);
    if (!existing) {
      throw new Error('User not found');
    }

    const { role, id, ...safeFields } = fields;
    const updated = {
      ...existing,
      ...safeFields,
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseLive && firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(userId).set(updated, { merge: true });
      } catch (err) {
        logger.error('Cloud Firestore updateProfile error', { userId, errorCode: err.code, error: err.message });
        throw new Error(`Cloud Firestore profile update failed: ${err.message}`);
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      localUsers.set(userId, updated);
      persistLocalStorage();
    }

    return updated;
  }
};
