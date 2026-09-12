/**
 * SMRITI API CLIENT SERVICE
 * Handles communication with the backend REST API with session token propagation.
 */

const API_BASE = window.location.origin;
const SESSION_KEY = 'smriti_session_token';
const USER_KEY = 'smriti_auth_user';

const ApiClient = {
  getToken() {
    return localStorage.getItem(SESSION_KEY);
  },

  setSession(token, user) {
    if (token) localStorage.setItem(SESSION_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('smriti_intended_role');
    localStorage.removeItem('smriti_active_elderly');
    try {
      sessionStorage.clear();
    } catch (e) {}
  },

  getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();

      let data;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        console.error('[ApiClient JSON Parse Failure]', {
          url,
          status: response.status,
          contentType,
          rawText
        });
        throw new Error(`Server returned invalid response from ${endpoint} (HTTP ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP ${response.status}`);
      }
      return data;
    } catch (err) {
      console.warn(`[ApiClient] Request error on ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Auth endpoints
  async loginWithGoogle({ idToken, oauthUser, intendedRole }) {
    console.log('[AUTH_DIAGNOSTIC] stage=POST_API_AUTH_GOOGLE_STARTED intendedRole=' + intendedRole);
    const res = await this.request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, oauthUser, intendedRole })
    });
    console.log('[AUTH_DIAGNOSTIC] stage=FRONTEND_RECEIVED_RESPONSE success=' + res.success);
    if (res.success && res.sessionToken) {
      this.setSession(res.sessionToken, res.user);
      console.log('[AUTH_DIAGNOSTIC] stage=FRONTEND_SESSION_RESTORED role=' + (res.user?.role || 'none'));
    }
    return res;
  },

  async checkSession() {
    const res = await this.request('/api/auth/session');
    if (res.success && res.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
    return res.user;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Proceed with local logout regardless of network state
    }
    this.clearSession();
  },

  // User & RBAC Protected endpoints
  async getSeniorSpaceSummary() {
    return this.request('/api/users/senior-space/summary');
  },

  async getCaretakerStudioSummary() {
    return this.request('/api/users/caretaker-studio/summary');
  }
};

window.ApiClient = ApiClient;
