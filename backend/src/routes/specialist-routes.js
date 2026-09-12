/**
 * SMRITI MEDICAL SPECIALIST ROUTES
 * Clinical endpoints for prescription management, caretaker request reviews,
 * two-way care linking, and unified adherence/cognitive trajectory timeline aggregation.
 */

import { Router } from 'express';
import { specialistService } from '../services/specialist-service.js';
import { missedDoseSchedulerService } from '../services/missed-dose-scheduler.service.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { requireRole, requireVerifiedSpecialist } from '../middleware/rbac.js';
import { requireActiveSpecialistRelationship } from '../middleware/relationship-middleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ===========================================================================
// 1. SPECIALIST PROFILE & SUMMARY
// ===========================================================================

/**
 * GET /api/specialist/profile/me
 */
router.get('/profile/me', requireAuth, requireRole(['medical_specialist', 'healthcare_worker']), async (req, res) => {
  try {
    const profile = await specialistService.getSpecialistProfile(req.user.id);
    return res.status(200).json({ success: true, profile });
  } catch (err) {
    logger.error('Failed to get specialist profile', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/specialist/profile/me
 */
router.put('/profile/me', requireAuth, requireRole(['medical_specialist', 'healthcare_worker']), async (req, res) => {
  try {
    const updated = await specialistService.saveSpecialistProfile(req.user.id, req.body);
    return res.status(200).json({ success: true, profile: updated });
  } catch (err) {
    logger.error('Failed to update specialist profile', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 2. TWO-WAY CLINICAL CARE LINKING
// ===========================================================================

/**
 * GET /api/specialist/patients
 * Returns active patients linked to specialist with urgency indicators
 */
router.get('/patients', requireAuth, requireRole(['medical_specialist', 'healthcare_worker']), async (req, res) => {
  try {
    const patients = await specialistService.getSpecialistPatients(req.user.id);
    return res.status(200).json({ success: true, count: patients.length, patients });
  } catch (err) {
    logger.error('Failed to get specialist patients', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/link/request
 * Specialist initiates link request to patient by email or ID
 */
router.post('/link/request', requireAuth, requireRole(['medical_specialist', 'healthcare_worker']), async (req, res) => {
  try {
    const { elderlyTarget } = req.body;
    if (!elderlyTarget) {
      return res.status(400).json({ success: false, error: 'elderlyTarget email or ID is required' });
    }

    const rel = await specialistService.createSpecialistLinkRequest({
      specialistId: req.user.id,
      elderlyTarget
    });

    return res.status(201).json({ success: true, relationship: rel });
  } catch (err) {
    logger.error('Failed to create specialist link request', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/link/invite
 * Caretaker initiates invite for a specialist
 */
router.post('/link/invite', requireAuth, async (req, res) => {
  try {
    const { elderlyUserId, specialistTargetEmail } = req.body;
    if (!elderlyUserId) {
      return res.status(400).json({ success: false, error: 'elderlyUserId is required' });
    }

    const rel = await specialistService.createCaretakerSpecialistInvite({
      caretakerId: req.user.id,
      elderlyUserId,
      specialistTargetEmail
    });

    return res.status(201).json({ success: true, relationship: rel });
  } catch (err) {
    logger.error('Failed to create caretaker specialist invite', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/link/redeem
 * Specialist redeems invite code
 */
router.post('/link/redeem', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ success: false, error: 'inviteCode is required' });
    }

    const rel = await specialistService.redeemInviteCode(req.user.id, inviteCode);
    return res.status(200).json({ success: true, relationship: rel });
  } catch (err) {
    logger.error('Failed to redeem specialist invite code', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/specialist/link/pending
 * Returns pending specialist requests for the authenticated user
 */
router.get('/link/pending', requireAuth, async (req, res) => {
  try {
    const targetUserId = req.query.elderlyUserId || req.user.id;
    const all = await specialistService.getPatientSpecialists(targetUserId);
    const pending = all.filter(r => r.status === 'pending');
    return res.status(200).json({ success: true, count: pending.length, requests: pending });
  } catch (err) {
    logger.error('Failed to get pending specialist link requests', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/specialist/link/:id/respond
 * Respond (Accept/Reject) to specialist relationship request
 */
router.put('/link/:id/respond', requireAuth, async (req, res) => {
  try {
    const decision = req.body.status || req.body.decision;
    if (!decision || !['accept', 'accepted', 'reject', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, error: "Decision must be 'accept' or 'reject'" });
    }

    const updated = await specialistService.respondToLinkRequest(req.params.id, req.user.id, decision);
    return res.status(200).json({ success: true, relationship: updated });
  } catch (err) {
    logger.error('Failed to respond to specialist link request', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/specialist/link/:id/revoke
 * Revokes specialist relationship
 */
router.put('/link/:id/revoke', requireAuth, async (req, res) => {
  try {
    const updated = await specialistService.revokeSpecialistRelationship(req.params.id, req.user.id);
    return res.status(200).json({ success: true, relationship: updated });
  } catch (err) {
    logger.error('Failed to revoke specialist relationship', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/specialist/patient-specialists/:elderlyUserId
 * List linked specialists for a given patient
 */
router.get('/patient-specialists/:elderlyUserId', requireAuth, async (req, res) => {
  try {
    const specialists = await specialistService.getPatientSpecialists(req.params.elderlyUserId);
    return res.status(200).json({ success: true, specialists });
  } catch (err) {
    logger.error('Failed to get patient specialists', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 3. PRESCRIPTION MANAGEMENT
// ===========================================================================

/**
 * GET /api/specialist/prescriptions/:elderlyUserId
 * Clinical prescription list for a patient
 */
router.get('/prescriptions/:elderlyUserId', requireAuth, requireActiveSpecialistRelationship, async (req, res) => {
  try {
    const prescriptions = await specialistService.getPrescriptionsForElderly(req.params.elderlyUserId);
    return res.status(200).json({ success: true, prescriptions });
  } catch (err) {
    logger.error('Failed to get prescriptions', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/prescriptions
 * Verified Specialist creates new prescription (runs safety validation and writes audit log)
 */
router.post('/prescriptions', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const result = await specialistService.addPrescription(req.user.id, req.body);
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    logger.error('Failed to add prescription', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/specialist/prescriptions/:id
 * Verified Specialist updates prescription dosage/frequency (runs safety validation and writes audit log)
 */
router.put('/prescriptions/:id', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const result = await specialistService.updatePrescription(req.user.id, req.params.id, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('Failed to update prescription', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/specialist/prescriptions/:id or POST /discontinue
 */
router.delete('/prescriptions/:id', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const reason = req.body?.reason || req.query?.reason || 'Clinical discontinuation';
    const result = await specialistService.discontinuePrescription(req.user.id, req.params.id, reason);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('Failed to discontinue prescription', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 4. CARETAKER MEDICATION REQUEST QUEUE
// ===========================================================================

/**
 * POST /api/specialist/requests
 * Caretaker submits dosage change request or symptom observation
 */
router.post('/requests', requireAuth, async (req, res) => {
  try {
    const request = await specialistService.submitMedicationRequest(req.user.id, req.body);
    return res.status(201).json({ success: true, request });
  } catch (err) {
    logger.error('Failed to submit medication request', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/specialist/requests/:elderlyUserId
 * List requests for a patient
 */
router.get('/requests/:elderlyUserId', requireAuth, requireActiveSpecialistRelationship, async (req, res) => {
  try {
    const { status } = req.query;
    const requests = await specialistService.getMedicationRequests(req.params.elderlyUserId, status);
    return res.status(200).json({ success: true, requests });
  } catch (err) {
    logger.error('Failed to get medication requests', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/specialist/requests/:id/respond
 * Specialist reviews and approves/modifies/rejects caretaker request
 */
router.put('/requests/:id/respond', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const { decision, specialistResponseNotes, clinicalNotes, newDosage, updatedPrescriptionData } = req.body;
    if (!['approve', 'approved', 'modify', 'modified', 'reject', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, error: "Decision must be 'approve', 'modify', or 'reject'" });
    }

    const prescriptionUpdates = updatedPrescriptionData || (newDosage ? { dosage: newDosage } : null);
    const result = await specialistService.respondToMedicationRequest(req.user.id, req.params.id, {
      decision,
      specialistResponseNotes: specialistResponseNotes || clinicalNotes,
      clinicalNotes,
      newDosage,
      updatedPrescriptionData: prescriptionUpdates
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('Failed to respond to medication request', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 5. UNIFIED TIMELINE & COGNITIVE AGGREGATION
// ===========================================================================

/**
 * GET /api/specialist/timeline/:elderlyUserId
 * Returns unified adherence %, cognitive performance metrics, and medication change events
 */
router.get('/timeline/:elderlyUserId', requireAuth, requireActiveSpecialistRelationship, async (req, res) => {
  try {
    const timeline = await specialistService.getClinicalTimeline(req.params.elderlyUserId, req.user.id);
    return res.status(200).json(timeline);
  } catch (err) {
    logger.error('Failed to get clinical timeline', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// 6. MEDICAL AUDIT LOGS & ALERTS
// ===========================================================================

/**
 * GET /api/specialist/audit-logs/:elderlyUserId
 */
router.get('/audit-logs/:elderlyUserId', requireAuth, requireActiveSpecialistRelationship, async (req, res) => {
  try {
    const logs = await specialistService.getAuditLogsForElderly(req.params.elderlyUserId);
    return res.status(200).json({ success: true, logs });
  } catch (err) {
    logger.error('Failed to get medical audit logs', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/specialist/alerts/:elderlyUserId
 */
router.get('/alerts/:elderlyUserId', requireAuth, requireActiveSpecialistRelationship, async (req, res) => {
  try {
    const alerts = await specialistService.getMedicalAlerts(req.params.elderlyUserId);
    return res.status(200).json({ success: true, alerts });
  } catch (err) {
    logger.error('Failed to get medical alerts', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/alerts/evaluate-missed-doses
 * Automated event trigger / scheduler to detect and create missed_dose_streak alerts
 */
router.post('/alerts/evaluate-missed-doses', requireAuth, async (req, res) => {
  try {
    const { elderlyUserId, missedCount, drugName } = req.body;
    if (elderlyUserId) {
      const alert = await specialistService.checkAndGenerateMissedDoseAlerts(elderlyUserId, missedCount || 2, drugName);
      return res.status(200).json({ success: true, alert });
    }
    const alerts = await specialistService.runMissedDoseStreakScheduler();
    return res.status(200).json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    logger.error('Failed to run missed dose streak evaluation', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/alerts/record-dose-event
 * Automated event trigger: records dose adherence observation and auto-triggers missed_dose_streak
 * alert when consecutive doses are missed.
 */
router.post('/alerts/record-dose-event', requireAuth, async (req, res) => {
  try {
    const { elderlyUserId, drugName, status, missedCountThreshold } = req.body;
    if (!elderlyUserId) {
      return res.status(400).json({ success: false, error: 'elderlyUserId is required' });
    }
    const result = await missedDoseSchedulerService.recordDoseObservation({
      elderlyUserId,
      drugName,
      status: status || 'missed',
      missedCountThreshold: missedCountThreshold || 2
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('Failed to record dose adherence event', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/specialist/alerts/:id/resolve
 */
router.post('/alerts/:id/resolve', requireAuth, requireVerifiedSpecialist, async (req, res) => {
  try {
    const { resolutionNotes } = req.body;
    const alert = await specialistService.resolveMedicalAlert(req.user.id, req.params.id, resolutionNotes);
    return res.status(200).json({ success: true, alert });
  } catch (err) {
    logger.error('Failed to resolve medical alert', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
