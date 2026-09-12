/**
 * SMRITI ABDM CONSENT MODEL
 * Represents a digital health consent request and granted artifact under Ayushman Bharat Digital Mission (ABDM).
 * Enforces patient/guardian consent before any Protected Health Information (PHI) can be queried.
 */

export function createAbdmConsentModel(data = {}) {
  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 180 days (6 months)

  return {
    id: data.id || `cr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    consentRequestId: data.consentRequestId || `cr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    consentArtifactId: data.consentArtifactId || (data.status === 'GRANTED' ? `ca_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` : null),
    elderlyUserId: data.elderlyUserId || '',
    abhaAddress: data.abhaAddress || '',
    status: data.status || 'REQUESTED', // 'REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED'
    purpose: data.purpose || {
      code: 'CAREMGT',
      text: 'Geriatric Dementia Care & Cognitive Assessment'
    },
    hiTypes: Array.isArray(data.hiTypes) ? data.hiTypes : [
      'Prescription',
      'DiagnosticReport',
      'OPDRecord',
      'DischargeSummary'
    ],
    dateRange: {
      from: data.dateRange?.from || new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: data.dateRange?.to || now.toISOString().split('T')[0]
    },
    expiresAt: data.expiresAt || defaultExpiry.toISOString(),
    requester: {
      userId: data.requester?.userId || '',
      userName: data.requester?.userName || 'Caretaker',
      role: data.requester?.role || 'caretaker'
    },
    isMock: data.isMock !== undefined ? Boolean(data.isMock) : true,
    createdAt: data.createdAt || now.toISOString(),
    updatedAt: data.updatedAt || now.toISOString(),
    grantedAt: data.grantedAt || (data.status === 'GRANTED' ? now.toISOString() : null),
    revokedAt: data.revokedAt || (data.status === 'REVOKED' ? now.toISOString() : null)
  };
}
