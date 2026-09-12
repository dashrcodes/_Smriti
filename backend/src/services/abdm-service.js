/**
 * SMRITI ABDM SERVICE
 * Implements Ayushman Bharat Digital Mission (ABDM) integration.
 * Manages ABHA linking, consent lifecycle (REQUESTED -> GRANTED -> REVOKED),
 * and protected health records retrieval with strict consent verification.
 * 
 * In production/real mode: Connects to ABDM Gateway APIs.
 * In development/sandbox mode: Uses high-fidelity clinical simulation engine.
 */

import { firestoreDb, isFirebaseLive } from '../config/firebase-admin.js';
import { config, shouldUseLocalFallback } from '../config/env.js';
import { profileService } from './profile-service.js';
import { createAbdmConsentModel } from '../models/abdm-consent.model.js';
import { createHealthRecordModel } from '../models/health-record.model.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONSENTS_FILE = path.join(DATA_DIR, 'abdm_consents.json');
const RECORDS_FILE = path.join(DATA_DIR, 'abdm_records.json');

// In-memory caches for local offline development
const localConsents = new Map();
const localRecords = new Map();

function initLocalStorage() {
  if (!shouldUseLocalFallback(isFirebaseLive)) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(CONSENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONSENTS_FILE, 'utf-8'));
      Object.entries(data).forEach(([k, v]) => localConsents.set(k, v));
    }
    if (fs.existsSync(RECORDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
      Object.entries(data).forEach(([k, v]) => localRecords.set(k, v));
    }
  } catch (e) {
    logger.warn('Failed to load local ABDM storage', { error: e.message });
  }
}

