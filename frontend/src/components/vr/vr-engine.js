/**
 * SMRITI VR SANCTUARY ENGINE
 * Core WebXR + Three.js Engine for Senior Space (Phase 2A):
 * - Runtime WebXR capability detection (immersive-vr)
 * - Isolated WebGLRenderer instance (no collision with index.html three-world.js)
 * - Seated, stationary viewpoint (zero artificial camera movement or cybersickness)
 * - Reusable VRInteractionManager: unified raycasting, hover float, 3D badges, inspection modal
 * - Dual-mode input: WebXR 6-DoF controllers + gaze-dwell or Desktop 3D Preview (mouse orbit & click)
 * - Clean session termination & complete GPU asset disposal
 */

import { VR_CONFIG, createGazeReticle } from './vr-ui.js';
import { SmritiVRMemoryWall } from './vr-memory-wall.js';
import { VRInteractionManager } from './vr-interaction.js';
import { VRWorldAtmosphere } from './vr-atmosphere.js';

export class SmritiVREngine {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.cameraRig = null;
    this.renderer = null;
    this.reticle = null;
    this.memoryWall = null;
    this.interactionManager = null;
    this.atmosphere = null;

    this.activeSession = null;
    this.activeMode = null; // 'vr' | 'desktop'
    this.isSessionActive = false;

    this.raycaster = null;
    this.mouse = null;

    // Desktop mouse interaction state
    this.isMouseDown = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.cameraAngles = { yaw: 0, pitch: 0 };
    this.lastFrameTime = performance.now();

    // Allocated environment assets for disposal
    this.allocatedAssets = [];

