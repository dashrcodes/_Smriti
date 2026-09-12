/**
 * SMRITI ABDM CLIENT SERVICE
 * Frontend service for managing Ayushman Bharat Digital Mission (ABDM) integration.
 * Handles ABHA linking, consent lifecycle (requests, grants, revocations), and protected health record retrieval.
 */

const AbdmClient = {
  /**
   * Retrieves ABHA status, active consent info, and sandbox metadata
   */
  async getStatus(elderlyUserId) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request(`/api/abdm/status/${elderlyUserId}`);
  },

  /**
   * Links an ABHA identifier to the elderly profile
   */
  async linkAbha(elderlyUserId, payload) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request(`/api/abdm/link/${elderlyUserId}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Unlinks an ABHA identifier from the elderly profile
   */
  async unlinkAbha(elderlyUserId) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request(`/api/abdm/unlink/${elderlyUserId}`, {
      method: 'POST'
    });
  },

  /**
   * Retrieves all consent requests for an elderly user
   */
  async getConsents(elderlyUserId) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    const res = await window.ApiClient.request(`/api/abdm/consents/${elderlyUserId}`);
    return res.consents || [];
  },

  /**
   * Initiates a new digital health consent request
   */
  async requestConsent(payload) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request('/api/abdm/consents/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Updates consent status (GRANTED, DENIED, REVOKED)
   */
  async updateConsentStatus(consentId, status, elderlyUserId) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request(`/api/abdm/consents/${consentId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, elderlyUserId })
    });
  },

  /**
   * Retrieves protected health records.
   * If consent is not GRANTED, throws with error and code 'CONSENT_REQUIRED'.
   */
  async getHealthRecords(elderlyUserId) {
    if (!window.ApiClient) throw new Error('ApiClient is not loaded');
    return window.ApiClient.request(`/api/abdm/records/${elderlyUserId}`);
  }
};

window.AbdmClient = AbdmClient;