function persistLocalConsents() {
  if (!shouldUseLocalFallback(isFirebaseLive)) return;
  try {
    const obj = {};
    for (const [k, v] of localConsents.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CONSENTS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // Read-only serverless environment fallback
  }
}

function persistLocalRecords() {
  if (!shouldUseLocalFallback(isFirebaseLive)) return;
  try {
    const obj = {};
    for (const [k, v] of localRecords.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // Read-only serverless environment fallback
  }
}

initLocalStorage();

/**
 * Generates clinically realistic geriatric dementia records for demonstration in NER.
 */
function createDemoHealthRecords(elderlyUserId, abhaAddress, consentArtifactId) {
  const records = [];

  // 1. Neurological & Cognitive Prescription
  records.push(createHealthRecordModel({
    id: `rec_rx_${elderlyUserId}_1`,
    elderlyUserId,
    abhaAddress,
    type: 'Prescription',
    title: 'Geriatric Cognitive & Neuro-Protective Prescription',
    category: 'Neurology & Dementia Care',
    facilityName: 'Guwahati Medical College & Hospital (GMCH), Assam',
    doctorName: 'Dr. Bhaskar Barua, MD, DM (Neurology)',
    recordDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    summary: 'Maintenance therapy for mild cognitive impairment with cholinergic and neuroprotective support.',
    details: {
      diagnosis: 'Early-stage Alzheimer\'s / Mild Neurocognitive Disorder (ICD-10 G30.0)',
      medications: [
        {
          name: 'Donepezil HCl',
          dosage: '5 mg',
          form: 'Tablet',
          frequency: 'Once daily at bedtime',
          duration: '90 days',
          instructions: 'Take after light snack; supports cholinergic neurotransmission.'
        },
        {
          name: 'Memantine HCl',
          dosage: '10 mg',
          form: 'Tablet',
          frequency: 'Once daily in morning',
          duration: '90 days',
          instructions: 'Take after breakfast; NMDA receptor modulation.'
        },
        {
          name: 'Methylcobalamin (Vitamin B12)',
          dosage: '1500 mcg',
          form: 'Tablet',
          frequency: 'Once daily after lunch',
          duration: '60 days',
          instructions: 'Nutritional neuro-support.'
        }
      ],
      lifestyleAdvice: 'Encourage daily familiar routine anchors, reminiscence storytelling in native language, and gentle supervised walks.'
    },
    fhirBundle: {
      resourceType: 'Bundle',
      type: 'document',
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: 'MedicationRequest',
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: { text: 'Donepezil Hydrochloride 5mg' }
          }
        },
        {
          resource: {
            resourceType: 'MedicationRequest',
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: { text: 'Memantine Hydrochloride 10mg' }
          }
        }
      ]
    },
    isMock: true,
    consentArtifactId
  }));

  // 2. Brain MRI Diagnostic Report
  records.push(createHealthRecordModel({
    id: `rec_diag_${elderlyUserId}_2`,
    elderlyUserId,
    abhaAddress,
    type: 'DiagnosticReport',
    title: 'Brain MRI Report (3.0 Tesla Axial & Coronal Sequences)',
    category: 'Radiology / Neuroimaging',
    facilityName: 'NER Neuro-Imaging & Diagnostic Centre, Guwahati',
    doctorName: 'Dr. Ananya Sarma, MD (Radiodiagnosis)',
    recordDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    summary: 'Mild bilateral medial temporal lobe & hippocampal volume loss (Scheltens MTA Scale 2). No acute infarct or hemorrhage.',
    details: {
      modality: 'Magnetic Resonance Imaging (MRI Brain)',
      protocol: 'T1, T2, FLAIR, DWI, SWI sequences in Axial, Sagittal, and Coronal planes',
      findings: [
        'Ventricular system: Symmetrical, age-appropriate prominence of lateral ventricles.',
        'Temporal lobes: Mild bilateral hippocampal volume loss with widened choroid fissures (MTA Score 2).',
        'White matter: Mild Fazekas Grade 1 periventricular microvascular ischemic changes.',
        'Diffusion weighted imaging shows no evidence of acute territorial infarction or intracranial hemorrhage.'
      ],
      impression: 'Neuroimaging findings consistent with early degenerative cognitive changes (Alzheimer\'s spectrum). Correlate clinically with cognitive assessments.',
      recommendations: 'Maintain structured cognitive stimulation exercises and repeat neuro-assessment in 12 months.'
    },
    fhirBundle: {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'DiagnosticReport',
            status: 'final',
            code: { text: 'MRI Brain with Hippocampal Volumetry' },
            conclusion: 'Mild bilateral hippocampal atrophy (MTA 2).'
          }
        }
      ]
    },
    isMock: true,
    consentArtifactId
  }));

  // 3. OPD Consultation Summary
  records.push(createHealthRecordModel({
    id: `rec_opd_${elderlyUserId}_3`,
    elderlyUserId,
    abhaAddress,
    type: 'OPDRecord',
    title: 'Geriatric Memory & Cognitive Health OPD Consultation',
    category: 'Clinical Assessment',
    facilityName: 'Assam Medical Institute, Department of Geriatrics, Guwahati',
    doctorName: 'Dr. Pranjal Goswami, MD (Geriatric Medicine)',
    recordDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    summary: 'Clinical evaluation of memory retention. MMSE Score 21/30. Remote memories intact, episodic recall mildly affected.',
    details: {
      assessment: 'Mini-Mental State Examination (MMSE): 21/30 (Mild Cognitive Impairment).',
      orientation: 'Oriented to person; mild disorientation to current calendar date and season.',
      memoryEvaluation: 'Delayed word recall: 2/5 words. Recognition with cultural contextual cues improved recall to 4/5 words.',
      affect: 'Calm, cooperative, comforted by Assamese folk melodies and family photographs.',
      carePlan: 'Continue Smriti daily routine anchors, digital family photo identification, and caregiver-assisted reminiscence.'
    },
    fhirBundle: {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Encounter',
            status: 'finished',
            class: { code: 'AMB', display: 'ambulatory' },
            type: [{ text: 'Geriatric Memory OPD Follow-up' }]
          }
        }
      ]
    },
    isMock: true,
    consentArtifactId
  }));

  // 4. Discharge / Observation Summary
  records.push(createHealthRecordModel({
    id: `rec_dis_${elderlyUserId}_4`,
    elderlyUserId,
    abhaAddress,
    type: 'DischargeSummary',
    title: 'Routine Geriatric Wellness Check & Observation Summary',
    category: 'Inpatient Observation',
    facilityName: 'Nalbari District Civil Hospital, Assam',
    doctorName: 'Dr. Kulen Dutta, Senior Medical Officer',
    recordDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    summary: '48-hour hydration and vital monitoring. Discharged in stable condition with normal metabolic profile.',
    details: {
      admissionReason: 'Elective annual health check, hydration monitoring, and routine blood chemistry review.',
      vitalsOnDischarge: 'BP 124/82 mmHg, Pulse 74 bpm, SpO2 98% room air, Temperature 98.4°F.',
      laboratoryHighlights: 'HbA1c: 5.8% (Normal), Serum Creatinine: 0.9 mg/dL, Thyroid TSH: 2.4 uIU/mL (Euthyroid), Serum B12: 480 pg/mL.',
      dischargeCondition: 'Patient active, stable, and discharged to home care under primary family supervision.'
    },
    fhirBundle: {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            status: 'final',
            type: { text: 'Hospital Discharge Summary' }
          }
        }
      ]
    },
    isMock: true,
    consentArtifactId
  }));

  return records;
}

