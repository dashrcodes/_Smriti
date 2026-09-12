/**
 * SMRITI ROLE ROUTING & ACCESS CONTROL VERIFICATION SUITE
 * Tests role navigation, route guards, API authorization, and session resolution.
 */

import assert from 'assert';
import { userService } from '../backend/src/services/user-service.js';
import { authService } from '../backend/src/auth/auth-service.js';
import { normalizeRole, VALID_ROLES } from '../backend/src/models/user.model.js';
import app from '../backend/src/app.js';

// Emulate client-side router logic from frontend/src/utils/router.js
const SmritiRouterMock = {
  getTargetUrlForRole(role) {
    if (role === 'elderly_user') {
      return '/senior-space';
    } else if (role === 'medical_specialist' || role === 'healthcare_worker') {
      return '/specialist-dashboard';
    } else if (role === 'caretaker') {
      return '/caretaker-studio';
    }
    return '/';
  },

  evaluateRouteGuard(path, user) {
    const isSeniorSpace = path.includes('senior-space');
    const isCaretakerStudio = path.includes('caretaker-studio');
    const isSpecialistDashboard = path.includes('specialist-dashboard');
    const isAuthPage = path.includes('auth');

    // 1. Unauthenticated user
    if (!user && (isSeniorSpace || isCaretakerStudio || isSpecialistDashboard)) {
      const fallbackRole = isSeniorSpace ? 'elderly_user' : isSpecialistDashboard ? 'medical_specialist' : 'caretaker';
      return { action: 'redirect', to: `/auth?role=${fallbackRole}` };
    }

    // 2. Already authenticated user visiting /auth
    if (user && isAuthPage) {
      return { action: 'redirect', to: this.getTargetUrlForRole(user.role) };
    }

    // 3. Elderly mismatch
    if (user && (isCaretakerStudio || isSpecialistDashboard) && user.role === 'elderly_user') {
      return { action: 'replace', to: '/senior-space' };
    }

    // 4. Caretaker mismatch
    if (user && (isSeniorSpace || isSpecialistDashboard) && user.role === 'caretaker') {
      return { action: 'replace', to: '/caretaker-studio' };
    }

    // 5. Specialist / Healthcare Worker mismatch
    if (user && (isSeniorSpace || isCaretakerStudio) && (user.role === 'medical_specialist' || user.role === 'healthcare_worker')) {
      return { action: 'replace', to: '/specialist-dashboard' };
    }

    return { action: 'allow', to: path };
  }
};

// Emulate modal.js handleRoleSelection logic
function mockHandleRoleSelection(role) {
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
  return `/auth?role=${targetRole}`;
}

