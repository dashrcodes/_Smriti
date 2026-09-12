/**
 * SMRITI VR TALK & RECALL COMPANION
 * Dedicated 3D voice reminiscence companion inside the Memory Room:
 * - Stylized 3D Companion "Smriti": Warm meditation pedestal, luminous teardrop lantern orb,
 *   floating halo ring, friendly smiling eyes, and ambient breathing/speaking animation.
 * - Reuses the exact same Talk & Recall pipeline: VoiceService, CognitiveClient,
 *   sendConversationMessage(), conversationHistory, elderlyUserId, language selection.
 * - Multi-turn conversation preserving context across 5+ consecutive turns.
 * - In-world large readable controls: 🎤 TALK / ⏹ STOP, ⌨ TYPE, ↩ BACK.
 * - Visual state machine: READY -> LISTENING -> THINKING -> SPEAKING -> ERROR.
 * - In-world conversation plaque with YOU, SMRITI, and visually distinct state badges.
 * - Large text fallback modal inside VR Talk station routing through the exact same API.
 * - Contextual VR actions: "show my memories" displays physical photo props / connects to memory wall.
 * - Robust error handling (not-allowed, no-speech, audio-capture, backend timeout) with auto-recovery to READY.
 * - Dementia-friendly pacing, large targets, and clean resource disposal with zero duplicate listeners.
 */

import { VR_CONFIG, formatFamilyDisplayName } from './vr-ui.js';

export class VRTalkCompanion {
  constructor({
    scene,
    camera,
    cameraRig,
    expData,
    elderlyUserId,
    cognitiveClient,
    voiceService,
    onReturnToRoom,
    onNavigateToMemoryWall,
    interactionManager,
    initialContext = null
  }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.expData = expData || {};
    this.elderlyUserId = elderlyUserId || (typeof window !== 'undefined' && window.smritiAuth ? window.smritiAuth.getUser()?.id : null) || 'elderly_user';
    this.cognitiveClient = cognitiveClient || (typeof window !== 'undefined' ? window.CognitiveClient : null);
    this.voiceService = voiceService || (typeof window !== 'undefined' ? window.VoiceService : null);
    this.onReturnToRoom = onReturnToRoom || (() => {});
    this.onNavigateToMemoryWall = onNavigateToMemoryWall || null;
    this.interactionManager = interactionManager;

    // Conversational State Machine: 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR'
    this.companionState = 'READY';
    this.activeContext = initialContext; // { type: 'photo' | 'family', data: {...} }
    this.conversationHistory = [];
    this.currentLanguage = this.expData?.profile?.preferredLanguage || 'as';
    this.latestTranscript = '';
    this.latestReply = '';
    this.suggestedReplies = [];

    // Root 3D group positioned comfortably in the user's primary seated field of view
    this.talkRoot = new THREE.Group();
    this.talkRoot.position.set(0, 1.35, -1.9);
    this.scene.add(this.talkRoot);

    // Track targets & allocated GPU assets
    this.talkTargetIds = [];
    this.allocatedAssets = [];
    this.activeAnimators = [];
    this.animTime = 0;
    this.errorTimer = null;
    this.speechFallbackTimer = null;

    // Component references
    this.companionGroup = null;
    this.companionMat = null;
    this.haloMat = null;
    this.haloMesh = null;
    this.companionLight = null;
    this.statusPlaqueMesh = null;
    this.transcriptPlaqueMesh = null;
    this.micButtonMesh = null;
    this.typeButtonMesh = null;
    this.returnButtonMesh = null;
    this.chipGroup = null;
    this.contextPropGroup = null;

    // Bound DOM handlers for text fallback
    this.boundOnTextSubmit = null;
    this.boundOnTextClose = null;
    this.boundOnTextKeyDown = null;
  }

  /**
   * Opens the 3D Conversational Companion Space
   */
  async open() {
    if (this.interactionManager?.setInteractionScope) {
      this.interactionManager.setInteractionScope('talk');
    }

    this.clearStage();
    this.setupTextFallback();
    this.buildCompanionEnvironment();
    this.buildCompanionFigure();
    this.buildTranscriptPlaque();
    this.buildControls();

    // If launched with an active photo or family context, build 3D physical prop
    if (this.activeContext) {
      this.displayContextProp(this.activeContext);
    }

    // Initialize opening conversation prompt
    await this.initConversation();
  }

  /**
   * Clears in-world conversation geometry and unregisters targets
   */
  clearStage() {
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    if (this.speechFallbackTimer) {
      clearTimeout(this.speechFallbackTimer);
      this.speechFallbackTimer = null;
    }

    this.talkTargetIds.forEach(id => {
      this.interactionManager?.unregister(id);
    });
    this.talkTargetIds = [];
    this.activeAnimators = [];

    while (this.talkRoot.children.length > 0) {
      const child = this.talkRoot.children[0];
      this.talkRoot.remove(child);
    }
  }

  /**
   * Sets up event listeners for the in-world VR text fallback modal
   */
  setupTextFallback() {
    const dialogEl = document.getElementById('vr-talk-text-dialog');
    const inputEl = document.getElementById('vr-talk-text-input');
    const submitBtn = document.getElementById('vr-talk-text-submit-btn');
    const closeBtn = document.getElementById('vr-talk-text-close-btn');

    if (!dialogEl || !inputEl) return;

    this.boundOnTextSubmit = (e) => {
      e?.preventDefault?.();
      const text = (inputEl.value || '').trim();
      if (!text) return;
      this.closeTextFallback();
      this.handleIncomingSpeech(text);
    };

    this.boundOnTextClose = () => {
      this.closeTextFallback();
    };

    this.boundOnTextKeyDown = (e) => {
      if (e.key === 'Enter') {
        this.boundOnTextSubmit(e);
      } else if (e.key === 'Escape') {
        this.closeTextFallback();
      }
    };

    submitBtn?.addEventListener('click', this.boundOnTextSubmit);
    closeBtn?.addEventListener('click', this.boundOnTextClose);
    inputEl.addEventListener('keydown', this.boundOnTextKeyDown);
  }

