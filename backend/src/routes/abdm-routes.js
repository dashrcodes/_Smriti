/**
 * SMRITI ABDM REST ROUTES
 * Endpoints for ABHA linking, consent lifecycle, and protected health records.
 * Guarded by requireAuth and requireActiveRelationship.
 */

import { Router } from 'express';
import { abdmService } from '../services/abdm-service.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { requireActiveRelationship } from '../middleware/relationship-middleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/abdm/status/:elderlyUserId
 * Retrieves ABHA linking status, active consent info, and sandbox metadata.
 */
router.get('/status/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const status = await abdmService.getAbhaStatus(elderlyUserId);
    res.status(200).json({ success: true, ...status });
  } catch (err) {
    logger.error('Failed to get ABHA status', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/abdm/link/:elderlyUserId
 * Links an ABHA ID (address or 14-digit number) to an elderly profile.
 */
router.post('/link/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const { abhaAddress, abhaNumber, otp } = req.body;
    const result = await abdmService.linkAbha(elderlyUserId, { abhaAddress, abhaNumber, otp });
    res.status(200).json(result);
  } catch (err) {
    logger.error('Failed to link ABHA', { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/abdm/unlink/:elderlyUserId
 * Unlinks ABHA from an elderly profile.
 */
router.post('/unlink/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const result = await abdmService.unlinkAbha(elderlyUserId);
    res.status(200).json(result);
  } catch (err) {
    logger.error('Failed to unlink ABHA', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/abdm/consents/:elderlyUserId
 * Lists all consent requests for an elderly user.
 */
router.get('/consents/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const consents = await abdmService.getConsents(elderlyUserId);
    res.status(200).json({ success: true, consents });
  } catch (err) {
    logger.error('Failed to get consents', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/abdm/consents/request
 * Creates a new consent request.
 */
router.post('/consents/request', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId, purpose, hiTypes, dateRange, abhaAddress } = req.body;
    if (!elderlyUserId) {
      return res.status(400).json({ success: false, error: 'elderlyUserId is required in body' });
    }

    const consent = await abdmService.createConsentRequest(elderlyUserId, req.user, {
      purpose,
      hiTypes,
      dateRange,
      abhaAddress
    });

    res.status(201).json({ success: true, consent });
  } catch (err) {
    logger.error('Failed to create consent request', { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/abdm/consents/:consentId/status
 * Updates consent status (GRANTED, DENIED, REVOKED).
 */
router.post('/consents/:consentId/status', requireAuth, async (req, res) => {
  try {
    const { consentId } = req.params;
    const { status, elderlyUserId } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'status is required' });
    }

    const updated = await abdmService.updateConsentStatus(consentId, status, elderlyUserId);
    res.status(200).json({ success: true, consent: updated });
  } catch (err) {
    logger.error('Failed to update consent status', { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/abdm/records/:elderlyUserId
 * Retrieves protected clinical records.
 * STRICT ACCESS CONTROL: Checked for active GRANTED consent.
 */
router.get('/records/:elderlyUserId', requireAuth, requireActiveRelationship, async (req, res) => {
  try {
    const { elderlyUserId } = req.params;
    const payload = await abdmService.getHealthRecords(elderlyUserId);
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'CONSENT_REQUIRED') {
      logger.warn('Health Records access denied due to missing/revoked consent', {
        elderlyUserId: req.params.elderlyUserId,
        callerId: req.user?.id
      });
      return res.status(403).json({
        success: false,
        code: 'CONSENT_REQUIRED',
        error: err.message
      });
    }

    logger.error('Failed to get health records', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
