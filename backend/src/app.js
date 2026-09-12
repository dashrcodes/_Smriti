/**
 * SMRITI APPLICATION CONFIGURATION
 * Modular Express application exportable for both local server and Vercel Serverless Functions.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

import authRoutes from './routes/auth-routes.js';
import userRoutes from './routes/user-routes.js';
import relationshipRoutes from './routes/relationship-routes.js';
import mediaRoutes from './routes/media-routes.js';
import configRoutes from './routes/config-routes.js';
import healthRoutes from './routes/health-routes.js';
import profileRoutes from './routes/profile-routes.js';
import familyRoutes from './routes/family-routes.js';
import routineRoutes from './routes/routine-routes.js';
import reminderRoutes from './routes/reminder-routes.js';
import previewRoutes from './routes/preview-routes.js';
import cognitiveRoutes from './routes/cognitive-routes.js';
import syncRoutes from './routes/sync-routes.js';
import visionRoutes from './routes/vision-routes.js';
import specialistRoutes from './routes/specialist-routes.js';
import abdmRoutes from './routes/abdm-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');

const app = express();

// Clean Cross-Origin & Preflight Handling (Vercel Serverless & Local Dev compatible)
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  if (!req.path.startsWith('/src') && !req.path.startsWith('/public') && !req.path.includes('.')) {
    logger.info(`${req.method} ${req.path}`);
  }
  next();
});

// REST API Endpoints (Mounted on both /api/* and /* for transparent serverless rewrites)
const mountApiRoutes = (prefix = '/api') => {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/users`, userRoutes);
  app.use(`${prefix}/relationships`, relationshipRoutes);
  app.use(`${prefix}/media`, mediaRoutes);
  app.use(`${prefix}/config`, configRoutes);
  app.use(`${prefix}/health`, healthRoutes);
  app.use(`${prefix}/profile`, profileRoutes);
  app.use(`${prefix}/family`, familyRoutes);
  app.use(`${prefix}/routine`, routineRoutes);
  app.use(`${prefix}/reminders`, reminderRoutes);
  app.use(`${prefix}/preview`, previewRoutes);
  app.use(`${prefix}/cognitive`, cognitiveRoutes);
  app.use(`${prefix}/sync`, syncRoutes);
  app.use(`${prefix}/vision`, visionRoutes);
  app.use(`${prefix}/specialist`, specialistRoutes);
  app.use(`${prefix}/abdm`, abdmRoutes);
};

mountApiRoutes('/api');
mountApiRoutes('');

// Static Asset and Page Serving (for Local Dev)
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  app.use('/src', express.static(path.join(FRONTEND_DIR, 'src')));
  app.use('/components', express.static(path.join(FRONTEND_DIR, 'src/components')));
  app.use('/services', express.static(path.join(FRONTEND_DIR, 'src/services')));
  app.use('/utils', express.static(path.join(FRONTEND_DIR, 'src/utils')));
  app.use('/styles', express.static(path.join(FRONTEND_DIR, 'src/styles')));

  app.get('/senior-space', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'src/pages/senior-space.html'));
  });

  app.get('/games', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'src/pages/senior-space.html'));
  });

  app.get('/caretaker-studio', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'src/pages/caretaker-studio.html'));
  });

  app.get('/specialist-dashboard', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'src/pages/specialist-dashboard.html'));
  });

  app.get('/auth', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'src/auth/auth.html'));
  });
}

// Fallback & Error Handling
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth') || req.path.startsWith('/config')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  const indexHtml = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  return res.status(404).json({ error: 'Resource not found' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled Server Error', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

export default app;