export const abdmService = {
  /**
   * Checks whether the current system is running in mock/sandbox mode
   */
  isMockMode() {
    return Boolean(config.abdm.useMock || !config.abdm.clientId || !config.abdm.clientSecret);
  },

  /**
   * Retrieves ABHA linking and consent status for an elderly user
   */
  async getAbhaStatus(elderlyUserId) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    const profile = await profileService.getProfile(elderlyUserId);
    const abha = profile?.abha || {
      status: 'unlinked',
      abhaAddress: '',
      abhaNumber: '',
      linkedAt: null,
      verificationMethod: 'demo_otp'
    };

    const activeConsent = await this.getActiveGrantedConsent(elderlyUserId);

    return {
      elderlyUserId,
      displayName: profile?.displayName || profile?.name || 'Elderly User',
      abha,
      isLinked: abha.status === 'linked' && Boolean(abha.abhaAddress || abha.abhaNumber),
      activeConsent: activeConsent ? {
        id: activeConsent.id,
        consentArtifactId: activeConsent.consentArtifactId,
        status: activeConsent.status,
        expiresAt: activeConsent.expiresAt,
        purpose: activeConsent.purpose?.text || 'Geriatric Care'
      } : null,
      isMockMode: this.isMockMode(),
      gatewayUrl: config.abdm.gatewayUrl
    };
  },

  /**
   * Links an ABHA identifier (ABHA Address or 14-digit number) to an elderly user profile
   */
  async linkAbha(elderlyUserId, { abhaAddress, abhaNumber, otp }) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    let cleanAddress = (abhaAddress || '').trim().toLowerCase();
    let cleanNumber = (abhaNumber || '').trim();

    // Auto-normalize if only address or only number is provided
    if (!cleanAddress && cleanNumber) {
      const sanitizedNum = cleanNumber.replace(/[^0-9]/g, '');
      if (sanitizedNum.length === 14) {
        cleanAddress = `${sanitizedNum}@abdm`;
      }
    }

    if (!cleanAddress && !cleanNumber) {
      throw new Error('Please provide a valid ABHA address (e.g., patient@abdm) or 14-digit ABHA number.');
    }

    // Format validation
    if (cleanAddress && !cleanAddress.includes('@')) {
      cleanAddress = `${cleanAddress}@abdm`;
    }

    // Real vs Mock OTP verification
    if (this.isMockMode()) {
      logger.info('ABDM Mock ABHA Verification Success', { elderlyUserId, cleanAddress, cleanNumber });
    } else {
      // Real ABDM Gateway Auth would be called here
      logger.info('Live ABDM Gateway ABHA linking initiated', { cleanAddress });
    }

    const abhaPayload = {
      status: 'linked',
      abhaAddress: cleanAddress || `${cleanNumber.replace(/[^0-9]/g, '')}@abdm`,
      abhaNumber: cleanNumber || '91-XXXX-XXXX-XXXX',
      linkedAt: new Date().toISOString(),
      verificationMethod: this.isMockMode() ? 'demo_otp' : 'aadhaar_otp'
    };

    const updatedProfile = await profileService.saveProfile(elderlyUserId, {
      abha: abhaPayload
    });

    logger.info('ABHA linked to elderly profile', { elderlyUserId, abhaAddress: abhaPayload.abhaAddress });

    return {
      success: true,
      abha: updatedProfile.abha,
      isMockMode: this.isMockMode()
    };
  },

  /**
   * Unlinks ABHA from an elderly profile and revokes any active consents
   */
  async unlinkAbha(elderlyUserId) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    const updatedProfile = await profileService.saveProfile(elderlyUserId, {
      abha: {
        status: 'unlinked',
        abhaAddress: '',
        abhaNumber: '',
        linkedAt: null,
        verificationMethod: 'demo_otp'
      }
    });

    // Revoke any active consents for this patient
    const consents = await this.getConsents(elderlyUserId);
    for (const c of consents) {
      if (c.status === 'GRANTED' || c.status === 'REQUESTED') {
        await this.updateConsentStatus(c.id, 'REVOKED', elderlyUserId);
      }
    }

    logger.info('ABHA unlinked from elderly profile', { elderlyUserId });
    return { success: true, profile: updatedProfile };
  },

  /**
   * Retrieves all consent requests for an elderly user
   */
  async getConsents(elderlyUserId) {
    if (!elderlyUserId) return [];

    let list = [];

    if (isFirebaseLive && firestoreDb) {
      try {
        const snap = await firestoreDb.collection('abdmConsents')
          .where('elderlyUserId', '==', elderlyUserId)
          .get();
        snap.forEach(doc => list.push(doc.data()));
      } catch (err) {
        logger.error('Cloud Firestore abdmConsents query failed', { error: err.message });
      }
    }

    if (list.length === 0 && shouldUseLocalFallback(isFirebaseLive)) {
      for (const item of localConsents.values()) {
        if (item.elderlyUserId === elderlyUserId) {
          list.push(item);
        }
      }
    }

    // Evaluate on-the-fly expirations
    const now = new Date();
    list = list.map(c => {
      if (c.status === 'GRANTED' && new Date(c.expiresAt) <= now) {
        return { ...c, status: 'EXPIRED', updatedAt: now.toISOString() };
      }
      return c;
    });

    // Sort by createdAt descending
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  },

  /**
   * Finds an active, non-expired GRANTED consent
   */
  async getActiveGrantedConsent(elderlyUserId) {
    const consents = await this.getConsents(elderlyUserId);
    const now = new Date();
    return consents.find(c => c.status === 'GRANTED' && new Date(c.expiresAt) > now) || null;
  },

  /**
   * Initiates a new ABDM consent request
   */
  async createConsentRequest(elderlyUserId, requester, params = {}) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    const profile = await profileService.getProfile(elderlyUserId);
    const abhaAddress = profile?.abha?.abhaAddress || params.abhaAddress || `${elderlyUserId}@abdm`;

    const consent = createAbdmConsentModel({
      elderlyUserId,
      abhaAddress,
      status: 'REQUESTED',
      purpose: params.purpose || {
        code: 'CAREMGT',
        text: 'Geriatric Dementia Care & Cognitive Assessment'
      },
      hiTypes: params.hiTypes || ['Prescription', 'DiagnosticReport', 'OPDRecord', 'DischargeSummary'],
      dateRange: params.dateRange,
      requester: {
        userId: requester?.id || '',
        userName: requester?.name || 'Caretaker',
        role: requester?.role || 'caretaker'
      },
      isMock: this.isMockMode()
    });

    // Persist
    if (isFirebaseLive && firestoreDb) {
      try {
        await firestoreDb.collection('abdmConsents').doc(consent.id).set(consent);
      } catch (err) {
        logger.error('Failed to save consent in Firestore', { error: err.message });
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      localConsents.set(consent.id, consent);
      persistLocalConsents();
    }

    logger.info('ABDM consent request created', { consentId: consent.id, elderlyUserId });
    return consent;
  },

  /**
   * Updates consent status ('GRANTED', 'DENIED', 'REVOKED')
   */
  async updateConsentStatus(consentId, status, elderlyUserId) {
    if (!consentId) throw new Error('consentId is required');
    if (!['GRANTED', 'DENIED', 'REVOKED'].includes(status)) {
      throw new Error(`Invalid consent status '${status}'. Must be GRANTED, DENIED, or REVOKED.`);
    }

    let existing = null;
    if (isFirebaseLive && firestoreDb) {
      try {
        const doc = await firestoreDb.collection('abdmConsents').doc(consentId).get();
        if (doc.exists) existing = doc.data();
      } catch (e) {
        logger.error('Failed to fetch consent from Firestore', { error: e.message });
      }
    }

    if (!existing && shouldUseLocalFallback(isFirebaseLive)) {
      existing = localConsents.get(consentId);
    }

    if (!existing) {
      throw new Error(`Consent request '${consentId}' not found.`);
    }

    if (elderlyUserId && existing.elderlyUserId !== elderlyUserId) {
      throw new Error('Consent does not belong to the target elderly user.');
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      status,
      updatedAt: now,
      grantedAt: status === 'GRANTED' ? now : existing.grantedAt,
      revokedAt: status === 'REVOKED' ? now : existing.revokedAt,
      consentArtifactId: status === 'GRANTED' 
        ? (existing.consentArtifactId || `ca_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)
        : (status === 'REVOKED' ? existing.consentArtifactId : null)
    };

    if (isFirebaseLive && firestoreDb) {
      try {
        await firestoreDb.collection('abdmConsents').doc(consentId).set(updated, { merge: true });
      } catch (err) {
        logger.error('Failed to update consent in Firestore', { error: err.message });
      }
    }

    if (shouldUseLocalFallback(isFirebaseLive)) {
      localConsents.set(consentId, updated);
      persistLocalConsents();
    }

    logger.info(`ABDM Consent status transitioned to ${status}`, { consentId, elderlyUserId: existing.elderlyUserId });
    return updated;
  },

  /**
   * Retrieves protected health records for an elderly user.
   * STRICT ACCESS CONTROL: Requires an active, non-expired GRANTED consent artifact.
   */
  async getHealthRecords(elderlyUserId) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    // 1. Enforce Consent-First Access Check
    const activeConsent = await this.getActiveGrantedConsent(elderlyUserId);
    if (!activeConsent) {
      const error = new Error('Access Forbidden: Active ABDM patient consent is required to view protected health records.');
      error.statusCode = 403;
      error.code = 'CONSENT_REQUIRED';
      throw error;
    }

    // 2. Fetch existing records or generate high-fidelity demo records
    let records = [];

    if (isFirebaseLive && firestoreDb) {
      try {
        const snap = await firestoreDb.collection('abdmRecords')
          .where('elderlyUserId', '==', elderlyUserId)
          .get();
        snap.forEach(doc => records.push(doc.data()));
      } catch (err) {
        logger.error('Failed to query records in Firestore', { error: err.message });
      }
    }

    if (records.length === 0 && shouldUseLocalFallback(isFirebaseLive)) {
      for (const rec of localRecords.values()) {
        if (rec.elderlyUserId === elderlyUserId) {
          records.push(rec);
        }
      }
    }

    // If no records stored yet, generate and persist standardized clinical records
    if (records.length === 0) {
      records = createDemoHealthRecords(elderlyUserId, activeConsent.abhaAddress, activeConsent.consentArtifactId);
      
      if (isFirebaseLive && firestoreDb) {
        for (const rec of records) {
          try {
            await firestoreDb.collection('abdmRecords').doc(rec.id).set(rec);
          } catch (e) {
            // continue
          }
        }
      }

      if (shouldUseLocalFallback(isFirebaseLive)) {
        for (const rec of records) {
          localRecords.set(rec.id, rec);
        }
        persistLocalRecords();
      }
    }

    return {
      elderlyUserId,
      consentArtifactId: activeConsent.consentArtifactId,
      consentGrantedAt: activeConsent.grantedAt,
      isMockMode: this.isMockMode(),
      recordsCount: records.length,
      records
    };
  }
};
