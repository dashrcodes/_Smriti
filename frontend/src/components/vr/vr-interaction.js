/**
 * SMRITI VR INTERACTION MANAGER
 * Reusable, dementia-friendly 3D interaction system for Smriti VR:
 * - Unified raycasting for Desktop mouse, WebXR controllers, and Gaze-Dwell
 * - Visual hover feedback: subtle forward float, emissive border highlight, reticle cue
 * - Dynamic 3D floating focus badges ("View Memory", "Meet Family", "Play a Memory Game", etc.)
 * - In-world inspection state: smoothly focuses selected objects with large readable plaques
 * - Reassuring 3D "Back to Room" return target
 * - Non-intrusive voice confirmation via VoiceService
 */

import { VR_CONFIG } from './vr-ui.js';

export class VRInteractionManager {
  constructor({ scene, camera, cameraRig, onSpeak, onOpenTalk, onStateChange }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.onSpeak = onSpeak || (() => {});
    this.onOpenTalk = onOpenTalk || null;
    this.onStateChange = onStateChange || null;

    // Registered interactive targets: Map of id -> TargetConfig
    this.targets = new Map();
    // All pickable Three.js meshes mapped back to target ID
    this.meshToTargetId = new Map();

    // Current interaction states
    this.currentFocusedTarget = null;
    this.activeInspectedTarget = null;
    this.dwellTimer = 0;

    // Inspection overlay 3D group
    this.inspectionGroup = new THREE.Group();
    this.inspectionGroup.visible = false;
    this.scene.add(this.inspectionGroup);

    // Floating 3D focus badge
    this.floatingBadgeGroup = new THREE.Group();
    this.floatingBadgeGroup.visible = false;
    this.scene.add(this.floatingBadgeGroup);

    // Cache allocated inspection textures & meshes for clean disposal
    this.allocatedAssets = [];

    // Interaction scope ('all' | 'game' | 'talk')
    this.activeScope = 'all';

    // Physical forward-reveal active target
    this.forwardMovedTarget = null;

    this.initFloatingBadge();
    this.initInspectionPlaqueBase();
  }

  /**
   * Initializes the floating 3D billboard focus badge that hovers above focused objects
   */
  initFloatingBadge() {
    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 512;
    this.badgeCanvas.height = 128;
    this.badgeCtx = this.badgeCanvas.getContext('2d');

    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.minFilter = THREE.LinearFilter;
    this.badgeTexture.generateMipmaps = false;
    this.allocatedAssets.push(this.badgeTexture);

    const badgeGeo = new THREE.PlaneGeometry(0.85, 0.22);
    const badgeMat = new THREE.MeshBasicMaterial({
      map: this.badgeTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false
    });
    this.allocatedAssets.push(badgeGeo, badgeMat);

    this.badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    this.badgeMesh.renderOrder = 900;
    this.floatingBadgeGroup.add(this.badgeMesh);
  }