    // Controller handles
    this.controllers = [];
  }

  /**
   * Runtime WebXR detection: tests if the browser/device supports immersive-vr
   */
  static async isWebXRImmersiveSupported() {
    if (typeof navigator !== 'undefined' && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
      try {
        return await navigator.xr.isSessionSupported('immersive-vr');
      } catch (err) {
        console.warn('[SmritiVREngine] WebXR detection check returned error:', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Initializes and starts the 3D Memory Room
   */
  async start({
    containerEl,
    expData,
    sessionToken,
    mode = 'desktop',
    onExit,
    onSpeak,
    voiceService,
    currentPack,
    elderlyUserId,
    cognitiveClient,
    onRecordSession
  }) {
    if (this.isSessionActive) {
      console.warn('[SmritiVREngine] Session already active, ignoring start request.');
      return;
    }

    if (typeof THREE === 'undefined') {
      console.error('[SmritiVREngine] Three.js r128 library is not available in browser runtime.');
      return;
    }

    this.container = containerEl;
    this.expData = expData || {};
    this.sessionToken = sessionToken || '';
    this.activeMode = mode;
    this.onExit = onExit || (() => {});
    this.onSpeak = onSpeak || (() => {});
    this.voiceService = voiceService || (typeof window !== 'undefined' ? window.VoiceService : null);
    this.currentPack = currentPack || null;
    this.elderlyUserId = elderlyUserId || 'elderly_user';
    this.cognitiveClient = cognitiveClient || null;
    this.onRecordSession = onRecordSession || null;

    // 1. Setup isolated Three.js Scene, Camera, and Renderer
    this.setupScene();
    this.setupEnvironment();
    this.setupReticle();

    // 2. Setup Unified 3D Interaction Manager
    this.interactionManager = new VRInteractionManager({
      scene: this.scene,
      camera: this.camera,
      cameraRig: this.cameraRig,
      onSpeak: this.onSpeak,
      onOpenTalk: (contextData) => {
        if (this.memoryWall && typeof this.memoryWall.openTalkCompanion === 'function') {
          this.memoryWall.openTalkCompanion(contextData);
        }
      },
      onStateChange: (state) => this.setExperienceState(state)
    });

    // 3. Build Memory Room & Physical Interactive Stations
    this.memoryWall = new SmritiVRMemoryWall({
      scene: this.scene,
      camera: this.camera,
      cameraRig: this.cameraRig,
      expData: this.expData,
      sessionToken: this.sessionToken,
      interactionManager: this.interactionManager,
      onSpeak: this.onSpeak,
      voiceService: this.voiceService,
      currentPack: this.currentPack,
      elderlyUserId: this.elderlyUserId,
      cognitiveClient: this.cognitiveClient,
      onRecordSession: this.onRecordSession,
      onStateChange: (state) => this.setExperienceState(state)
    });

    // 4. Initiate WebXR session or Desktop fallback
    if (this.activeMode === 'vr') {
      await this.startWebXRSession();
    } else {
      this.setupDesktopControls();
    }

    // 5. Start Render Loop
    this.isSessionActive = true;
    this.lastFrameTime = performance.now();
    this.renderer.setAnimationLoop((time, frame) => this.renderLoop(time, frame));
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // Warm twilight fog for soft living room depth
    this.scene.fog = new THREE.FogExp2(0x181C28, 0.038);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Stationary Camera Rig: Eye level at y=1.5m to simulate a relaxed, seated senior
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100);
    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 1.5, 0);
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    // Isolated WebGLRenderer dedicated to the VR canvas
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Enable WebXR on the renderer
    this.renderer.xr.enabled = true;

    // Raycasting & pointer initialization
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(0, 0);

    // Clear previous canvases if any, and append
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Window resize handler
    this.onResize = () => {
      if (!this.renderer || !this.camera || this.activeMode === 'vr') return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);
  }

  setupEnvironment() {
    this.atmosphere = new VRWorldAtmosphere({
      scene: this.scene,
      camera: this.camera,
      allocatedAssets: this.allocatedAssets
    });
  }

  /**
   * Updates environmental mood based on active interaction (Phase 3: atmosphere reinforces interaction)
   */
  setExperienceState(state) {
    if (this.atmosphere && typeof this.atmosphere.setState === 'function') {
      this.atmosphere.setState(state);
    }
  }

  setupReticle() {
    this.reticle = createGazeReticle();
    this.camera.add(this.reticle.group);
  }

  /**
   * Initializes native WebXR immersive-vr session
   */
  async startWebXRSession() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });

      this.activeSession = session;
      this.renderer.xr.setSession(session);

      session.addEventListener('end', () => {
        this.exit();
      });

      this.setupXRControllers();

    } catch (err) {
      console.warn('[SmritiVREngine] Failed to start WebXR session, falling back to Desktop Preview:', err);
      this.activeMode = 'desktop';
      this.setupDesktopControls();
    }
  }

  setupXRControllers() {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);

      // Gentle laser pointer line (length 3.5m)
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -3.5)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xF59E0B,
        transparent: true,
        opacity: 0.65
      });
      this.allocatedAssets.push(lineGeo, lineMat);

      const line = new THREE.Line(lineGeo, lineMat);
      controller.add(line);

      // Trigger selection via laser raycast
      controller.addEventListener('selectstart', () => {
        if (!this.interactionManager) return;
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        const rayDirection = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
        const rayOrigin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.set(rayOrigin, rayDirection);

        const pickable = this.interactionManager.getPickableMeshes();
        const hits = this.raycaster.intersectObjects(pickable, false);
        if (hits.length > 0) {
          this.interactionManager.handleDirectClick(hits[0].object);
        }
      });

      this.cameraRig.add(controller);
      this.controllers.push(controller);
    }
  }

  /**
   * Desktop 3D Preview: Mouse drag to look around, cursor raycast & click to select
   */
  setupDesktopControls() {
    const dom = this.renderer.domElement;

    this.onMouseDown = (e) => {
      this.isMouseDown = true;
      this.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    this.onMouseMove = (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Mouse drag for camera orbit
      if (this.isMouseDown) {
        const deltaX = e.clientX - this.prevMousePos.x;
        const deltaY = e.clientY - this.prevMousePos.y;

        this.cameraAngles.yaw -= deltaX * 0.003;
        this.cameraAngles.pitch -= deltaY * 0.003;
        // Clamp pitch to avoid disorientation
        this.cameraAngles.pitch = Math.max(-0.6, Math.min(0.6, this.cameraAngles.pitch));

        this.camera.rotation.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.cameraAngles.yaw;
        this.camera.rotation.x = this.cameraAngles.pitch;

        this.prevMousePos = { x: e.clientX, y: e.clientY };
      }
    };

    this.onMouseUp = () => {
      this.isMouseDown = false;
    };

    this.onClick = (e) => {
      if (!this.interactionManager || !this.renderer) return;
      const rect = dom.getBoundingClientRect();
      const clickPos = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(clickPos, this.camera);
      const pickable = this.interactionManager.getPickableMeshes();
      const hits = this.raycaster.intersectObjects(pickable, false);
      if (hits.length > 0) {
        this.interactionManager.handleDirectClick(hits[0].object);
      }
    };

    this.onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (this.interactionManager?.inspectionGroup?.visible) {
          this.interactionManager.closeInspection();
        } else {
          this.exit();
        }
      }
    };

    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    dom.addEventListener('click', this.onClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * Main Render Loop (called via renderer.setAnimationLoop)
   */
  renderLoop(time, frame) {
    const now = performance.now();
    const deltaMs = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;

    // 1. Living World Atmosphere & Light Motes Update (Phase 3)
    if (this.atmosphere && typeof this.atmosphere.update === 'function') {
      this.atmosphere.update(deltaMs);
    }

    // 2. Memory Room & Active Game Stage Animation Tick
    if (this.memoryWall && typeof this.memoryWall.update === 'function') {
      this.memoryWall.update(deltaMs);
    }

    // 3. Raycasting & Unified Interaction Update
    this.updateGazeAndInteraction(deltaMs);

    // 3. Render frame
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Raycasts against all registered physical interactive targets
   */
  updateGazeAndInteraction(deltaMs) {
    if (!this.interactionManager) return;

    // In Desktop mode, raycast from mouse cursor; in VR mode, raycast from camera center reticle
    if (this.activeMode === 'desktop' && !this.isMouseDown && Math.abs(this.mouse.x) <= 1 && Math.abs(this.mouse.y) <= 1) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
    } else {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    }

    const pickable = this.interactionManager.getPickableMeshes();
    if (!pickable || pickable.length === 0) return;

    const intersects = this.raycaster.intersectObjects(pickable, false);
    const hitObject = (intersects.length > 0 && intersects[0].distance < VR_CONFIG.POINTER_MAX_DISTANCE)
      ? intersects[0].object
      : null;

    this.interactionManager.handleRaycastHit(hitObject, deltaMs, this.reticle);
  }

  /**
   * Safely exits the VR/3D Sanctuary, disposes all GPU assets, and restores Senior Space
   */
  exit() {
    if (!this.isSessionActive) return;
    this.isSessionActive = false;

    // 1. Terminate native WebXR session if active
    if (this.activeSession) {
      try {
        this.activeSession.end();
      } catch (e) {}
      this.activeSession = null;
    }

    // 2. Halt animation loop
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }

    // 3. Remove desktop listeners
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
      this.renderer.domElement.removeEventListener('click', this.onClick);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('resize', this.onResize);
    }

    // 4. Dispose Interaction Manager
    if (this.interactionManager) {
      this.interactionManager.dispose();
      this.interactionManager = null;
    }

    // 5. Dispose Memory Wall & Stations
    if (this.memoryWall) {
      this.memoryWall.dispose();
      this.memoryWall = null;
    }

    // 6. Dispose Atmosphere
    if (this.atmosphere) {
      this.atmosphere.dispose();
      this.atmosphere = null;
    }

    // 7. Dispose Allocated Environment Geometries & Materials
    this.allocatedAssets.forEach(asset => {
      if (asset && typeof asset.dispose === 'function') {
        asset.dispose();
      }
    });
    this.allocatedAssets = [];

    // 8. Dispose Renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement) {
        this.container.innerHTML = '';
      }
      this.renderer = null;
    }

    // 8. Fire onExit callback to restore 2D Senior Space DOM
    if (typeof this.onExit === 'function') {
      this.onExit();
    }
  }
}

// Global Singleton Instance
export const smritiVREngine = new SmritiVREngine();
if (typeof window !== 'undefined') {
  window.SmritiVREngine = smritiVREngine;
}
