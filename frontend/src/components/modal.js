/**
 * SMRITI ROLE SELECTION MODAL CONTROLLER
 * Manages modal display, role pathways (Elderly vs Caretaker),
 * and routes directly into the authentication flow.
 */

class RoleModalManager {
  constructor() {
    this.overlay = document.getElementById('role-modal-overlay');
    this.closeBtn = document.getElementById('close-modal-btn');
    this.roleButtons = document.querySelectorAll('.role-select-btn');
    this.isOpen = false;
    this.init();
  }

  init() {
    // Open modal triggers
    document.querySelectorAll('.trigger-role-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.open();
      });
    });

    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Backdrop click
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    // Role select actions
    this.roleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const role = btn.dataset.role;
        this.handleRoleSelection(role);
      });
    });
  }

  open() {
    if (!this.overlay) return;
    this.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.isOpen = true;

    if (window.smritiAudio) {
      window.smritiAudio.playChime(659.25, 0.4, 'sine');
    }
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.add('hidden');
    document.body.style.overflow = '';
    this.isOpen = false;
  }

  handleRoleSelection(role) {
    if (window.smritiAudio) {
      window.smritiAudio.playSuccessChord();
    }

    let targetRole = 'caretaker';
    if (role === 'elderly' || role === 'elderly_user') {
      targetRole = 'elderly_user';
    } else if (role === 'healthcare_worker') {
      targetRole = 'healthcare_worker';
    } else if (role === 'medical_specialist' || role === 'specialist') {
      targetRole = 'medical_specialist';
    } else if (role === 'caretaker') {
      targetRole = 'caretaker';
    }
    
    // If already authenticated and matches role, route immediately to dashboard
    const currentAuth = window.smritiAuth;
    if (currentAuth && currentAuth.isAuthenticated()) {
      const userRole = currentAuth.getUserRole();
      if (userRole === targetRole || ((targetRole === 'healthcare_worker' || targetRole === 'medical_specialist') && (userRole === 'healthcare_worker' || userRole === 'medical_specialist'))) {
        if (window.SmritiRouter) {
          window.SmritiRouter.navigateToRole(userRole);
        } else {
          window.location.href = targetRole === 'elderly_user' ? '/senior-space' : (targetRole === 'caretaker' ? '/caretaker-studio' : '/specialist-dashboard');
        }
        return;
      }
    }

    // Direct routing to role-tailored authentication page
    this.close();
    window.location.href = `/auth?role=${targetRole}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.smritiModal = new RoleModalManager();
});
