/**
 * SMRITI COGNITIVE & ADAPTIVE API ROUTES
 * Relationship-protected REST endpoints for personalized activity generation,
 * session performance recording, adaptive difficulty profiling, and caregiver insights.
 */

import express from 'express';
import { activityGeneratorService } from '../services/activity-generator.service.js';
import { performanceService } from '../services/performance.service.js';
import { adaptiveEngineService } from '../services/adaptive-engine.service.js';
import { conversationReminiscenceService } from '../services/conversation-reminiscence.service.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { requireActiveRelationship } from '../middleware/relationship-middleware.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * 0. GET /api/cognitive/conversation/prompt/:elderlyUserId
 * Generates personalized opening reminiscence prompt for Talk & Recall
 */
router.get('/conversation/prompt/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const { language } = req.query;
    const result = await conversationReminiscenceService.getOpeningPrompt(elderlyUserId, req.user.id, language);
    return res.status(200).json(result);
  } catch (err) {
    logger.error('Error generating conversation prompt', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 0b. POST /api/cognitive/conversation/message
 * Processes speech/text message in Talk & Recall and returns conversational response
 */
router.post('/conversation/message', requireAuth, async (req, res) => {
  try {
    const { elderlyUserId, userMessage, conversationHistory, language } = req.body;
    const result = await conversationReminiscenceService.processUserMessage({
      elderlyUserId,
      callerId: req.user.id,
      userMessage,
      conversationHistory,
      language
    });
    return res.status(200).json(result);
  } catch (err) {
    logger.error('Error processing conversational message', { message: err?.message, status: err?.status });
    const isAuthError = err.message?.includes('Unauthorized');
    const statusCode = isAuthError ? 403 : 503;
    const userSafeMessage = isAuthError
      ? 'Unauthorized: You cannot access conversation for this senior.'
      : 'Smriti is having trouble connecting right now. Please try again.';
    return res.status(statusCode).json({
      success: false,
      error: userSafeMessage,
      userFriendlyMessage: userSafeMessage
    });
  }
});

/**
 * 1. GET /api/cognitive/activities/:elderlyUserId
 * Generates dynamic, personalized cognitive activity pack for an elderly user
 */
router.get('/activities/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const { language, difficulty } = req.query;

    const pack = await activityGeneratorService.generateActivityPack(elderlyUserId, req.user.id, {
      language,
      difficulty: difficulty ? Number(difficulty) : undefined
    });

    return res.status(200).json({ success: true, ...pack });
  } catch (err) {
    logger.error('Error generating cognitive activity pack', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 2. POST /api/cognitive/session/record
 * Records a completed cognitive session and runs adaptive difficulty engine
 */
router.post('/session/record', requireAuth, async (req, res) => {
  try {
    const result = await performanceService.recordSession(req.body, req.user.id);
    return res.status(201).json(result);
  } catch (err) {
    logger.error('Error recording cognitive session', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 3. GET /api/cognitive/performance/:elderlyUserId
 * Retrieves completed session history for an elderly user
 */
router.get('/performance/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const sessions = await performanceService.getSessionsForElderly(req.params.elderlyUserId, req.user.id);
    return res.status(200).json({ success: true, sessions });
  } catch (err) {
    logger.error('Error fetching cognitive sessions', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 4. GET /api/cognitive/insights/:elderlyUserId
 * Computes non-diagnostic performance trends and statistics for Caregiver / Healthcare monitoring
 */
router.get('/insights/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const insights = await performanceService.getPerformanceInsights(req.params.elderlyUserId, req.user.id);
    return res.status(200).json({ success: true, insights });
  } catch (err) {
    logger.error('Error fetching performance insights', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 5. GET /api/cognitive/adaptive/:elderlyUserId
 * Retrieves the adaptive difficulty profile for an elderly user
 */
router.get('/adaptive/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const profile = await adaptiveEngineService.getAdaptiveProfile(req.params.elderlyUserId);
    return res.status(200).json({ success: true, profile });
  } catch (err) {
    logger.error('Error fetching adaptive profile', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 6. GET /api/cognitive/alerts/:elderlyUserId
 * Retrieves caregiver support alerts for an elderly user
 */
router.get('/alerts/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const alerts = await adaptiveEngineService.getAlerts(req.params.elderlyUserId);
    return res.status(200).json({ success: true, alerts });
  } catch (err) {
    logger.error('Error fetching support alerts', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

/**
 * 7. POST /api/cognitive/alerts/:id/acknowledge
 * Acknowledges a caregiver support alert
 */
router.post('/alerts/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const alert = await adaptiveEngineService.acknowledgeAlert(req.params.id, req.user.id);
    return res.status(200).json({ success: true, alert });
  } catch (err) {
    logger.error('Error acknowledging support alert', err);
    return res.status(403).json({ success: false, error: err.message });
  }
});

export default router;