  /**
   * Opens the in-world VR text fallback dialog
   */
  openTextFallback() {
    const dialogEl = document.getElementById('vr-talk-text-dialog');
    const inputEl = document.getElementById('vr-talk-text-input');
    if (dialogEl) {
      dialogEl.classList.remove('hidden');
      if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 80);
      }
    }
  }

  /**
   * Closes the in-world VR text fallback dialog
   */
  closeTextFallback() {
    const dialogEl = document.getElementById('vr-talk-text-dialog');
    const inputEl = document.getElementById('vr-talk-text-input');
    if (dialogEl) {
      dialogEl.classList.add('hidden');
      if (inputEl) inputEl.value = '';
    }
  }

  /**
   * Removes event listeners from the text fallback modal
   */
  cleanupTextFallback() {
    this.closeTextFallback();
    const inputEl = document.getElementById('vr-talk-text-input');
    const submitBtn = document.getElementById('vr-talk-text-submit-btn');
    const closeBtn = document.getElementById('vr-talk-text-close-btn');

    if (this.boundOnTextSubmit && submitBtn) {
      submitBtn.removeEventListener('click', this.boundOnTextSubmit);
    }
    if (this.boundOnTextClose && closeBtn) {
      closeBtn.removeEventListener('click', this.boundOnTextClose);
    }
    if (this.boundOnTextKeyDown && inputEl) {
      inputEl.removeEventListener('keydown', this.boundOnTextKeyDown);
    }

    this.boundOnTextSubmit = null;
    this.boundOnTextClose = null;
    this.boundOnTextKeyDown = null;
  }

  /**
   * Builds the surrounding conversational mat and meditation pedestal
   */
  buildCompanionEnvironment() {
    // 1. Stage Base / Soft Velvet Mat
    const matGeo = new THREE.PlaneGeometry(2.5, 1.6);
    const matMat = new THREE.MeshStandardMaterial({
      color: 0x1A121E,
      roughness: 0.85,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(matGeo, matMat);
    const matMesh = new THREE.Mesh(matGeo, matMat);
    matMesh.position.set(0, -0.05, -0.05);
    this.talkRoot.add(matMesh);

    // 2. Carved Mahogany Companion Pedestal
    const pedGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.12, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x381E24,
      roughness: 0.5,
      metalness: 0.1
    });
    this.allocatedAssets.push(pedGeo, pedMat);
    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.position.set(0, -0.08, 0.08);
    this.talkRoot.add(pedMesh);

    // Gold pedestal rim
    const rimGeo = new THREE.TorusGeometry(0.33, 0.015, 16, 32);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, metalness: 0.8, roughness: 0.2 });
    this.allocatedAssets.push(rimGeo, rimMat);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, -0.02, 0.08);
    this.talkRoot.add(rimMesh);
  }

  /**
   * Builds the stylized 3D Companion "Smriti":
   * Luminous teardrop lantern orb, floating halo ring, smiling eyes, and ambient point light
   */
  buildCompanionFigure() {
    this.companionGroup = new THREE.Group();
    this.companionGroup.position.set(0, 0.22, 0.1);

    // 1. Luminous Teardrop Lantern Body
    const bodyGeo = new THREE.SphereGeometry(0.24, 32, 32);
    bodyGeo.scale(1, 1.25, 0.95);
    this.companionMat = new THREE.MeshStandardMaterial({
      color: 0xFB7185,
      emissive: 0xFB7185,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.1
    });
    this.allocatedAssets.push(bodyGeo, this.companionMat);
    this.companionMesh = new THREE.Mesh(bodyGeo, this.companionMat);
    this.companionGroup.add(this.companionMesh);

    // 2. Friendly Smiling Eyes (Canvas decal)
    const faceTex = this.createCanvasTexture(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';

      // Left eye crescent
      ctx.beginPath();
      ctx.arc(75, 75, 26, Math.PI * 1.15, Math.PI * 1.85, false);
      ctx.stroke();

      // Right eye crescent
      ctx.beginPath();
      ctx.arc(181, 75, 26, Math.PI * 1.15, Math.PI * 1.85, false);
      ctx.stroke();

      // Gentle smile
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(128, 70, 22, Math.PI * 0.2, Math.PI * 0.8, false);
      ctx.stroke();
    });
    this.allocatedAssets.push(faceTex);

    const faceGeo = new THREE.PlaneGeometry(0.26, 0.13);
    const faceMat = new THREE.MeshBasicMaterial({
      map: faceTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(faceGeo, faceMat);
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.set(0, 0.02, 0.23);
    this.companionGroup.add(faceMesh);

    // 3. Floating Halo Ring
    const haloGeo = new THREE.TorusGeometry(0.18, 0.016, 16, 32);
    this.haloMat = new THREE.MeshStandardMaterial({
      color: 0xFDE047,
      emissive: 0xFDE047,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    this.allocatedAssets.push(haloGeo, this.haloMat);
    this.haloMesh = new THREE.Mesh(haloGeo, this.haloMat);
    this.haloMesh.rotation.x = Math.PI * 0.42;
    this.haloMesh.position.set(0, 0.36, 0);
    this.companionGroup.add(this.haloMesh);

    // 4. Companion Warm Point Light
    this.companionLight = new THREE.PointLight(0xFB7185, 0.9, 3.2);
    this.companionLight.position.set(0, 0.1, 0.15);
    this.companionGroup.add(this.companionLight);

    this.talkRoot.add(this.companionGroup);

    // 5. Floating Status Pill Plaque above Companion
    this.statusCanvas = document.createElement('canvas');
    this.statusCanvas.width = 1024;
    this.statusCanvas.height = 160;
    this.statusCtx = this.statusCanvas.getContext('2d');
    this.statusTexture = new THREE.CanvasTexture(this.statusCanvas);
    this.allocatedAssets.push(this.statusTexture);

    const statusGeo = new THREE.PlaneGeometry(1.35, 0.22);
    const statusMat = new THREE.MeshBasicMaterial({
      map: this.statusTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(statusGeo, statusMat);
    this.statusPlaqueMesh = new THREE.Mesh(statusGeo, statusMat);
    this.statusPlaqueMesh.position.set(0, 0.72, 0.08);
    this.talkRoot.add(this.statusPlaqueMesh);

    this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK or TYPE to speak.");

    // Ambient floating animator
    this.activeAnimators.push((delta) => {
      this.animTime += delta * 0.0018;
      const hoverY = Math.sin(this.animTime * 2.2) * 0.035;
      this.companionGroup.position.y = 0.22 + hoverY;
      this.haloMesh.rotation.z += 0.008;

      if (this.companionState === 'SPEAKING') {
        const pulse = 0.5 + Math.sin(this.animTime * 8.0) * 0.25;
        this.companionMat.emissiveIntensity = pulse;
        this.companionLight.intensity = 0.9 + pulse * 0.5;
      } else if (this.companionState === 'LISTENING') {
        const pulse = 0.55 + Math.sin(this.animTime * 4.5) * 0.25;
        this.companionMat.emissiveIntensity = pulse;
        this.companionLight.intensity = 0.85 + pulse * 0.35;
      } else if (this.companionState === 'THINKING') {
        const pulse = 0.4 + Math.sin(this.animTime * 3.0) * 0.2;
        this.companionMat.emissiveIntensity = pulse;
        this.companionLight.intensity = 0.7 + pulse * 0.3;
      }
    });
  }

  /**
   * Builds the Live In-World Conversational Transcript Plaque
   * Plaque includes state badge, senior user transcript, and Smriti companion response
   */
  buildTranscriptPlaque() {
    this.transcriptCanvas = document.createElement('canvas');
    this.transcriptCanvas.width = 1024;
    this.transcriptCanvas.height = 420;
    this.transcriptCtx = this.transcriptCanvas.getContext('2d');
    this.transcriptTexture = new THREE.CanvasTexture(this.transcriptCanvas);
    this.allocatedAssets.push(this.transcriptTexture);

    const tGeo = new THREE.PlaneGeometry(1.70, 0.58);
    const tMat = new THREE.MeshBasicMaterial({
      map: this.transcriptTexture,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(tGeo, tMat);
    this.transcriptPlaqueMesh = new THREE.Mesh(tGeo, tMat);
    this.transcriptPlaqueMesh.position.set(0, -0.15, 0.05);
    this.talkRoot.add(this.transcriptPlaqueMesh);

    this.updateTranscriptDisplay();
  }

  /**
   * Updates the in-world transcript plaque with recent dialogue and current state
   */
  updateTranscriptDisplay() {
    if (!this.transcriptCtx) return;
    const ctx = this.transcriptCtx;
    const w = this.transcriptCanvas.width;
    const h = this.transcriptCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background Card
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FB7185';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // 1. Top Header Bar: Title + State Badge
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(6, 6, w - 12, 54);

    ctx.fillStyle = '#F472B6';
    ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌸 SMRITI CONVERSATION', 24, 33);

    // State Pill Badge
    let badgeText = '🟢 READY';
    let badgeBg = 'rgba(16, 185, 129, 0.25)';
    let badgeBorder = '#10B981';
    let badgeTextColor = '#34D399';

    switch (this.companionState) {
      case 'LISTENING':
        badgeText = '🎙️ LISTENING';
        badgeBg = 'rgba(56, 189, 248, 0.25)';
        badgeBorder = '#38BDF8';
        badgeTextColor = '#38BDF8';
        break;
      case 'THINKING':
        badgeText = '💭 THINKING';
        badgeBg = 'rgba(192, 132, 252, 0.25)';
        badgeBorder = '#C084FC';
        badgeTextColor = '#E879F9';
        break;
      case 'SPEAKING':
        badgeText = '🔊 SPEAKING';
        badgeBg = 'rgba(244, 63, 94, 0.25)';
        badgeBorder = '#FB7185';
        badgeTextColor = '#FDA4AF';
        break;
      case 'ERROR':
        badgeText = '⚠️ ERROR';
        badgeBg = 'rgba(239, 68, 68, 0.25)';
        badgeBorder = '#EF4444';
        badgeTextColor = '#FCA5A5';
        break;
      case 'READY':
      default:
        badgeText = '🟢 READY';
        badgeBg = 'rgba(16, 185, 129, 0.25)';
        badgeBorder = '#10B981';
        badgeTextColor = '#34D399';
        break;
    }

    const badgeW = 200;
    const badgeH = 36;
    const badgeX = w - badgeW - 20;
    const badgeY = 15;

    ctx.fillStyle = badgeBg;
    ctx.strokeStyle = badgeBorder;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = badgeTextColor;
    ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);

    let currY = 96;

    // 2. Senior User Line (YOU)
    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('YOU:', 26, currY);

    ctx.fillStyle = this.latestTranscript ? '#E0F2FE' : '#64748B';
    ctx.font = this.latestTranscript ? '600 24px "Plus Jakarta Sans", system-ui, sans-serif' : 'italic 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const userText = this.latestTranscript ? `"${this.latestTranscript}"` : 'Tap TALK or TYPE to share your thoughts...';
    const userLines = this.wrapText(ctx, userText, 100, currY, w - 130, 30);
    currY += Math.max(50, userLines * 30 + 18);

    // Divider
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, currY - 8);
    ctx.lineTo(w - 26, currY - 8);
    ctx.stroke();
    currY += 22;

    // 3. Smriti Companion Line (SMRITI)
    ctx.fillStyle = '#FB7185';
    ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('SMRITI:', 26, currY);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const replyText = this.latestReply || 'Tap TALK below to start speaking with voice, or tap TYPE to write...';
    this.wrapText(ctx, replyText, 130, currY, w - 160, 34);

    this.transcriptTexture.needsUpdate = true;
  }

  /**
   * Builds the Primary In-World Controls:
   * 1. Large Central Button: 🎤 TALK / ⏹ STOP
   * 2. Left Button: ⌨ TYPE
   * 3. Right Button: ↩ BACK
   * 4. Tactile Quick Reply Chips
   */
  buildControls() {
    // 1. Large Physical 3D Microphone / Stop Button: 🎤 TALK / ⏹ STOP
    this.micCanvas = document.createElement('canvas');
    this.micCanvas.width = 512;
    this.micCanvas.height = 140;
    this.micCtx = this.micCanvas.getContext('2d');
    this.micTexture = new THREE.CanvasTexture(this.micCanvas);
    this.allocatedAssets.push(this.micTexture);

    this.drawMicButton();

    const micGeo = new THREE.PlaneGeometry(0.76, 0.18);
    const micMat = new THREE.MeshBasicMaterial({ map: this.micTexture, side: THREE.DoubleSide });
    this.allocatedAssets.push(micGeo, micMat);
    this.micButtonMesh = new THREE.Mesh(micGeo, micMat);
    this.micButtonMesh.position.set(0, -0.48, 0.06);
    this.talkRoot.add(this.micButtonMesh);

    const micTargetId = 'vr_talk_mic_btn';
    this.talkTargetIds.push(micTargetId);

    this.interactionManager.register({
      id: micTargetId,
      category: 'talk',
      rootGroup: this.micButtonMesh,
      pickableMeshes: [this.micButtonMesh],
      focusLabel: 'Talk / Stop',
      focusSublabel: 'Tap to speak with your voice',
      accentHex: '#FB7185',
      accentColorNum: 0xFB7185,
      defaultColorNum: 0xE11D48,
      highlightMesh: this.micButtonMesh,
      badgeOffsetY: 0.20,
      onSelect: () => {
        this.toggleSpeechRecognition();
      }
    });

    // 2. Physical "⌨ TYPE" In-World Button (Opens text fallback modal)
    const typeTex = this.createCanvasTexture(360, 110, (ctx, w, h) => {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⌨ TYPE', w / 2, h / 2);
    });
    this.allocatedAssets.push(typeTex);

    const typeGeo = new THREE.PlaneGeometry(0.44, 0.15);
    const typeMat = new THREE.MeshBasicMaterial({ map: typeTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(typeGeo, typeMat);
    this.typeButtonMesh = new THREE.Mesh(typeGeo, typeMat);
    this.typeButtonMesh.position.set(-0.44, -0.70, 0.05);
    this.talkRoot.add(this.typeButtonMesh);

    const typeTargetId = 'vr_talk_type_btn';
    this.talkTargetIds.push(typeTargetId);

    this.interactionManager.register({
      id: typeTargetId,
      category: 'talk',
      rootGroup: this.typeButtonMesh,
      pickableMeshes: [this.typeButtonMesh],
      focusLabel: 'Type to Smriti',
      focusSublabel: 'Open text keyboard to type',
      accentHex: '#38BDF8',
      accentColorNum: 0x38BDF8,
      defaultColorNum: 0x1E293B,
      highlightMesh: this.typeButtonMesh,
      badgeOffsetY: 0.16,
      onSelect: () => {
        this.openTextFallback();
      }
    });

    // 3. Physical "↩ BACK" Return to Room Button
    const returnTex = this.createCanvasTexture(360, 110, (ctx, w, h) => {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↩ BACK', w / 2, h / 2);
    });
    this.allocatedAssets.push(returnTex);

    const returnGeo = new THREE.PlaneGeometry(0.44, 0.15);
    const returnMat = new THREE.MeshBasicMaterial({ map: returnTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(returnGeo, returnMat);
    this.returnButtonMesh = new THREE.Mesh(returnGeo, returnMat);
    this.returnButtonMesh.position.set(0.44, -0.70, 0.05);
    this.talkRoot.add(this.returnButtonMesh);

    const returnTargetId = 'vr_talk_return_btn';
    this.talkTargetIds.push(returnTargetId);

    this.interactionManager.register({
      id: returnTargetId,
      category: 'talk',
      rootGroup: this.returnButtonMesh,
      pickableMeshes: [this.returnButtonMesh],
      focusLabel: 'Return to Room',
      focusSublabel: 'Leave Conversational Companion',
      accentHex: '#94A3B8',
      accentColorNum: 0x94A3B8,
      defaultColorNum: 0x1E293B,
      highlightMesh: this.returnButtonMesh,
      badgeOffsetY: 0.16,
      onSelect: () => {
        this.close();
      }
    });

    // 4. Render Initial Quick Reply Chips
    this.renderSuggestedReplyChips();
  }

  /**
   * Renders 2–3 tactile quick reply chips on the conversation shelf
   */
  renderSuggestedReplyChips(chips = null) {
    if (this.chipGroup) {
      this.talkRoot.remove(this.chipGroup);
    }

    this.chipGroup = new THREE.Group();
    this.chipGroup.position.set(0, -0.28, 0.05);

    const activeChips = chips || this.suggestedReplies || [
      'I am feeling happy today 🌸',
      'I was remembering my family ❤️',
      'Can you show me my memories? 📸'
    ];

    const chipCount = Math.min(activeChips.length, 3);
    const chipW = 0.58;
    const chipH = 0.12;
    const spacingX = 0.64;
    const startX = -((chipCount - 1) * spacingX) / 2;

    activeChips.slice(0, chipCount).forEach((text, idx) => {
      const posX = startX + idx * spacingX;

      const chipTex = this.createCanvasTexture(480, 100, (ctx, w, h) => {
        ctx.fillStyle = '#2A1828';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#F472B6';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cleanText = text.length > 26 ? text.substring(0, 24) + '...' : text;
        ctx.fillText(`💬 ${cleanText}`, w / 2, h / 2);
      });
      this.allocatedAssets.push(chipTex);

      const chipGeo = new THREE.PlaneGeometry(chipW, chipH);
      const chipMat = new THREE.MeshBasicMaterial({ map: chipTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(chipGeo, chipMat);
      const chipMesh = new THREE.Mesh(chipGeo, chipMat);
      chipMesh.position.set(posX, 0, 0.01);
      this.chipGroup.add(chipMesh);

      const chipTargetId = `vr_talk_chip_${idx}`;
      this.talkTargetIds.push(chipTargetId);

      this.interactionManager.register({
        id: chipTargetId,
        category: 'talk',
        rootGroup: chipMesh,
        pickableMeshes: [chipMesh],
        focusLabel: 'Say this',
        focusSublabel: text,
        accentHex: '#F472B6',
        accentColorNum: 0xF472B6,
        defaultColorNum: 0x2A1828,
        highlightMesh: chipMesh,
        badgeOffsetY: 0.15,
        onSelect: () => {
          this.handleIncomingSpeech(text);
        }
      });
    });

    this.talkRoot.add(this.chipGroup);
  }

  /**
   * Displays an interactive 3D physical photo frame or family portrait beside the companion
   */
  displayContextProp(context) {
    if (!context || !context.data) return;

    if (this.contextPropGroup) {
      this.talkRoot.remove(this.contextPropGroup);
    }

    this.contextPropGroup = new THREE.Group();
    // Position floating gracefully to the left of the companion
    this.contextPropGroup.position.set(-0.84, 0.22, 0.08);

    const isFamily = context.type === 'family';
    const item = context.data;

    // Outer Wooden Frame
    const frameGeo = new THREE.BoxGeometry(0.56, 0.62, 0.04);
    const frameMat = new THREE.MeshStandardMaterial({
      color: isFamily ? 0x1E3A8A : 0xD97706,
      roughness: 0.4
    });
    this.allocatedAssets.push(frameGeo, frameMat);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    this.contextPropGroup.add(frameMesh);

    // Inner Image / Avatar Plane
    const imgGeo = new THREE.PlaneGeometry(0.48, 0.44);
    let imgTex = null;

    const imgUrl = item.runtimeUrl || item.avatarUrl || item.photoURL || null;
    if (imgUrl) {
      imgTex = new THREE.TextureLoader().load(imgUrl);
    } else {
      imgTex = this.createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = isFamily ? '#EFF6FF' : '#FEF3C7';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '140px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.avatar || (isFamily ? '🧑‍💼' : '📸'), w / 2, h / 2);
      });
    }
    this.allocatedAssets.push(imgTex);

    const imgMat = new THREE.MeshBasicMaterial({ map: imgTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(imgGeo, imgMat);
    const imgMesh = new THREE.Mesh(imgGeo, imgMat);
    imgMesh.position.set(0, 0.05, 0.025);
    this.contextPropGroup.add(imgMesh);

    // Bottom Caption Plaque
    const capTex = this.createCanvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = isFamily ? '#38BDF8' : '#F59E0B';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const title = isFamily ? formatFamilyDisplayName(item) : (item.title || 'Memory Photo');
      ctx.fillText(title, w / 2, 45);

      ctx.fillStyle = isFamily ? '#38BDF8' : '#F59E0B';
      ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
      const sub = isFamily ? (item.relationship || 'Family') : (item.caption || item.date || 'Cherished Photograph');
      ctx.fillText(sub, w / 2, 90);
    });
    this.allocatedAssets.push(capTex);

    const capGeo = new THREE.PlaneGeometry(0.5, 0.12);
    const capMat = new THREE.MeshBasicMaterial({ map: capTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(capGeo, capMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(0, -0.22, 0.025);
    this.contextPropGroup.add(capMesh);

    this.talkRoot.add(this.contextPropGroup);

    // Register 3D Context Prop as interactive
    const propTargetId = 'vr_talk_context_prop';
    this.talkTargetIds.push(propTargetId);

    const labelText = isFamily ? `Family: ${formatFamilyDisplayName(item)}` : `Photo: ${item.title || 'Memory'}`;
    this.interactionManager.register({
      id: propTargetId,
      category: 'talk',
      rootGroup: this.contextPropGroup,
      pickableMeshes: [frameMesh, imgMesh, capMesh],
      focusLabel: 'Cherished Context',
      focusSublabel: labelText,
      accentHex: isFamily ? '#38BDF8' : '#F59E0B',
      accentColorNum: isFamily ? 0x38BDF8 : 0xF59E0B,
      defaultColorNum: isFamily ? 0x1E3A8A : 0xD97706,
      highlightMesh: frameMesh,
      badgeOffsetY: 0.38,
      onSelect: () => {
        const spoken = isFamily
          ? `${formatFamilyDisplayName(item)}, your beloved ${item.relationship || 'family member'}.`
          : `${item.title || 'Family Memory'}. ${item.caption || ''}`;
        this.speakWithCompanion(spoken);
      }
    });
  }

  /**
   * Initializes opening conversation prompt using CognitiveClient or local expData
   */
  async initConversation() {
    this.updateStatusVisuals('THINKING', '💭 Preparing personalized memory prompt...');
    this.conversationHistory = [];

    try {
      let promptData = null;
      if (this.cognitiveClient?.fetchConversationPrompt) {
        promptData = await Promise.race([
          this.cognitiveClient.fetchConversationPrompt(this.elderlyUserId, this.currentLanguage),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Prompt fetch timeout')), 6000))
        ]);
      }

      if (promptData?.promptText) {
        this.latestReply = promptData.promptText;
        this.conversationHistory.push({ role: 'assistant', content: promptData.promptText });
        this.updateTranscriptDisplay();

        if (promptData.suggestedReplies) {
          this.suggestedReplies = promptData.suggestedReplies;
          this.renderSuggestedReplyChips(promptData.suggestedReplies);
        }

        this.speakWithCompanion(promptData.promptText);
        return;
      }
    } catch (err) {
      console.warn('[VRTalkCompanion] Live prompt fetch failed, using honest memory reflection:', err);
    }

    // Honest local memory reflection fallback grounded strictly in loaded expData
    const seniorName = this.expData?.displayName || 'Elderly Friend';
    const fam = this.expData?.family || [];

    let openingText = '';
    let chips = [];

    if (this.activeContext?.type === 'family') {
      const mem = this.activeContext.data;
      const memName = formatFamilyDisplayName(mem);
      openingText = `Hello ${seniorName}! We are looking at your beloved ${memName} (${mem.relationship || 'Family'}). What cherished memory with them would you like to share?`;
      chips = [`Tell me about ${mem.name}`, 'I was remembering my family', 'I am feeling happy today'];
    } else if (this.activeContext?.type === 'photo') {
      const p = this.activeContext.data;
      openingText = `Hello ${seniorName}! This is your cherished photo "${p.title || 'Family Moment'}". Take your time to look at it. Tell me what is on your heart today.`;
      chips = [`I remember this day fondly`, 'Tell me about this picture', 'Can you show me my memories?'];
    } else if (fam.length > 0) {
      const firstFam = fam[0];
      const famName = formatFamilyDisplayName(firstFam);
      openingText = `Hello ${seniorName}! It is so peaceful here in your memory room. Are you thinking about ${famName} (${firstFam.relationship || 'Family'}), or perhaps your morning tea?`;
      chips = ['I am feeling happy today', `Thinking of ${firstFam.name}`, 'Can you show me my memories?'];
    } else {
      openingText = `Hello ${seniorName}! I am here with you in your memory room. Speak naturally aloud, or tap a topic below to chat.`;
      chips = ['I am feeling happy today', 'I was remembering my family', 'Can you show me my memories?'];
    }

    this.latestReply = openingText;
    this.conversationHistory.push({ role: 'assistant', content: openingText });
    this.suggestedReplies = chips;
    this.updateTranscriptDisplay();
    this.renderSuggestedReplyChips(chips);
    this.speakWithCompanion(openingText);
  }

  /**
   * Toggles Speech Recognition via VoiceService or stops active speaking
   */
  toggleSpeechRecognition() {
    // If Smriti is currently speaking: Stop speaking immediately and return to READY
    if (this.companionState === 'SPEAKING') {
      if (this.speechFallbackTimer) {
        clearTimeout(this.speechFallbackTimer);
        this.speechFallbackTimer = null;
      }
      if (this.voiceService?.stop) {
        this.voiceService.stop();
      }
      this.updateStatusVisuals('READY', "🌸 Speech stopped. Tap TALK to speak.");
      return;
    }

    // If currently listening: Stop listening and return to READY
    if (this.companionState === 'LISTENING') {
      this.voiceService?.stopListening();
      this.updateStatusVisuals('READY', "🌸 Tap 'TALK' when you are ready.");
      return;
    }

    // Check capability
    const isSupported = Boolean(this.voiceService?.isRecognitionSupported ?? this.voiceService?.isSpeechRecognitionSupported);
    if (!isSupported) {
      this.updateStatusVisuals('ERROR', '⚠️ Microphone speech recognition unavailable. Tap TYPE instead.');
      this.latestReply = 'Microphone speech recognition is not supported in this browser. Please tap TYPE or any topic chip to converse.';
      this.updateTranscriptDisplay();
      this.errorTimer = setTimeout(() => {
        this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TYPE to write.");
      }, 3000);
      return;
    }

    // Mutual exclusion: stop any active audio before starting microphone capture
    if (this.voiceService?.stop) {
      this.voiceService.stop();
    }

    this.updateStatusVisuals('LISTENING', "🎙️ I'm listening to your voice... Speak naturally.");

    this.voiceService.startListening({
      langCode: this.currentLanguage,
      onStart: () => {
        this.updateStatusVisuals('LISTENING', "🎙️ Listening... Speak naturally.");
      },
      onInterim: (text) => {
        this.latestTranscript = `${text}...`;
        this.updateTranscriptDisplay();
      },
      onTranscript: (finalText) => {
        if (finalText && finalText.trim()) {
          this.handleIncomingSpeech(finalText.trim());
        } else {
          this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK to speak.");
        }
      },
      onError: (err) => {
        const errCode = err?.error || err?.message || String(err);
        console.warn('[VRTalkCompanion] Speech recognition error:', errCode, err);

        let userMsg = '⚠️ Speech error. Tap TALK to try again or TYPE.';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          userMsg = '⚠️ Mic permission denied. Tap TYPE to type instead.';
        } else if (errCode === 'no-speech') {
          userMsg = '⚠️ No speech detected. Tap TALK to try again.';
        } else if (errCode === 'audio-capture') {
          userMsg = '⚠️ Microphone not found. Tap TYPE instead.';
        }

        this.updateStatusVisuals('ERROR', userMsg);
        this.errorTimer = setTimeout(() => {
          if (this.companionState === 'ERROR') {
            this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK or TYPE.");
          }
        }, 2600);
      },
      onEnd: () => {
        if (this.companionState === 'LISTENING') {
          this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK or TYPE.");
        }
      }
    });
  }

  /**
   * Processes speech transcript or typed message:
   * Reuses the exact same CognitiveClient.sendConversationMessage() pipeline.
   * Maintains multi-turn conversationHistory across turns.
   */
  async handleIncomingSpeech(userText) {
    if (!userText || !userText.trim()) return;

    this.latestTranscript = userText.trim();
    this.conversationHistory.push({ role: 'user', content: this.latestTranscript });
    this.updateStatusVisuals('THINKING', '💭 Let me remember...');
    this.updateTranscriptDisplay();

    // Contextual VR Actions check:
    // 1. "show my memories" / "photos"
    const textLower = this.latestTranscript.toLowerCase();
    const isMemoryRequest = /show (me )?(my )?memories|see (my )?photos|view (my )?memories|memory wall|স্মৃতি দেখাও|यादें दिखाओ/i.test(textLower);
    if (isMemoryRequest) {
      const photos = this.expData?.memories?.photos || [];
      if (photos.length > 0) {
        this.displayContextProp({ type: 'photo', data: photos[0] });
      }
      if (typeof this.onNavigateToMemoryWall === 'function') {
        this.onNavigateToMemoryWall();
      }
    }

    // 2. Mention of real family member or photo memory
    this.checkForMentionedContext(this.latestTranscript);

    try {
      if (this.cognitiveClient?.sendConversationMessage) {
        const res = await Promise.race([
          this.cognitiveClient.sendConversationMessage({
            elderlyUserId: this.elderlyUserId,
            userMessage: this.latestTranscript,
            conversationHistory: this.conversationHistory,
            language: this.currentLanguage
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Backend message timeout')), 25000))
        ]);

        if (res?.replyText) {
          this.latestReply = res.replyText;
          this.conversationHistory.push({ role: 'assistant', content: res.replyText });
          this.updateTranscriptDisplay();

          if (res.suggestedReplies) {
            this.suggestedReplies = res.suggestedReplies;
            this.renderSuggestedReplyChips(res.suggestedReplies);
          }

          this.speakWithCompanion(res.replyText);
          return;
        }
      }
    } catch (err) {
      console.warn('[VRTalkCompanion] Live conversation message failed:', err);
    }

    // Controlled error response when Gemini is unreachable - no fake fallback replies
    const errorReply = 'Smriti is having trouble connecting right now. Please try again.';
    this.latestReply = errorReply;
    this.updateTranscriptDisplay();
    this.speakWithCompanion(errorReply);
  }

  /**
   * Inspects speech transcript for mentions of real family members or memories,
   * bringing their 3D physical props into the conversational area
   */
  checkForMentionedContext(text) {
    const textLower = text.toLowerCase();

    // Check family: match full name, first name, or relationship
    const fam = this.expData?.family || [];
    const matchedFam = fam.find(f => {
      const fullName = (f.name || '').toLowerCase();
      const firstName = fullName.split(' ')[0];
      const rel = (f.relationship || '').toLowerCase();
      return textLower.includes(fullName) ||
             (firstName.length > 2 && textLower.includes(firstName)) ||
             (rel.length > 2 && textLower.includes(rel));
    });
    if (matchedFam) {
      this.displayContextProp({ type: 'family', data: matchedFam });
      return;
    }

    // Check photos: match full title or distinctive keywords (>3 chars)
    const photos = this.expData?.memories?.photos || [];
    const matchedPhoto = photos.find(p => {
      if (!p.title) return false;
      const titleLower = p.title.toLowerCase();
      const titleWords = titleLower.split(' ').filter(w => w.length > 3);
      return textLower.includes(titleLower) || titleWords.some(w => textLower.includes(w));
    });
    if (matchedPhoto) {
      this.displayContextProp({ type: 'photo', data: matchedPhoto });
    }
  }

  /**
   * Speaks text using VoiceService with Companion speaking state feedback
   * Guarantees return to READY state when finished or on error.
   */
  speakWithCompanion(text) {
    if (!text) {
      this.updateStatusVisuals('READY', "🌸 I'm here with you.");
      return;
    }

    // Prevent simultaneous microphone capture while speaking
    if (this.voiceService?.stopListening) {
      this.voiceService.stopListening();
    }

    this.updateStatusVisuals('SPEAKING', '🔊 Smriti is speaking...');

    if (this.speechFallbackTimer) {
      clearTimeout(this.speechFallbackTimer);
      this.speechFallbackTimer = null;
    }

    // Fallback timer ensures UI returns to READY even if browser speech fails
    const estimatedDurationMs = Math.min(8000, Math.max(2200, text.length * 75));
    this.speechFallbackTimer = setTimeout(() => {
      if (this.companionState === 'SPEAKING') {
        this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK to speak.");
      }
    }, estimatedDurationMs + 1000);

    if (this.voiceService?.speak) {
      try {
        this.voiceService.speak(text, this.currentLanguage, {
          rate: 0.85,
          pitch: 1.0,
          onStart: () => {
            this.updateStatusVisuals('SPEAKING', '🔊 Smriti is speaking...');
          },
          onEnd: () => {
            if (this.speechFallbackTimer) {
              clearTimeout(this.speechFallbackTimer);
              this.speechFallbackTimer = null;
            }
            this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK to speak.");
          },
          onError: (e) => {
            console.warn('[VRTalkCompanion] Speech synthesis error:', e);
            if (this.speechFallbackTimer) {
              clearTimeout(this.speechFallbackTimer);
              this.speechFallbackTimer = null;
            }
            this.updateStatusVisuals('READY', "🌸 I'm here with you. Tap TALK to speak.");
          }
        });
      } catch (err) {
        console.warn('[VRTalkCompanion] Speech call threw:', err);
      }
    }
  }

  /**
   * Draws the physical 3D microphone / stop button texture
   */
  drawMicButton() {
    if (!this.micCtx) return;
    const ctx = this.micCtx;
    const w = this.micCanvas.width;
    const h = this.micCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const isListening = this.companionState === 'LISTENING';
    const isSpeaking = this.companionState === 'SPEAKING';

    if (isSpeaking) {
      ctx.fillStyle = '#DC2626'; // Crimson red for stop speaking
    } else if (isListening) {
      ctx.fillStyle = '#0284C7'; // Blue for stop listening
    } else {
      ctx.fillStyle = '#E11D48'; // Rose for Talk
    }

    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isSpeaking) {
      ctx.fillText('⏹ STOP', w / 2, h / 2);
    } else if (isListening) {
      ctx.fillText('⏹ STOP', w / 2, h / 2);
    } else {
      ctx.fillText('🎤 TALK', w / 2, h / 2);
    }

    this.micTexture.needsUpdate = true;
  }

  /**
   * Updates companion state, colors, status pill plaque, and controls
   */
  updateStatusVisuals(state, statusMessage) {
    this.companionState = state;
    this.drawMicButton();
    this.updateTranscriptDisplay();

    let hexColor = 0xFB7185;
    let cssColor = '#FB7185';

    switch (state) {
      case 'LISTENING':
        hexColor = 0x38BDF8;
        cssColor = '#38BDF8';
        break;
      case 'THINKING':
        hexColor = 0xC084FC;
        cssColor = '#C084FC';
        break;
      case 'SPEAKING':
        hexColor = 0x10B981;
        cssColor = '#10B981';
        break;
      case 'ERROR':
        hexColor = 0xEF4444;
        cssColor = '#EF4444';
        break;
      case 'READY':
      default:
        hexColor = 0xFB7185;
        cssColor = '#FB7185';
        break;
    }

    if (this.companionMat) {
      this.companionMat.color.setHex(hexColor);
      this.companionMat.emissive.setHex(hexColor);
    }
    if (this.companionLight) {
      this.companionLight.color.setHex(hexColor);
    }

    // Redraw Status Pill Canvas above companion
    if (this.statusCtx) {
      const ctx = this.statusCtx;
      const w = this.statusCanvas.width;
      const h = this.statusCanvas.height;

      ctx.clearRect(0, 0, w, h);

      // Pill Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(8, 8, w - 16, h - 16, 28);
      } else {
        ctx.fillRect(8, 8, w - 16, h - 16);
        ctx.strokeRect(8, 8, w - 16, h - 16);
      }
      ctx.fill();
      ctx.stroke();

      // Status text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusMessage, w / 2, h / 2);

      this.statusTexture.needsUpdate = true;
    }
  }

  /**
   * Helper to create 2D canvas textures
   */
  createCanvasTexture(width, height, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  /**
   * Helper to wrap text cleanly on canvas and return line count
   */
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || '').split(' ');
    let line = '';
    let currY = y;
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, currY);
        line = words[n] + ' ';
        currY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currY);
    lineCount++;
    return lineCount;
  }

  /**
   * Per-frame animation tick
   */
  update(delta) {
    for (let i = 0; i < this.activeAnimators.length; i++) {
      this.activeAnimators[i](delta);
    }
  }

  /**
   * Closes the companion session, stops speech/STT, and returns to normal room view
   */
  close() {
    if (this.speechFallbackTimer) {
      clearTimeout(this.speechFallbackTimer);
      this.speechFallbackTimer = null;
    }
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }

    if (this.voiceService) {
      if (typeof this.voiceService.stopListening === 'function') {
        this.voiceService.stopListening();
      }
      if (typeof this.voiceService.stop === 'function') {
        this.voiceService.stop();
      }
    }

    this.cleanupTextFallback();
    this.clearStage();
    this.companionState = 'READY';

    if (this.interactionManager?.setInteractionScope) {
      this.interactionManager.setInteractionScope('all');
    }
    this.scene.remove(this.talkRoot);

    if (typeof this.onReturnToRoom === 'function') {
      this.onReturnToRoom();
    }
  }

  /**
   * Complete GPU asset disposal
   */
  dispose() {
    this.close();
    this.allocatedAssets.forEach(a => {
      if (a && typeof a.dispose === 'function') a.dispose();
    });
    this.allocatedAssets = [];
  }
}
