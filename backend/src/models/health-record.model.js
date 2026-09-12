/**
 * SMRITI ABDM HEALTH RECORD MODEL
 * Normalized clinical records fetched under ABDM Health Information User (HIU) flows.
 * Supports Prescriptions, Diagnostic Reports, OPD Summaries, and Discharge Summaries.
 */

export function createHealthRecordModel(data = {}) {
  return {
    id: data.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    elderlyUserId: data.elderlyUserId || '',
    abhaAddress: data.abhaAddress || '',
    type: data.type || 'Prescription', // 'Prescription' | 'DiagnosticReport' | 'OPDRecord' | 'DischargeSummary'
    title: data.title || 'Health Record',
    category: data.category || 'General Health',
    facilityName: data.facilityName || 'Guwahati Medical College & Hospital (NER)',
    doctorName: data.doctorName || 'Dr. B. Barua, MD (Neurology)',
    recordDate: data.recordDate || new Date().toISOString().split('T')[0],
    summary: data.summary || '',
    details: data.details || {},
    fhirBundle: data.fhirBundle || null,
    isMock: data.isMock !== undefined ? Boolean(data.isMock) : true,
    consentArtifactId: data.consentArtifactId || null,
    createdAt: data.createdAt || new Date().toISOString()
  };
}