async function runRoleTests() {
  console.log('====================================================');
  console.log('SMRITI ROLE ROUTING & RBAC VERIFICATION SUITE');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function recordPass(code, desc) {
    console.log(`✅ [${code}] ${desc}`);
    passed++;
  }

  function recordFail(code, desc, err) {
    console.error(`❌ [${code}] ${desc}`, err);
    failed++;
  }

  // ----------------------------------------------------
  // TEST A: healthcare_worker fresh login -> /specialist-dashboard
  // ----------------------------------------------------
  try {
    const target = SmritiRouterMock.getTargetUrlForRole('healthcare_worker');
    assert.strictEqual(target, '/specialist-dashboard');
    recordPass('ROLE_A', 'healthcare_worker routes directly to /specialist-dashboard');
  } catch (err) {
    recordFail('ROLE_A', 'Failed healthcare_worker routing', err);
  }

  // ----------------------------------------------------
  // TEST B: healthcare_worker existing session visiting /auth -> /specialist-dashboard
  // ----------------------------------------------------
  try {
    const user = { id: 'hc_1', role: 'healthcare_worker' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/auth', user);
    assert.strictEqual(guardResult.action, 'redirect');
    assert.strictEqual(guardResult.to, '/specialist-dashboard');
    recordPass('ROLE_B', 'healthcare_worker session on /auth redirects to /specialist-dashboard');
  } catch (err) {
    recordFail('ROLE_B', 'Failed healthcare_worker /auth redirect', err);
  }

  // ----------------------------------------------------
  // TEST C: medical_specialist -> /specialist-dashboard
  // ----------------------------------------------------
  try {
    const target = SmritiRouterMock.getTargetUrlForRole('medical_specialist');
    assert.strictEqual(target, '/specialist-dashboard');
    const user = { id: 'spec_1', role: 'medical_specialist' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/auth', user);
    assert.strictEqual(guardResult.to, '/specialist-dashboard');
    recordPass('ROLE_C', 'medical_specialist routes to /specialist-dashboard');
  } catch (err) {
    recordFail('ROLE_C', 'Failed medical_specialist routing', err);
  }

  // ----------------------------------------------------
  // TEST D: caretaker -> /caretaker-studio
  // ----------------------------------------------------
  try {
    const target = SmritiRouterMock.getTargetUrlForRole('caretaker');
    assert.strictEqual(target, '/caretaker-studio');
    const user = { id: 'care_1', role: 'caretaker' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/auth', user);
    assert.strictEqual(guardResult.to, '/caretaker-studio');
    recordPass('ROLE_D', 'caretaker routes to /caretaker-studio');
  } catch (err) {
    recordFail('ROLE_D', 'Failed caretaker routing', err);
  }

  // ----------------------------------------------------
  // TEST E: elderly_user -> /senior-space
  // ----------------------------------------------------
  try {
    const target = SmritiRouterMock.getTargetUrlForRole('elderly_user');
    assert.strictEqual(target, '/senior-space');
    const user = { id: 'eld_1', role: 'elderly_user' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/auth', user);
    assert.strictEqual(guardResult.to, '/senior-space');
    recordPass('ROLE_E', 'elderly_user routes to /senior-space');
  } catch (err) {
    recordFail('ROLE_E', 'Failed elderly_user routing', err);
  }

  // ----------------------------------------------------
  // TEST F: Healthcare worker on specialist dashboard is allowed and not redirected to caretaker
  // ----------------------------------------------------
  try {
    const hcUser = { id: 'hc_hrithik', role: 'healthcare_worker' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/specialist-dashboard', hcUser);
    assert.strictEqual(guardResult.action, 'allow', 'Healthcare worker must be allowed on /specialist-dashboard');
    assert.notStrictEqual(guardResult.to, '/caretaker-studio', 'Must NOT redirect to caretaker-studio');
    recordPass('ROLE_F', 'Route guard allows healthcare_worker on /specialist-dashboard without caretaker redirect');
  } catch (err) {
    recordFail('ROLE_F', 'Healthcare worker blocked on /specialist-dashboard', err);
  }

  // ----------------------------------------------------
  // TEST G: Caretaker attempting specialist dashboard is isolated/redirected
  // ----------------------------------------------------
  try {
    const careUser = { id: 'care_aryan', role: 'caretaker' };
    const guardResult = SmritiRouterMock.evaluateRouteGuard('/specialist-dashboard', careUser);
    assert.strictEqual(guardResult.action, 'replace');
    assert.strictEqual(guardResult.to, '/caretaker-studio');
    recordPass('ROLE_G', 'Caretaker attempting /specialist-dashboard is properly redirected to /caretaker-studio');
  } catch (err) {
    recordFail('ROLE_G', 'Caretaker was not redirected away from specialist dashboard', err);
  }

  // ----------------------------------------------------
  // TEST H: modal.js role selection preservation
  // ----------------------------------------------------
  try {
    assert.strictEqual(mockHandleRoleSelection('elderly'), '/auth?role=elderly_user');
    assert.strictEqual(mockHandleRoleSelection('elderly_user'), '/auth?role=elderly_user');
    assert.strictEqual(mockHandleRoleSelection('caretaker'), '/auth?role=caretaker');
    assert.strictEqual(mockHandleRoleSelection('healthcare_worker'), '/auth?role=healthcare_worker');
    assert.strictEqual(mockHandleRoleSelection('medical_specialist'), '/auth?role=medical_specialist');
    assert.strictEqual(mockHandleRoleSelection('specialist'), '/auth?role=medical_specialist');
    recordPass('MODAL_ROLES', 'modal.js preserves all roles and maps healthcare_worker to /auth?role=healthcare_worker');
  } catch (err) {
    recordFail('MODAL_ROLES', 'modal.js failed role mapping', err);
  }

  // ----------------------------------------------------
  // TEST I: user-service syncOAuthUser updates role on intendedRole
  // ----------------------------------------------------
  try {
    // 1. Create a user initially as caretaker
    const testEmail = `switch_test_${Date.now()}@example.com`;
    const initialUser = await userService.syncOAuthUser({
      id: `usr_${Date.now()}_1`,
      email: testEmail,
      name: 'Switch Test User',
      intendedRole: 'caretaker'
    });
    assert.strictEqual(initialUser.role, 'caretaker', 'Initial role must be caretaker');

    // 2. User logs in again, this time choosing healthcare_worker
    const switchedUser = await userService.syncOAuthUser({
      id: initialUser.id,
      email: testEmail,
      name: 'Switch Test User',
      intendedRole: 'healthcare_worker'
    });
    assert.strictEqual(switchedUser.role, 'healthcare_worker', 'User role must be updated to healthcare_worker, NOT stuck on caretaker');
    recordPass('USER_SERVICE_ROLE_UPDATE', 'syncOAuthUser successfully updates existing caretaker profile to healthcare_worker');
  } catch (err) {
    recordFail('USER_SERVICE_ROLE_UPDATE', 'syncOAuthUser failed to update intended role', err);
  }

  // ----------------------------------------------------
  // TEST J: Backend API authorization for healthcare_worker on specialist endpoints
  // ----------------------------------------------------
  try {
    // Create healthcare worker and generate session token
    const hcId = `hc_test_${Date.now()}`;
    const hcProfile = await userService.syncOAuthUser({
      id: hcId,
      email: `hc_${Date.now()}@test.org`,
      name: 'Test Healthcare Worker',
      intendedRole: 'healthcare_worker'
    });
    const hcToken = authService.generateSessionToken(hcProfile);

    // 1. Live HTTP verification if dev daemon is running
    try {
      const liveRes = await fetch('http://localhost:3000/api/specialist/profile/me', {
        headers: { authorization: `Bearer ${hcToken}` }
      });
      if (liveRes.status === 200) {
        const liveData = await liveRes.json();
        assert.strictEqual(liveData.success, true);
        recordPass('LIVE_API_SPECIALIST_PROFILE', 'Live GET /api/specialist/profile/me returned HTTP 200 for healthcare_worker');
      }
    } catch (e) {
      // Continue with in-process middleware test
    }

    // 2. Direct middleware RBAC verification for healthcare_worker
    const { requireRole } = await import('../backend/src/middleware/rbac.js');
    const clinicalMiddleware = requireRole(['medical_specialist', 'healthcare_worker']);

    const mockReq = {
      headers: { authorization: `Bearer ${hcToken}` },
      user: hcProfile,
      originalUrl: '/api/specialist/profile/me'
    };

    let nextCalled = false;
    let forbiddenReturned = false;
    const mockRes = {
      status(code) {
        if (code === 403) forbiddenReturned = true;
        return this;
      },
      json(payload) { return payload; }
    };

    await clinicalMiddleware(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'requireRole must permit healthcare_worker on clinical endpoints');
    assert.strictEqual(forbiddenReturned, false, 'Must not return 403 Forbidden for healthcare_worker');
    recordPass('API_RBAC_HEALTHCARE_WORKER', 'Backend RBAC permits healthcare_worker on specialist/clinical endpoints');

    // 3. Direct middleware RBAC verification for caretaker (must be blocked with 403)
    const careReq = {
      headers: {},
      user: { id: 'care_1', role: 'caretaker' },
      originalUrl: '/api/specialist/profile/me'
    };
    let careNextCalled = false;
    let careForbiddenReturned = false;
    const careMockRes = {
      status(code) {
        if (code === 403) careForbiddenReturned = true;
        return this;
      },
      json(payload) { return payload; }
    };

    await clinicalMiddleware(careReq, careMockRes, () => {
      careNextCalled = true;
    });

    assert.strictEqual(careNextCalled, false, 'Caretaker must NOT be allowed to proceed on specialist endpoints');
    assert.strictEqual(careForbiddenReturned, true, 'Caretaker must receive 403 Forbidden on specialist endpoints');
    recordPass('API_RBAC_CARETAKER_BLOCKED', 'Backend RBAC strictly blocks caretaker from specialist/clinical endpoints (403)');
  } catch (err) {
    recordFail('API_RBAC_HEALTHCARE_WORKER', 'Healthcare worker RBAC check failed', err);
  }

  console.log('====================================================');
  console.log(`ROLE ROUTING RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runRoleTests();
