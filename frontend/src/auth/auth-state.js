/**
 * SMRITI AUTH STATE MANAGER
 * Coordinates frontend authentication lifecycle, session restoration, and reactive listeners.
 */

class AuthStateManager {
  constructor() {
    this.user = null;
    this.loading = true;
    this.listeners = new Set();
    this.init();
  }

  async init() {
    this.loading = true;
    this.notify();

    // Check stored user first for instantaneous UI rendering
    const cached = window.ApiClient ? window.ApiClient.getStoredUser() : null;
    if (cached) {
      this.user = cached;
      this.loading = false;
      this.notify();
    }

    // Then revalidate session against backend
    try {
      if (window.ApiClient && window.ApiClient.getToken()) {
        const verifiedUser = await window.ApiClient.checkSession();
        this.user = verifiedUser;
      } else {
        this.user = null;
      }
    } catch (e) {
      console.warn('[AuthStateManager] Session check expired or failed:', e.message);
      this.user = null;
      if (window.ApiClient) window.ApiClient.clearSession();
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  onAuthStateChanged(callback) {
    this.listeners.add(callback);
    callback(this.user, this.loading);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.user, this.loading);
      } catch (e) {
        console.error('[AuthStateManager] Listener error:', e);
      }
    }
  }

  async signInWithGoogle(intendedRole = 'elderly_user') {
    if (!window.GoogleAuthClient || !window.ApiClient) {
      throw new Error('Auth clients not initialized');
    }

    this.loading = true;
    this.notify();

    try {
      const oauthResult = await window.GoogleAuthClient.signInWithGoogle(intendedRole);
      if (!oauthResult) {
        // Redirect OAuth initiated
        return null;
      }
      const res = await window.ApiClient.loginWithGoogle({
        ...oauthResult,
        intendedRole
      });

      if (res.success && res.user) {
        this.user = res.user;
        this.loading = false;
        this.notify();
        return res.user;
      } else {
        throw new Error(res.error || 'Authentication failed');
      }
    } catch (err) {
      this.loading = false;
      this.notify();
      throw err;
    }
  }

  async signOut() {
    this.loading = true;
    this.notify();
    try {
      if (window.ApiClient) {
        await window.ApiClient.logout();
      }
      if (window.SmritiFirebase?.auth && window.SmritiFirebase?.signOut) {
        try {
          await window.SmritiFirebase.signOut(window.SmritiFirebase.auth);
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[AuthStateManager] SignOut warning:', err);
    } finally {
      this.user = null;
      if (window.ApiClient) window.ApiClient.clearSession();
      localStorage.removeItem('smriti_intended_role');
      localStorage.removeItem('smriti_active_elderly');
      try {
        sessionStorage.clear();
      } catch (e) {}
      this.loading = false;
      this.notify();
    }
  }

  async logout() {
    return this.signOut();
  }

  getUser() {
    if (this.user) return this.user;
    if (window.ApiClient) return window.ApiClient.getStoredUser();
    return null;
  }

  isAuthenticated() {
    return Boolean(this.getUser()?.id);
  }

  getUserRole() {
    const u = this.getUser();
    return u ? u.role : null;
  }
}

window.smritiAuth = new AuthStateManager();