  /**
   * Redraws the floating 3D focus badge canvas
   */
  updateBadgeContent(label, sublabel = '', accentHex = '#F59E0B') {
    const ctx = this.badgeCtx;
    const w = this.badgeCanvas.width;
    const h = this.badgeCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Rounded pill background
    const radius = 28;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(radius, 4);
    ctx.lineTo(w - radius, 4);
    ctx.quadraticCurveTo(w - 4, 4, w - 4, radius);
    ctx.lineTo(w - 4, h - radius);
    ctx.quadraticCurveTo(w - 4, h - 4, w - radius, h - 4);
    ctx.lineTo(radius, h - 4);
    ctx.quadraticCurveTo(4, h - 4, 4, h - radius);
    ctx.lineTo(4, radius);
    ctx.quadraticCurveTo(4, 4, radius, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Primary Action Text (large, high-contrast)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const yPos = sublabel ? h * 0.42 : h * 0.5;
    ctx.fillText(label, w / 2, yPos);

    if (sublabel) {
      ctx.fillStyle = accentHex;
      ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(sublabel, w / 2, h * 0.78);
    }

    this.badgeTexture.needsUpdate = true;
  }

  /**
   * Initializes the 3D inspection modal base (plaque, image frame, and return button)
   */
  initInspectionPlaqueBase() {
    // 1. Semi-transparent backdrop scrim to softly dim background
    const scrimGeo = new THREE.PlaneGeometry(12, 8);
    const scrimMat = new THREE.MeshBasicMaterial({
      color: 0x0A0D14,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(scrimGeo, scrimMat);
    const scrimMesh = new THREE.Mesh(scrimGeo, scrimMat);
    scrimMesh.position.set(0, 1.5, -2.5);
    this.inspectionGroup.add(scrimMesh);

    // 2. Inspection Card Main Canvas Plaque
    this.detailCanvas = document.createElement('canvas');
    this.detailCanvas.width = 1024;
    this.detailCanvas.height = 512;
    this.detailCtx = this.detailCanvas.getContext('2d');

    this.detailTexture = new THREE.CanvasTexture(this.detailCanvas);
    this.detailTexture.minFilter = THREE.LinearFilter;
    this.allocatedAssets.push(this.detailTexture);

    const detailGeo = new THREE.PlaneGeometry(2.4, 1.2);
    const detailMat = new THREE.MeshBasicMaterial({
      map: this.detailTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(detailGeo, detailMat);

    this.detailMesh = new THREE.Mesh(detailGeo, detailMat);
    this.detailMesh.position.set(0, 1.5, -2.1);
    this.inspectionGroup.add(this.detailMesh);

    // 3. Physical 3D Buttons: "Back to Room" and "Talk with Smriti"
    // Left: "← Back to Room"
    this.backButtonCanvas = document.createElement('canvas');
    this.backButtonCanvas.width = 512;
    this.backButtonCanvas.height = 128;
    const bCtx = this.backButtonCanvas.getContext('2d');
    bCtx.fillStyle = '#FFFFFF';
    bCtx.fillRect(4, 4, 504, 120);
    bCtx.strokeStyle = '#D97706';
    bCtx.lineWidth = 6;
    bCtx.strokeRect(4, 4, 504, 120);
    bCtx.fillStyle = '#0F172A';
    bCtx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText('← Back to Room', 256, 64);

    this.backButtonTexture = new THREE.CanvasTexture(this.backButtonCanvas);
    this.backButtonTexture.minFilter = THREE.LinearFilter;
    this.allocatedAssets.push(this.backButtonTexture);

    const backGeo = new THREE.PlaneGeometry(0.85, 0.25);
    const backMat = new THREE.MeshBasicMaterial({
      map: this.backButtonTexture,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(backGeo, backMat);

    this.backButtonMesh = new THREE.Mesh(backGeo, backMat);
    this.backButtonMesh.position.set(-0.52, 0.72, -2.05);
    this.inspectionGroup.add(this.backButtonMesh);

    this.backButtonMesh.userData = {
      isBackButton: true,
      onClick: () => this.closeInspection()
    };

    // Right: "🗣️ Talk with Smriti" (Takes current photo/family context into conversation)
    this.talkButtonCanvas = document.createElement('canvas');
    this.talkButtonCanvas.width = 512;
    this.talkButtonCanvas.height = 128;
    const tCtx = this.talkButtonCanvas.getContext('2d');
    tCtx.fillStyle = '#FFFBEB';
    tCtx.fillRect(4, 4, 504, 120);
    tCtx.strokeStyle = '#F59E0B';
    tCtx.lineWidth = 6;
    tCtx.strokeRect(4, 4, 504, 120);
    tCtx.fillStyle = '#78350F';
    tCtx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText('🗣️ Talk with Smriti', 256, 64);

    this.talkButtonTexture = new THREE.CanvasTexture(this.talkButtonCanvas);
    this.talkButtonTexture.minFilter = THREE.LinearFilter;
    this.allocatedAssets.push(this.talkButtonTexture);

    const talkGeo = new THREE.PlaneGeometry(0.85, 0.25);
    const talkMat = new THREE.MeshBasicMaterial({
      map: this.talkButtonTexture,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(talkGeo, talkMat);

    this.talkButtonMesh = new THREE.Mesh(talkGeo, talkMat);
    this.talkButtonMesh.position.set(0.52, 0.72, -2.05);
    this.inspectionGroup.add(this.talkButtonMesh);

    this.talkButtonMesh.userData = {
      isTalkButton: true,
      onClick: () => {
        const data = this.activeInspectedTarget;
        this.closeInspection();
        if (typeof this.onOpenTalk === 'function') {
          this.onOpenTalk(data);
        }
      }
    };
  }

  /**
   * Registers an interactable 3D world object
   */
  register(config) {
    if (!config || !config.id || !config.rootGroup) return;

    const targetConfig = {
      id: config.id,
      category: config.category || 'general', // 'memory' | 'family' | 'game' | 'music' | 'talk'
      rootGroup: config.rootGroup,
      pickableMeshes: Array.isArray(config.pickableMeshes) ? config.pickableMeshes : [config.rootGroup],
      focusLabel: config.focusLabel || 'Select Object',
      focusSublabel: config.focusSublabel || '',
      accentHex: config.accentHex || '#F59E0B',
      accentColorNum: config.accentColorNum || 0xF59E0B,
      defaultColorNum: config.defaultColorNum || 0x2A241C,
      highlightMesh: config.highlightMesh || null,
      inspectData: config.inspectData || null,
      onFocus: config.onFocus || null,
      onBlur: config.onBlur || null,
      onSelect: config.onSelect || null,
      badgeOffsetY: config.badgeOffsetY || 0.9
    };

    this.targets.set(config.id, targetConfig);

    // Map each child mesh to this target ID for fast raycasting lookup
    targetConfig.pickableMeshes.forEach(mesh => {
      mesh.userData = mesh.userData || {};
      mesh.userData.targetId = config.id;
      this.meshToTargetId.set(mesh, config.id);
    });
  }

  /**
   * Unregisters an object
   */
  unregister(targetId) {
    const target = this.targets.get(targetId);
    if (!target) return;

    target.pickableMeshes.forEach(mesh => {
      this.meshToTargetId.delete(mesh);
    });
    this.targets.delete(targetId);
  }

  /**
   * Sets the interaction scope ('all' for general room exploration, 'game' for isolated 3D games)
   */
  setInteractionScope(scope = 'all') {
    this.activeScope = scope;
    if (this.currentFocusedTarget) {
      this.applyBlur(this.currentFocusedTarget);
      this.currentFocusedTarget = null;
    }
    this.dwellTimer = 0;
  }

  /**
   * Returns list of all pickable meshes across all registered targets within the active scope
   */
  getPickableMeshes() {
    if (this.inspectionGroup.visible) {
      const meshes = [];
      if (this.backButtonMesh) meshes.push(this.backButtonMesh);
      if (this.talkButtonMesh) meshes.push(this.talkButtonMesh);
      return meshes;
    }
    if (this.activeScope !== 'all') {
      const meshes = [];
      for (const [mesh, targetId] of this.meshToTargetId.entries()) {
        const target = this.targets.get(targetId);
        if (target && target.category === this.activeScope) {
          meshes.push(mesh);
        }
      }
      return meshes;
    }
    return Array.from(this.meshToTargetId.keys());
  }

  /**
   * Core interaction cycle: evaluates ray hits and updates dwell / focus
   */
  handleRaycastHit(intersectedObject, deltaMs, reticle) {
    // If modal inspection is open, both back button and talk button are active
    if (this.inspectionGroup.visible) {
      if (intersectedObject === this.backButtonMesh) {
        this.backButtonMesh.scale.set(1.05, 1.05, 1);
        if (this.talkButtonMesh) this.talkButtonMesh.scale.set(1, 1, 1);
        if (reticle) reticle.setProgress(0.6);
      } else if (intersectedObject === this.talkButtonMesh) {
        this.talkButtonMesh.scale.set(1.05, 1.05, 1);
        if (this.backButtonMesh) this.backButtonMesh.scale.set(1, 1, 1);
        if (reticle) reticle.setProgress(0.6);
      } else {
        if (this.backButtonMesh) this.backButtonMesh.scale.set(1, 1, 1);
        if (this.talkButtonMesh) this.talkButtonMesh.scale.set(1, 1, 1);
        if (reticle) reticle.setProgress(0);
      }
      return;
    }

    let targetId = null;
    if (intersectedObject) {
      targetId = intersectedObject.userData?.targetId || this.meshToTargetId.get(intersectedObject) || null;
    }

    const target = targetId ? this.targets.get(targetId) : null;

    if (target) {
      if (this.currentFocusedTarget === target) {
        // Continue dwelling on the currently focused target
        this.dwellTimer += deltaMs;
        const progress = Math.min(1, this.dwellTimer / VR_CONFIG.DWELL_DURATION_MS);
        if (reticle) reticle.setProgress(progress);

        if (this.dwellTimer >= VR_CONFIG.DWELL_DURATION_MS) {
          // Gaze-dwell completed!
          this.dwellTimer = 0;
          if (reticle) reticle.setProgress(0);
          this.triggerSelect(target);
        }
      } else {
        // Switched focus to a new target
        if (this.currentFocusedTarget) {
          this.applyBlur(this.currentFocusedTarget);
        }
        this.currentFocusedTarget = target;
        this.dwellTimer = 0;
        if (reticle) reticle.setProgress(0.1);
        this.applyFocus(target);
      }
    } else {
      // Gazing at empty space
      if (this.currentFocusedTarget) {
        this.applyBlur(this.currentFocusedTarget);
        this.currentFocusedTarget = null;
      }
      this.dwellTimer = 0;
      if (reticle) reticle.setProgress(0);
      this.floatingBadgeGroup.visible = false;
    }
  }

  /**
   * Applies gentle hover/focus visual enhancements and spatial focus zone
   */
  applyFocus(target) {
    if (!target) return;
    this.currentFocusedTarget = target;

    // 0. Soft acoustic focus feedback
    if (typeof window !== 'undefined' && window.smritiAudio?.playChime) {
      window.smritiAudio.playChime(659.25, 0.08, 'sine');
    }

    // 1. Highlight border / mesh
    if (target.highlightMesh?.material) {
      target.highlightMesh.material.color.setHex(target.accentColorNum);
      if (target.highlightMesh.material.emissive) {
        target.highlightMesh.material.emissive.setHex(target.accentColorNum);
        target.highlightMesh.material.emissiveIntensity = 0.45;
      }
    }

    // 2. Subtle forward float for depth feedback
    target.rootGroup.position.y += 0.06;
    target.rootGroup.scale.set(1.04, 1.04, 1.04);

    // 3. Spatial Focus Zone: Subdue neighboring targets of the same category
    for (const [tId, other] of this.targets.entries()) {
      if (other !== target && other.category === target.category) {
        if (other.highlightMesh?.material?.emissive) {
          other.highlightMesh.material.emissiveIntensity = 0.0;
        }
        other.rootGroup.scale.set(0.97, 0.97, 0.97);
      }
    }

    // 4. Position and show 3D floating focus badge
    this.updateBadgeContent(target.focusLabel, target.focusSublabel, target.accentHex);
    const worldPos = new THREE.Vector3();
    if (typeof target.rootGroup.getWorldPosition === 'function') {
      target.rootGroup.getWorldPosition(worldPos);
    } else {
      worldPos.copy(target.rootGroup.position);
    }

    this.floatingBadgeGroup.position.set(
      worldPos.x,
      worldPos.y + target.badgeOffsetY,
      worldPos.z
    );
    // Face user at camera position
    this.floatingBadgeGroup.lookAt(this.camera.position.x, worldPos.y + target.badgeOffsetY, this.camera.position.z);
    this.floatingBadgeGroup.visible = true;

    // Optional custom focus hook
    if (typeof target.onFocus === 'function') {
      target.onFocus();
    }
  }

  /**
   * Resets visual states on blur and restores neighbor baseline transforms
   */
  applyBlur(target) {
    if (!target) return;
    if (this.currentFocusedTarget === target) {
      this.currentFocusedTarget = null;
    }

    if (target.highlightMesh?.material) {
      target.highlightMesh.material.color.setHex(target.defaultColorNum);
      if (target.highlightMesh.material.emissive) {
        target.highlightMesh.material.emissive.setHex(0x000000);
        target.highlightMesh.material.emissiveIntensity = 0;
      }
    }

    target.rootGroup.position.y -= 0.06;
    target.rootGroup.scale.set(1.0, 1.0, 1.0);

    // Restore baseline scale for neighboring targets
    for (const [tId, other] of this.targets.entries()) {
      if (other !== target && other.category === target.category) {
        other.rootGroup.scale.set(1.0, 1.0, 1.0);
      }
    }

    this.floatingBadgeGroup.visible = false;

    if (typeof target.onBlur === 'function') {
      target.onBlur();
    }
  }

  /**
   * Dispatches selection (Click, Trigger, or Dwell)
   */
  triggerSelect(target) {
    if (!target) return;

    // Soft selection confirmation chime
    if (typeof window !== 'undefined' && window.smritiAudio?.playChime) {
      window.smritiAudio.playChime(528, 0.25, 'sine');
    }

    // Hide floating badge while inspection is open
    this.floatingBadgeGroup.visible = false;

    // Trigger target-specific select callback
    if (typeof target.onSelect === 'function') {
      target.onSelect(target);
    } else if (target.inspectData) {
      // Open in-world inspection with physical forward movement
      this.openInspection(target.inspectData, target);
    }
  }

  /**
   * Handles user click (desktop mouse click or XR controller trigger)
   */
  handleDirectClick(intersectedObject) {
    // If inspection modal is open, check back button and talk button
    if (this.inspectionGroup.visible) {
      if (intersectedObject === this.backButtonMesh) {
        this.closeInspection();
      } else if (intersectedObject === this.talkButtonMesh) {
        const inspectedData = this.activeInspectedTarget;
        this.closeInspection();
        if (typeof this.onOpenTalk === 'function') {
          this.onOpenTalk(inspectedData);
        }
      }
      return;
    }

    if (!intersectedObject) return;

    const targetId = intersectedObject.userData?.targetId || this.meshToTargetId.get(intersectedObject);
    const target = targetId ? this.targets.get(targetId) : null;
    if (target) {
      this.triggerSelect(target);
    }
  }

  /**
   * Opens in-world inspection card with physical forward movement of the selected object
   */
  openInspection(data, target = null) {
    if (!data) return;
    this.activeInspectedTarget = data;

    // Physical forward-reveal of memory or family object
    if (target && target.rootGroup && (target.category === 'memory' || target.category === 'family')) {
      this.forwardMovedTarget = target;
      target.originalTransform = {
        pos: { x: target.rootGroup.position.x, y: target.rootGroup.position.y, z: target.rootGroup.position.z },
        rot: { x: target.rootGroup.rotation.x, y: target.rootGroup.rotation.y, z: target.rootGroup.rotation.z },
        scale: { x: target.rootGroup.scale.x, y: target.rootGroup.scale.y, z: target.rootGroup.scale.z }
      };

      // Physically bring the real object forward to comfortable seated eye-level
      target.rootGroup.userData = target.rootGroup.userData || {};
      target.rootGroup.userData.isForwardMoved = true;
      target.rootGroup.position.set(-0.55, 1.45, -1.95);
      target.rootGroup.rotation.set(0, 0, 0);
      target.rootGroup.scale.set(1.15, 1.15, 1.15);

      if (this.onStateChange) {
        this.onStateChange(target.category === 'family' ? 'FAMILY' : 'MEMORY');
      }

      // Detail card and buttons comfortably placed to the right
      this.detailMesh.position.set(0.55, 1.45, -1.95);
      this.backButtonMesh.position.set(0.20, 0.82, -1.92);
      this.talkButtonMesh.position.set(0.92, 0.82, -1.92);
    } else {
      this.forwardMovedTarget = null;
      if (this.onStateChange && target) {
        this.onStateChange(target.category === 'family' ? 'FAMILY' : 'MEMORY');
      }
      this.detailMesh.position.set(0, 1.5, -2.1);
      this.backButtonMesh.position.set(-0.52, 0.72, -2.05);
      this.talkButtonMesh.position.set(0.52, 0.72, -2.05);
    }

    const ctx = this.detailCtx;
    const w = this.detailCanvas.width;
    const h = this.detailCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Card background
    ctx.fillStyle = '#181C28';
    ctx.fillRect(0, 0, w, h);

    // Accent header bar
    ctx.fillStyle = data.accentHex || '#F59E0B';
    ctx.fillRect(0, 0, w, 16);

    // Decorative Icon
    ctx.font = '54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.icon || '❤️', 80, 80);

    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(data.title || 'Sanctuary Memory', 135, 78);

    // Subtitle / Relationship / Date
    ctx.fillStyle = data.accentHex || '#F59E0B';
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(data.subtitle || '', 135, 124);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 155);
    ctx.lineTo(w - 60, 155);
    ctx.stroke();

    // Body Description / Memory Context (Word Wrapped)
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    const description = data.description || data.caption || 'Cherished moment preserved in your family memory vault.';
    this.wrapText(ctx, description, 60, 210, w - 120, 38);

    // Reassuring Bottom Note
    if (data.footerNote) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'italic 20px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(data.footerNote, 60, h - 45);
    }

    this.detailTexture.needsUpdate = true;
    this.inspectionGroup.visible = true;

    // Single calm spoken voice confirmation
    if (data.speechText && this.onSpeak) {
      this.onSpeak(data.speechText, data.speechLang || 'as');
    }
  }

  /**
   * Helper to wrap text cleanly on 2D canvas
   */
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, currY);
        line = words[n] + ' ';
        currY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currY);
  }

  /**
   * Closes the in-world inspection view, restores full room view, and physically returns the object
   */
  closeInspection() {
    // 1. Physically return forward-moved object back to original world position
    if (this.forwardMovedTarget && this.forwardMovedTarget.originalTransform) {
      if (this.forwardMovedTarget.rootGroup?.userData) {
        this.forwardMovedTarget.rootGroup.userData.isForwardMoved = false;
      }
      const orig = this.forwardMovedTarget.originalTransform;
      this.forwardMovedTarget.rootGroup.position.set(orig.pos.x, orig.pos.y, orig.pos.z);
      this.forwardMovedTarget.rootGroup.rotation.set(orig.rot.x, orig.rot.y, orig.rot.z);
      this.forwardMovedTarget.rootGroup.scale.set(orig.scale.x, orig.scale.y, orig.scale.z);
      this.forwardMovedTarget = null;
    }

    this.inspectionGroup.visible = false;
    this.activeInspectedTarget = null;
    if (this.backButtonMesh) this.backButtonMesh.scale.set(1, 1, 1);
    if (this.talkButtonMesh) this.talkButtonMesh.scale.set(1, 1, 1);

    // 2. Soft return sound
    if (typeof window !== 'undefined' && window.smritiAudio?.playSoftTap) {
      window.smritiAudio.playSoftTap();
    }

    // 3. Return environment to standard room atmosphere
    if (this.onStateChange) {
      this.onStateChange('ROOM');
    }
  }

  /**
   * Disposes all allocated textures and geometries
   */
  dispose() {
    if (this.forwardMovedTarget && this.forwardMovedTarget.originalTransform) {
      if (this.forwardMovedTarget.rootGroup?.userData) {
        this.forwardMovedTarget.rootGroup.userData.isForwardMoved = false;
      }
      const orig = this.forwardMovedTarget.originalTransform;
      this.forwardMovedTarget.rootGroup.position.set(orig.pos.x, orig.pos.y, orig.pos.z);
      this.forwardMovedTarget.rootGroup.rotation.set(orig.rot.x, orig.rot.y, orig.rot.z);
      this.forwardMovedTarget.rootGroup.scale.set(orig.scale.x, orig.scale.y, orig.scale.z);
      this.forwardMovedTarget = null;
    }

    this.targets.clear();
    this.meshToTargetId.clear();
    this.currentFocusedTarget = null;
    this.activeInspectedTarget = null;

    this.scene.remove(this.inspectionGroup);
    this.scene.remove(this.floatingBadgeGroup);

    this.allocatedAssets.forEach(a => {
      if (a && typeof a.dispose === 'function') a.dispose();
    });
    this.allocatedAssets = [];
  }
}
