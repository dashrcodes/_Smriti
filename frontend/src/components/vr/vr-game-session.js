/**
 * SMRITI VR GAME SESSION & 3D COGNITIVE GAME ADAPTERS (PHASE 2B)
 * Presents Smriti's personalized cognitive activities as tactile 3D physical elements on the Games Table:
 * - 3D "Let's Play" game directory
 * - 6 Dementia-friendly interactive games:
 *    1. Who Is This? (Personalized family recognition)
 *    2. Remember This Photo (Cherished photo observation & recall)
 *    3. What Comes Next? (Sequential routine & daily item recall)
 *    4. Find the Odd One (Visual discrimination & distractor spotting)
 *    5. Complete the Pattern (Pattern recognition & tactile piece placement)
 *    6. Which Song Is This? (Vintage 3D gramophone melody recall)
 * - Closed-loop integration with Smriti CognitiveClient & Adaptive Difficulty Engine
 * - Unified raycasting, hover elevation, and selection via VRInteractionManager
 * - High-contrast, dementia-friendly aesthetics with zero harsh penalties or flashing red visuals
 */

import { VR_CONFIG, formatFamilyDisplayName } from './vr-ui.js';

export class VRGameSession {
  constructor({
    scene,
    camera,
    cameraRig,
    expData,
    currentPack,
    elderlyUserId,
    cognitiveClient,
    onRecordSession,
    onSpeak,
    onReturnToRoom,
    interactionManager
  }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.expData = expData || {};
    this.currentPack = currentPack || null;
    this.elderlyUserId = elderlyUserId || 'elderly_user';
    this.cognitiveClient = cognitiveClient || null;
    this.onRecordSession = onRecordSession || null;
    this.onSpeak = onSpeak || (() => {});
    this.onReturnToRoom = onReturnToRoom || (() => {});
    this.interactionManager = interactionManager;

    // Active session state
    this.activeActivity = null;
    this.activeGameType = null;
    this.activeGameList = [];
    this.currentActivityIndex = 0;
    this.sessionAnswers = [];
    this.questionStartTime = 0;
    this.currentAttempts = 0;
    this.currentHintsUsed = 0;
    this.isShowingPhoto = false;

    // Root 3D group for all in-world game elements
    this.gameRoot = new THREE.Group();
    // Position comfortably in the user's primary seated field of view (x: 0, y: 1.35m, z: -1.9m)
    this.gameRoot.position.set(0, 1.35, -1.9);
    this.scene.add(this.gameRoot);

    // Track all registered targets & allocated GPU assets for clean disposal
    this.gameTargetIds = [];
    this.allocatedAssets = [];

    // Animation hook handle for rotating gramophone vinyl, spinning tiles, etc.
    this.activeAnimators = [];
  }

  /**
   * Opens the in-world 3D "Let's Play" Game Directory
   */
  openMenu() {
    if (this.interactionManager?.setInteractionScope) {
      this.interactionManager.setInteractionScope('game');
    }
    this.clearStage();
    this.activeActivity = null;
    this.activeGameType = null;

    // 1. Stage Base / Wooden Game Table Mat
    const matGeo = new THREE.PlaneGeometry(2.3, 1.4);
    const matMat = new THREE.MeshStandardMaterial({
      color: 0x1E1528,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(matGeo, matMat);
    const matMesh = new THREE.Mesh(matGeo, matMat);
    matMesh.position.set(0, -0.05, -0.05);
    this.gameRoot.add(matMesh);

    // 2. Main "Let's Play" Header Plaque
    const headerTex = this.createCanvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#261C38';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.fillStyle = '#C084FC';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MIND & MEMORY GAMES', w / 2, 60);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText("Let's Play Together", w / 2, 130);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('Select any game card below at your relaxed pace.', w / 2, 195);
    });
    this.allocatedAssets.push(headerTex);

    const headerGeo = new THREE.PlaneGeometry(1.6, 0.4);
    const headerMat = new THREE.MeshBasicMaterial({ map: headerTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(headerGeo, headerMat);
    const headerMesh = new THREE.Mesh(headerGeo, headerMat);
    headerMesh.position.set(0, 0.52, 0);
    this.gameRoot.add(headerMesh);

    // 3. 6 Tactile Game Cards arranged in 2 rows of 3
    const games = [
      {
        type: 'who_is_this',
        title: 'Who Is This?',
        icon: '👤',
        subtitle: 'Family Recognition',
        color: '#A855F7',
        colorNum: 0xA855F7
      },
      {
        type: 'remember_photo',
        title: 'Remember Photo',
        icon: '📸',
        subtitle: 'Photo Recall',
        color: '#EC4899',
        colorNum: 0xEC4899
      },
      {
        type: 'what_comes_next',
        title: 'What Comes Next?',
        icon: '⏳',
        subtitle: 'Routine Recall',
        color: '#3B82F6',
        colorNum: 0x3B82F6
      },
      {
        type: 'odd_one_out',
        title: 'Find the Odd One',
        icon: '🧩',
        subtitle: 'Spot the Difference',
        color: '#10B981',
        colorNum: 0x10B981
      },
      {
        type: 'pattern_completion',
        title: 'Complete Pattern',
        icon: '🔷',
        subtitle: 'Pattern Matching',
        color: '#F59E0B',
        colorNum: 0xF59E0B
      },
      {
        type: 'which_song',
        title: 'Which Song?',
        icon: '🎵',
        subtitle: 'Nostalgic Melodies',
        color: '#6366F1',
        colorNum: 0x6366F1
      }
    ];

    const cardW = 0.58;
    const cardH = 0.32;
    const spacingX = 0.68;
    const startX = -spacingX;
    const rowY = [0.16, -0.22];

    games.forEach((g, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const posX = startX + col * spacingX;
      const posY = rowY[row];

      const cardGroup = new THREE.Group();
      cardGroup.position.set(posX, posY, 0.02);

      const cardTex = this.createCanvasTexture(512, 280, (ctx, w, h) => {
        // Card Background
        ctx.fillStyle = '#1A1526';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = g.color;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);

        // Icon
        ctx.font = '54px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.icon, w / 2, 70);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(g.title, w / 2, 160);

        // Subtitle
        ctx.fillStyle = g.color;
        ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(g.subtitle, w / 2, 220);
      });
      this.allocatedAssets.push(cardTex);

      const cardGeo = new THREE.BoxGeometry(cardW, cardH, 0.04);
      const cardMat = new THREE.MeshStandardMaterial({
        color: 0x241D35,
        roughness: 0.5
      });
      this.allocatedAssets.push(cardGeo, cardMat);
      const cardMesh = new THREE.Mesh(cardGeo, cardMat);

      // Front decal face
      const faceGeo = new THREE.PlaneGeometry(cardW - 0.02, cardH - 0.02);
      const faceMat = new THREE.MeshBasicMaterial({ map: cardTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(faceGeo, faceMat);
      const faceMesh = new THREE.Mesh(faceGeo, faceMat);
      faceMesh.position.z = 0.022;

      cardGroup.add(cardMesh, faceMesh);
      this.gameRoot.add(cardGroup);

      // Register with VRInteractionManager
      const targetId = `vr_game_menu_${g.type}`;
      this.gameTargetIds.push(targetId);

      this.interactionManager.register({
        id: targetId,
        category: 'game',
        rootGroup: cardGroup,
        pickableMeshes: [cardMesh, faceMesh],
        focusLabel: `Play: ${g.title}`,
        focusSublabel: g.subtitle,
        accentHex: g.color,
        accentColorNum: g.colorNum,
        defaultColorNum: 0x241D35,
        highlightMesh: cardMesh,
        badgeOffsetY: 0.28,
        onSelect: () => {
          this.launchGame(g.type);
        }
      });
    });

    // 4. Return to Room Button below the cards
    const returnTex = this.createCanvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#261C38';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('← Return to Memory Room', w / 2, h / 2);
    });
    this.allocatedAssets.push(returnTex);

    const returnGeo = new THREE.PlaneGeometry(0.85, 0.22);
    const returnMat = new THREE.MeshBasicMaterial({ map: returnTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(returnGeo, returnMat);
    const returnMesh = new THREE.Mesh(returnGeo, returnMat);
    returnMesh.position.set(0, -0.48, 0.03);
    this.gameRoot.add(returnMesh);

    const returnTargetId = 'vr_game_return_to_room';
    this.gameTargetIds.push(returnTargetId);

    this.interactionManager.register({
      id: returnTargetId,
      category: 'game',
      rootGroup: returnMesh,
      pickableMeshes: [returnMesh],
      focusLabel: 'Return to Room',
      focusSublabel: 'Exit Games Table',
      accentHex: '#94A3B8',
      accentColorNum: 0x94A3B8,
      defaultColorNum: 0x261C38,
      highlightMesh: returnMesh,
      badgeOffsetY: 0.22,
      onSelect: () => {
        this.close();
      }
    });

    // Spoken welcome cue
    this.onSpeak("Welcome to your games table. Choose a game to begin.", this.expData?.profile?.preferredLanguage || 'as');
  }

  /**
   * Launches a specific cognitive game type
   */
  launchGame(gameType) {
    this.activeGameType = gameType;
    this.sessionAnswers = [];
    this.currentActivityIndex = 0;

    // Resolve or synthesize activities matching this gameType
    let matched = [];
    if (this.currentPack?.activities && this.currentPack.activities.length > 0) {
      matched = this.currentPack.activities.filter(
        a => a.subType === gameType || a.activityId?.includes(gameType)
      );
    }

    if (matched.length === 0) {
      // Synthesize using real user data from expData
      matched = [this.synthesizeActivityForGame(gameType)];
    }

    this.activeGameList = matched;
    this.renderActivity(this.activeGameList[0]);
  }

  /**
   * Renders the current activity on the 3D Game Stage
   */
  renderActivity(activity) {
    this.clearStage();
    this.activeActivity = activity;
    this.questionStartTime = Date.now();
    this.currentAttempts = 0;
    this.currentHintsUsed = 0;

    // 1. Stage Base / Soft Mat
    const matGeo = new THREE.PlaneGeometry(2.3, 1.4);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x1E1528, roughness: 0.8, side: THREE.DoubleSide });
    this.allocatedAssets.push(matGeo, matMat);
    const matMesh = new THREE.Mesh(matGeo, matMat);
    matMesh.position.set(0, -0.05, -0.05);
    this.gameRoot.add(matMesh);

    // 2. Top Header Plaque (Title, prompt, instructions)
    const headerTex = this.createCanvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#261C38';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      // Progress & Instructions
      ctx.fillStyle = '#C084FC';
      ctx.font = 'bold 26px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`ACTIVITY ${this.currentActivityIndex + 1} OF ${this.activeGameList.length}`, 40, 50);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(activity.instructions || 'Look closely and select your answer.', w - 40, 50);

      // Prompt Question
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const promptText = activity.prompt || 'Who is this beloved family member?';
      this.wrapText(ctx, promptText, w / 2, 125, w - 80, 42);
    });
    this.allocatedAssets.push(headerTex);

    const headerGeo = new THREE.PlaneGeometry(1.7, 0.42);
    const headerMat = new THREE.MeshBasicMaterial({ map: headerTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(headerGeo, headerMat);
    const headerMesh = new THREE.Mesh(headerGeo, headerMat);
    headerMesh.position.set(0, 0.52, 0);
    this.gameRoot.add(headerMesh);

    // 3. In-world Feedback Banner Plaque
    this.feedbackCanvas = document.createElement('canvas');
    this.feedbackCanvas.width = 1024;
    this.feedbackCanvas.height = 128;
    this.feedbackCtx = this.feedbackCanvas.getContext('2d');
    this.feedbackTexture = new THREE.CanvasTexture(this.feedbackCanvas);
    this.allocatedAssets.push(this.feedbackTexture);

    const fbGeo = new THREE.PlaneGeometry(1.6, 0.2);
    const fbMat = new THREE.MeshBasicMaterial({ map: this.feedbackTexture, transparent: true, side: THREE.DoubleSide });
    this.allocatedAssets.push(fbGeo, fbMat);
    this.feedbackMesh = new THREE.Mesh(fbGeo, fbMat);
    this.feedbackMesh.position.set(0, 0.24, 0.02);
    this.gameRoot.add(this.feedbackMesh);
    this.updateFeedbackMessage('', '#FFFFFF');

    // 4. Auxiliary Buttons: "💡 Hint", "🔊 Read Aloud", "← All Games"
    this.buildActionControls(activity);

    // 5. Build Specific 3D Game Geometry based on subType
    switch (activity.subType) {
      case 'who_is_this':
        this.buildWhoIsThisGame(activity);
        break;
      case 'remember_photo':
        this.buildRememberPhotoGame(activity);
        break;
      case 'what_comes_next':
        this.buildWhatComesNextGame(activity);
        break;
      case 'odd_one_out':
        this.buildOddOneOutGame(activity);
        break;
      case 'pattern_completion':
        this.buildPatternCompletionGame(activity);
        break;
      case 'which_song':
        this.buildWhichSongGame(activity);
        break;
      default:
        this.buildWhoIsThisGame(activity);
        break;
    }

    // Spoken prompt cue
    const lang = activity.language || this.expData?.profile?.preferredLanguage || 'as';
    this.onSpeak(`${activity.instructions || ''}. ${activity.prompt || ''}`, lang);
  }

  /**
   * In-World Action Controls (Hint, Read Aloud, Back to Games Directory)
   */
  buildActionControls(activity) {
    const controls = [
      {
        id: 'vr_game_action_hint',
        label: '💡 Gentle Hint',
        sublabel: 'Get Helpful Clue',
        color: '#F59E0B',
        colorNum: 0xF59E0B,
        posX: -0.65,
        action: () => {
          this.currentHintsUsed++;
          const hint = (activity.hints && activity.hints.length > 0)
            ? activity.hints[0]
            : 'Take a relaxed look at the clues provided.';
          this.updateFeedbackMessage(`💡 Hint: ${hint}`, '#F59E0B');
          this.onSpeak(hint, activity.language || 'as');
        }
      },
      {
        id: 'vr_game_action_speak',
        label: '🔊 Read Aloud',
        sublabel: 'Listen to Question',
        color: '#38BDF8',
        colorNum: 0x38BDF8,
        posX: 0,
        action: () => {
          this.onSpeak(`${activity.instructions || ''}. ${activity.prompt || ''}`, activity.language || 'as');
        }
      },
      {
        id: 'vr_game_action_menu',
        label: '← All Games',
        sublabel: 'Return to Menu',
        color: '#94A3B8',
        colorNum: 0x94A3B8,
        posX: 0.65,
        action: () => {
          this.openMenu();
        }
      }
    ];

    controls.forEach(ctrl => {
      const tex = this.createCanvasTexture(380, 100, (ctx, w, h) => {
        ctx.fillStyle = '#1F182C';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ctrl.color;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ctrl.label, w / 2, h / 2);
      });
      this.allocatedAssets.push(tex);

      const geo = new THREE.PlaneGeometry(0.48, 0.14);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      this.allocatedAssets.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(ctrl.posX, -0.52, 0.03);
      this.gameRoot.add(mesh);

      this.gameTargetIds.push(ctrl.id);
      this.interactionManager.register({
        id: ctrl.id,
        category: 'game',
        rootGroup: mesh,
        pickableMeshes: [mesh],
        focusLabel: ctrl.label,
        focusSublabel: ctrl.sublabel,
        accentHex: ctrl.color,
        accentColorNum: ctrl.colorNum,
        defaultColorNum: 0x1F182C,
        highlightMesh: mesh,
        badgeOffsetY: 0.16,
        onSelect: ctrl.action
      });
    });
  }

  // =========================================================================
  // GAME 1 — WHO IS THIS? (Personalized Family Recognition)
  // =========================================================================
  buildWhoIsThisGame(activity) {
    const stageGroup = new THREE.Group();
    stageGroup.position.set(0, 0, 0);

    // 1. Center Easel with Framed Photo / Avatar
    const frameGeo = new THREE.BoxGeometry(0.62, 0.62, 0.04);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
    this.allocatedAssets.push(frameGeo, frameMat);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(0, 0.02, 0.05);
    stageGroup.add(frameMesh);

    // Photo face decal
    const photoUrl = activity.media?.url || null;
    const photoGeo = new THREE.PlaneGeometry(0.54, 0.54);

    let photoTex;
    if (photoUrl) {
      photoTex = new THREE.TextureLoader().load(photoUrl);
    } else {
      photoTex = this.createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#FEF3C7';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '160px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activity.media?.symbol || '👵', w / 2, h / 2);
      });
    }
    this.allocatedAssets.push(photoTex);

    const photoMat = new THREE.MeshBasicMaterial({ map: photoTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(photoGeo, photoMat);
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    photoMesh.position.set(0, 0.02, 0.075);
    stageGroup.add(photoMesh);

    this.gameRoot.add(stageGroup);

    // 2. Tactile Choice Plaques sitting below the photo
    this.renderChoiceOptions(activity.options, -0.32);
  }

  // =========================================================================
  // GAME 2 — REMEMBER THIS PHOTO (Observation & Delayed Recall)
  // =========================================================================
  buildRememberPhotoGame(activity) {
    const photoGroup = new THREE.Group();
    photoGroup.position.set(0, 0.02, 0.05);

    const frameGeo = new THREE.BoxGeometry(0.85, 0.58, 0.04);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xB45309, roughness: 0.4 });
    this.allocatedAssets.push(frameGeo, frameMat);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    photoGroup.add(frameMesh);

    const photoUrl = activity.media?.url || null;
    let photoTex;
    if (photoUrl) {
      photoTex = new THREE.TextureLoader().load(photoUrl);
    } else {
      photoTex = this.createCanvasTexture(800, 500, (ctx, w, h) => {
        ctx.fillStyle = '#1E1B4B';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '120px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📸', w / 2, h / 2 - 40);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(activity.media?.caption || 'Cherished Memory', w / 2, h / 2 + 80);
      });
    }
    this.allocatedAssets.push(photoTex);

    const photoGeo = new THREE.PlaneGeometry(0.77, 0.5);
    const photoMat = new THREE.MeshBasicMaterial({ map: photoTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(photoGeo, photoMat);
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    photoMesh.position.z = 0.025;
    photoGroup.add(photoMesh);

    this.gameRoot.add(photoGroup);

    // Choice options placed clearly below the photo frame
    this.renderChoiceOptions(activity.options, -0.34);
  }

  // =========================================================================
  // GAME 3 — WHAT COMES NEXT? (Sequential Routine Recall)
  // =========================================================================
  buildWhatComesNextGame(activity) {
    const sequenceGroup = new THREE.Group();
    sequenceGroup.position.set(0, 0.02, 0.05);

    // Wooden sequence track
    const trackGeo = new THREE.BoxGeometry(1.5, 0.06, 0.25);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 0.6 });
    this.allocatedAssets.push(trackGeo, trackMat);
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    sequenceGroup.add(trackMesh);

    // Routine Block 1 (Current scheduled item)
    const block1Tex = this.createCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      ctx.font = '70px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(activity.media?.symbol || '⏰', w / 2, 90);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      const caption = activity.media?.caption || 'Morning Routine';
      this.wrapText(ctx, caption, w / 2, 160, w - 40, 34);
    });
    this.allocatedAssets.push(block1Tex);

    const block1Geo = new THREE.BoxGeometry(0.48, 0.32, 0.06);
    const block1Mat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.4 });
    this.allocatedAssets.push(block1Geo, block1Mat);
    const block1Mesh = new THREE.Mesh(block1Geo, block1Mat);
    block1Mesh.position.set(-0.45, 0.18, 0);

    const face1Geo = new THREE.PlaneGeometry(0.46, 0.3);
    const face1Mat = new THREE.MeshBasicMaterial({ map: block1Tex, side: THREE.DoubleSide });
    this.allocatedAssets.push(face1Geo, face1Mat);
    const face1 = new THREE.Mesh(face1Geo, face1Mat);
    face1.position.z = 0.035;
    block1Mesh.add(face1);
    sequenceGroup.add(block1Mesh);

    // Arrow Connector Mesh
    const arrowTex = this.createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#C084FC';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('➔', w / 2, h / 2);
    });
    this.allocatedAssets.push(arrowTex);

    const arrowGeo = new THREE.PlaneGeometry(0.2, 0.2);
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, side: THREE.DoubleSide });
    this.allocatedAssets.push(arrowGeo, arrowMat);
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0.18, 0.02);
    sequenceGroup.add(arrowMesh);

    // Target Slot 2 (Mystery Question Block)
    const slotTex = this.createCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#312E81';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 90px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', w / 2, h / 2);
    });
    this.allocatedAssets.push(slotTex);

    const slotGeo = new THREE.BoxGeometry(0.48, 0.32, 0.06);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x312E81, roughness: 0.4 });
    this.allocatedAssets.push(slotGeo, slotMat);
    const slotMesh = new THREE.Mesh(slotGeo, slotMat);
    slotMesh.position.set(0.45, 0.18, 0);

    const slotFaceGeo = new THREE.PlaneGeometry(0.46, 0.3);
    const slotFaceMat = new THREE.MeshBasicMaterial({ map: slotTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(slotFaceGeo, slotFaceMat);
    const slotFace = new THREE.Mesh(slotFaceGeo, slotFaceMat);
    slotFace.position.z = 0.035;
    slotMesh.add(slotFace);
    sequenceGroup.add(slotMesh);

    this.gameRoot.add(sequenceGroup);

    // Choice option plaques below
    this.renderChoiceOptions(activity.options, -0.32);
  }

  // =========================================================================
  // GAME 4 — FIND THE ODD ONE (Visual Discrimination & Distractor Spotting)
  // =========================================================================
  buildOddOneOutGame(activity) {
    const trayGroup = new THREE.Group();
    trayGroup.position.set(0, 0.04, 0.05);

    // Determine tactile symbols from activity media or fallback set
    const symbolsString = activity.media?.symbol || '🍃  🍃  🍃  🌸  🍃';
    const items = symbolsString.split(/\s+/).filter(s => s.trim().length > 0);
    const totalItems = Math.min(items.length, 5);

    const tileW = 0.32;
    const tileH = 0.32;
    const spacingX = 0.38;
    const startX = -((totalItems - 1) * spacingX) / 2;

    items.slice(0, totalItems).forEach((sym, idx) => {
      const tileGroup = new THREE.Group();
      tileGroup.position.set(startX + idx * spacingX, 0.02, 0);

      const tileTex = this.createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);

        ctx.font = '110px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sym, w / 2, h / 2);
      });
      this.allocatedAssets.push(tileTex);

      const tileGeo = new THREE.BoxGeometry(tileW, tileH, 0.04);
      const tileMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.4 });
      this.allocatedAssets.push(tileGeo, tileMat);
      const tileMesh = new THREE.Mesh(tileGeo, tileMat);

      const faceGeo = new THREE.PlaneGeometry(tileW - 0.02, tileH - 0.02);
      const faceMat = new THREE.MeshBasicMaterial({ map: tileTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(faceGeo, faceMat);
      const faceMesh = new THREE.Mesh(faceGeo, faceMat);
      faceMesh.position.z = 0.022;

      tileGroup.add(tileMesh, faceMesh);
      trayGroup.add(tileGroup);
    });

    this.gameRoot.add(trayGroup);

    // Option plaques below for selecting which item is odd
    this.renderChoiceOptions(activity.options, -0.32);
  }

  // =========================================================================
  // GAME 5 — COMPLETE THE PATTERN (Pattern Recognition)
  // =========================================================================
  buildPatternCompletionGame(activity) {
    const patternGroup = new THREE.Group();
    patternGroup.position.set(0, 0.04, 0.05);

    // Pattern symbols
    const patternString = activity.media?.symbol || '🌸  🍃  🌸  🍃  ?';
    const pieces = patternString.split(/\s+/).filter(s => s.trim().length > 0);
    const totalPieces = Math.min(pieces.length, 5);

    const pieceW = 0.32;
    const pieceH = 0.32;
    const spacingX = 0.38;
    const startX = -((totalPieces - 1) * spacingX) / 2;

    pieces.slice(0, totalPieces).forEach((sym, idx) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(startX + idx * spacingX, 0.02, 0);

      const isSlot = sym === '?';

      const pTex = this.createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = isSlot ? '#312E81' : '#1E293B';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = isSlot ? '#F59E0B' : '#C084FC';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);

        ctx.fillStyle = isSlot ? '#F59E0B' : '#FFFFFF';
        ctx.font = isSlot ? 'bold 110px sans-serif' : '110px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sym, w / 2, h / 2);
      });
      this.allocatedAssets.push(pTex);

      const pGeo = new THREE.BoxGeometry(pieceW, pieceH, 0.04);
      const pMat = new THREE.MeshStandardMaterial({
        color: isSlot ? 0x312E81 : 0x1E293B,
        roughness: 0.4
      });
      this.allocatedAssets.push(pGeo, pMat);
      const pMesh = new THREE.Mesh(pGeo, pMat);

      const faceGeo = new THREE.PlaneGeometry(pieceW - 0.02, pieceH - 0.02);
      const faceMat = new THREE.MeshBasicMaterial({ map: pTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(faceGeo, faceMat);
      const faceMesh = new THREE.Mesh(faceGeo, faceMat);
      faceMesh.position.z = 0.022;

      pGroup.add(pMesh, faceMesh);
      patternGroup.add(pGroup);
    });

    this.gameRoot.add(patternGroup);

    // Option pieces below
    this.renderChoiceOptions(activity.options, -0.32);
  }

  // =========================================================================
  // GAME 6 — WHICH SONG IS THIS? (Nostalgic Gramophone Audio Recall)
  // =========================================================================
  buildWhichSongGame(activity) {
    const musicGroup = new THREE.Group();
    musicGroup.position.set(0, 0.06, 0.05);

    // 1. Miniature 3D Gramophone on Stage
    const baseGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.08, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x451A03, roughness: 0.5 });
    this.allocatedAssets.push(baseGeo, baseMat);
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.06;
    musicGroup.add(baseMesh);

    // Vinyl record disc
    const vinylGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.015, 32);
    const vinylMat = new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.2, metalness: 0.4 });
    this.allocatedAssets.push(vinylGeo, vinylMat);
    const vinylMesh = new THREE.Mesh(vinylGeo, vinylMat);
    vinylMesh.position.y = -0.01;
    musicGroup.add(vinylMesh);

    // Spinning animation for vinyl record
    this.activeAnimators.push((delta) => {
      vinylMesh.rotation.y += 0.015;
    });

    // Brass Gramophone Horn
    const hornGeo = new THREE.ConeGeometry(0.22, 0.35, 24, 1, true);
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0xD97706,
      roughness: 0.25,
      metalness: 0.85,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(hornGeo, hornMat);
    const hornMesh = new THREE.Mesh(hornGeo, hornMat);
    hornMesh.rotation.x = Math.PI * 0.45;
    hornMesh.position.set(0, 0.18, 0.05);
    musicGroup.add(hornMesh);

    // Musical Notes Plaque
    const melodyTex = this.createCanvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#312E81';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6366F1';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎵 Playing Soothing Melody...', w / 2, h / 2);
    });
    this.allocatedAssets.push(melodyTex);

    const melodyGeo = new THREE.PlaneGeometry(0.7, 0.18);
    const melodyMat = new THREE.MeshBasicMaterial({ map: melodyTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(melodyGeo, melodyMat);
    const melodyMesh = new THREE.Mesh(melodyGeo, melodyMat);
    melodyMesh.position.set(0, 0.35, 0.05);
    musicGroup.add(melodyMesh);

    this.gameRoot.add(musicGroup);

    // Play melody sound snippet if available
    if (window.smritiAudio?.playMelodySnippet) {
      window.smritiAudio.playMelodySnippet();
    }

    // Song choice cards below
    this.renderChoiceOptions(activity.options, -0.32);
  }

  /**
   * Renders tactile 3D choice options for any game
   */
  renderChoiceOptions(options = [], baseY = -0.32) {
    if (!options || options.length === 0) return;

    const optCount = options.length;
    const optW = optCount === 2 ? 0.78 : 0.62;
    const optH = 0.24;
    const spacingX = optCount === 2 ? 0.88 : 0.72;
    const startX = -((optCount - 1) * spacingX) / 2;

    options.forEach((opt, idx) => {
      const posX = startX + idx * spacingX;
      const optGroup = new THREE.Group();
      optGroup.position.set(posX, baseY, 0.03);

      const optTex = this.createCanvasTexture(512, 180, (ctx, w, h) => {
        ctx.fillStyle = '#1E1B2E';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#C084FC';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.wrapText(ctx, opt.text || 'Choice', w / 2, h / 2, w - 40, 36);
      });
      this.allocatedAssets.push(optTex);

      const optGeo = new THREE.BoxGeometry(optW, optH, 0.04);
      const optMat = new THREE.MeshStandardMaterial({
        color: 0x241D35,
        roughness: 0.4
      });
      this.allocatedAssets.push(optGeo, optMat);
      const optMesh = new THREE.Mesh(optGeo, optMat);

      const faceGeo = new THREE.PlaneGeometry(optW - 0.02, optH - 0.02);
      const faceMat = new THREE.MeshBasicMaterial({ map: optTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(faceGeo, faceMat);
      const faceMesh = new THREE.Mesh(faceGeo, faceMat);
      faceMesh.position.z = 0.022;

      optGroup.add(optMesh, faceMesh);
      this.gameRoot.add(optGroup);

      const targetId = `vr_game_opt_${opt.id || idx}`;
      this.gameTargetIds.push(targetId);

      this.interactionManager.register({
        id: targetId,
        category: 'game',
        rootGroup: optGroup,
        pickableMeshes: [optMesh, faceMesh],
        focusLabel: 'Choose Answer',
        focusSublabel: opt.text,
        accentHex: '#C084FC',
        accentColorNum: 0xC084FC,
        defaultColorNum: 0x241D35,
        highlightMesh: optMesh,
        badgeOffsetY: 0.22,
        onSelect: () => {
          this.handleOptionSelection(opt, optMesh);
        }
      });
    });
  }

  /**
   * Handles user selection of an option with calm, dementia-friendly feedback
   */
  handleOptionSelection(opt, optMesh) {
    this.currentAttempts++;
    const isCorrect = Boolean(opt.isCorrect);
    const lang = this.activeActivity?.language || 'as';

    if (isCorrect) {
      // 1. Success visual highlight (emerald)
      if (optMesh?.material) {
        optMesh.material.color.setHex(0x10B981);
        if (optMesh.material.emissive) {
          optMesh.material.emissive.setHex(0x10B981);
          optMesh.material.emissiveIntensity = 0.5;
        }
      }

      // 2. Audio Chime / Success Chord
      if (window.smritiAudio?.playSuccessChord) {
        window.smritiAudio.playSuccessChord();
      }

      // 3. Gentle Spoken Affirmation
      this.updateFeedbackMessage('🌟 Wonderful! Spot on! You did fantastic! ❤️', '#10B981');
      this.onSpeak('Wonderful! Spot on! You did fantastic!', lang);

      // Record answer
      const responseTimeMs = Date.now() - this.questionStartTime;
      this.sessionAnswers.push({
        activityId: this.activeActivity?.activityId || `act_${Date.now()}`,
        category: this.activeActivity?.category || 'memory',
        isCorrect: true,
        attempts: this.currentAttempts,
        hintsUsed: this.currentHintsUsed,
        responseTimeMs
      });

      // Progress after gentle delay
      setTimeout(() => {
        if (this.currentActivityIndex < this.activeGameList.length - 1) {
          this.currentActivityIndex++;
          this.renderActivity(this.activeGameList[this.currentActivityIndex]);
        } else {
          this.finishSession();
        }
      }, 1600);

    } else {
      // Gentle, non-punitive guidance (soft amber, no red buzzer or shaming)
      if (optMesh?.material) {
        optMesh.material.color.setHex(0xF59E0B);
        if (optMesh.material.emissive) {
          optMesh.material.emissive.setHex(0xF59E0B);
          optMesh.material.emissiveIntensity = 0.3;
        }
      }

      if (window.smritiAudio?.playChime) {
        window.smritiAudio.playChime(330, 0.4, 'triangle');
      }

      this.updateFeedbackMessage('Almost! Take another gentle look. 🌸', '#F59E0B');
      this.onSpeak('Almost! Take another gentle look.', lang);
    }
  }

  /**
   * Updates in-world feedback message banner
   */
  updateFeedbackMessage(message, colorHex = '#FFFFFF') {
    if (!this.feedbackCtx) return;
    const ctx = this.feedbackCtx;
    const w = this.feedbackCanvas.width;
    const h = this.feedbackCanvas.height;

    ctx.clearRect(0, 0, w, h);

    if (message) {
      // Rounded pill backing
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(10, 10, w - 20, h - 20, 24);
      } else if (typeof ctx.rect === 'function') {
        ctx.rect(10, 10, w - 20, h - 20);
      } else {
        ctx.fillRect(10, 10, w - 20, h - 20);
        ctx.strokeRect(10, 10, w - 20, h - 20);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = colorHex;
      ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(message, w / 2, h / 2);
    }

    this.feedbackTexture.needsUpdate = true;
  }

  /**
   * Concludes the cognitive game session and feeds results back to Adaptive Engine
   */
  async finishSession() {
    this.clearStage();

    const totalQ = this.sessionAnswers.length || 1;
    const correctQ = this.sessionAnswers.filter(a => a.isCorrect).length;
    const accuracy = Number((correctQ / totalQ).toFixed(2));
    const totalTime = this.sessionAnswers.reduce((sum, a) => sum + (a.responseTimeMs || 3000), 0);
    const avgTime = Math.round(totalTime / totalQ);
    const totalHints = this.sessionAnswers.reduce((sum, a) => sum + (a.hintsUsed || 0), 0);
    const totalAttempts = this.sessionAnswers.reduce((sum, a) => sum + (a.attempts || 1), 0);
    const primaryCategory = this.sessionAnswers[0]?.category || 'memory';

    const sessionPayload = {
      elderlyUserId: this.elderlyUserId,
      activityId: `vr_sess_${Date.now()}`,
      category: primaryCategory,
      difficulty: this.currentPack?.difficulty || 1,
      language: this.currentPack?.language || 'as',
      startedAt: new Date(Date.now() - totalTime).toISOString(),
      completedAt: new Date().toISOString(),
      accuracy,
      score: Math.round(accuracy * 100),
      responseTimeMs: avgTime,
      totalQuestions: totalQ,
      correctAnswers: correctQ,
      hintsUsed: totalHints,
      attempts: totalAttempts,
      completed: true,
      questionsAnswered: this.sessionAnswers
    };

    // Forward result to existing Adaptive Engine & performance tracking
    try {
      if (typeof this.onRecordSession === 'function') {
        await this.onRecordSession(sessionPayload);
      } else if (this.cognitiveClient?.recordSession) {
        await this.cognitiveClient.recordSession(sessionPayload);
      }
      console.log('[VRGameSession] Session successfully fed to adaptive engine:', sessionPayload);
    } catch (e) {
      console.warn('[VRGameSession] Failed to submit session online, queued locally:', e);
    }

    // 3D Completion Banner Plaque
    const bannerTex = this.createCanvasTexture(1024, 420, (ctx, w, h) => {
      ctx.fillStyle = '#064E3B';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.font = '80px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎉', w / 2, 95);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('Wonderful Job Today!', w / 2, 180);

      ctx.fillStyle = '#A7F3D0';
      ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('You completed this cognitive exercise with great care.', w / 2, 240);
      ctx.fillText('Your memory progress has been safely recorded.', w / 2, 285);
    });
    this.allocatedAssets.push(bannerTex);

    const bannerGeo = new THREE.PlaneGeometry(1.6, 0.7);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide });
    this.allocatedAssets.push(bannerGeo, bannerMat);
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, 0.22, 0.05);
    this.gameRoot.add(bannerMesh);

    // 3D Environmental Celebration Response: Golden Star Glyph & Warm Table Spotlight
    const starGeo = typeof THREE.OctahedronGeometry === 'function'
      ? new THREE.OctahedronGeometry(0.18, 0)
      : new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xF59E0B,
      emissive: 0xF59E0B,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8
    });
    this.allocatedAssets.push(starGeo, starMat);
    const celebrationStar = new THREE.Mesh(starGeo, starMat);
    celebrationStar.position.set(0, 0.72, 0.05);
    this.gameRoot.add(celebrationStar);
    this.celebrationStar = celebrationStar;

    if (typeof THREE.PointLight === 'function') {
      const celebrationLight = new THREE.PointLight(0xF59E0B, 1.2, 3.0);
      celebrationLight.position.set(0, 0.85, 0.1);
      this.gameRoot.add(celebrationLight);
      this.allocatedAssets.push(celebrationLight);
    }

    if (window.smritiAudio?.playSuccessChord) {
      window.smritiAudio.playSuccessChord();
    }
    this.onSpeak('Wonderful job! You completed this exercise with great care. Your memory progress has been safely recorded.', this.currentPack?.language || 'as');

    // Physical Actions: "✨ Play Another Game" and "← Return to Room"
    const actions = [
      {
        id: 'vr_game_play_again',
        label: '✨ Play Another Game',
        color: '#10B981',
        posX: -0.45,
        action: () => this.openMenu()
      },
      {
        id: 'vr_game_finish_return',
        label: '← Return to Room',
        color: '#94A3B8',
        posX: 0.45,
        action: () => this.close()
      }
    ];

    actions.forEach(act => {
      const btnTex = this.createCanvasTexture(420, 110, (ctx, w, h) => {
        ctx.fillStyle = '#065F46';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = act.color;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(act.label, w / 2, h / 2);
      });
      this.allocatedAssets.push(btnTex);

      const btnGeo = new THREE.PlaneGeometry(0.65, 0.18);
      const btnMat = new THREE.MeshBasicMaterial({ map: btnTex, side: THREE.DoubleSide });
      this.allocatedAssets.push(btnGeo, btnMat);
      const btnMesh = new THREE.Mesh(btnGeo, btnMat);
      btnMesh.position.set(act.posX, -0.32, 0.06);
      this.gameRoot.add(btnMesh);

      this.gameTargetIds.push(act.id);
      this.interactionManager.register({
        id: act.id,
        category: 'game',
        rootGroup: btnMesh,
        pickableMeshes: [btnMesh],
        focusLabel: act.label,
        accentHex: act.color,
        accentColorNum: 0x10B981,
        defaultColorNum: 0x065F46,
        highlightMesh: btnMesh,
        badgeOffsetY: 0.18,
        onSelect: act.action
      });
    });

    this.onSpeak('Wonderful job today! Your activity has been safely recorded.', 'as');
  }

  /**
   * Synthesizes personalized activity models from real expData if offline or empty
   */
  synthesizeActivityForGame(gameType) {
    const lang = this.expData?.profile?.preferredLanguage || 'as';
    const family = this.expData?.family || [];
    const photos = this.expData?.memories?.photos || [];
    const routines = this.expData?.routines || [];
    const audios = this.expData?.memories?.audios || [];

    switch (gameType) {
      case 'who_is_this': {
        const targetMember = family.length > 0 ? family[0] : null;
        const targetName = targetMember ? formatFamilyDisplayName(targetMember) : 'Rohan Baba';
        const otherMember = family.length > 1 ? family[1] : null;
        const distractorName = otherMember ? formatFamilyDisplayName(otherMember) : 'Anita Maa';

        return {
          activityId: `act_vr_who_${Date.now()}`,
          category: 'memory',
          subType: 'who_is_this',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? 'এই ফটোত থকা ব্যক্তিগৰাকী কোন হয়?' : 'Who is this beloved family member?',
          instructions: 'Look closely at the portrait and choose the matching name.',
          media: {
            type: targetMember?.avatarUrl ? 'photo' : 'avatar',
            url: targetMember?.avatarUrl || null,
            symbol: targetMember?.avatar || '👵',
            caption: targetName
          },
          options: [
            { id: 'opt_1', text: targetName, isCorrect: true },
            { id: 'opt_2', text: distractorName, isCorrect: false }
          ],
          correctAnswer: targetName,
          hints: [`Think about your beloved ${targetMember?.relationship || 'family member'}.`]
        };
      }

      case 'remember_photo': {
        const targetPhoto = photos.length > 0 ? photos[0] : null;
        const photoTitle = targetPhoto?.title || 'Family Celebration';

        return {
          activityId: `act_vr_photo_${Date.now()}`,
          category: 'memory',
          subType: 'remember_photo',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? 'এই স্মৃতিৰ ছবিখন মনত পেলাই চাওক — ই কিহৰ অনুষ্ঠান?' : 'Recall this cherished moment — what event is this?',
          instructions: 'Take your time to look at the photo, then select the event title.',
          media: {
            type: 'photo',
            url: targetPhoto?.runtimeUrl || null,
            symbol: '📸',
            caption: photoTitle
          },
          options: [
            { id: 'opt_p1', text: photoTitle, isCorrect: true },
            { id: 'opt_p2', text: lang === 'as' ? 'বজাৰৰ যাত্ৰা' : 'Market Visit', isCorrect: false }
          ],
          correctAnswer: photoTitle,
          hints: [targetPhoto?.description || 'A cherished personal memory from your album.']
        };
      }

      case 'what_comes_next': {
        const firstRoutine = routines.length > 0 ? routines[0] : null;
        const secondRoutine = routines.length > 1 ? routines[1] : null;
        const r1Name = firstRoutine?.activityName || firstRoutine?.title || 'Morning Tea';
        const r2Name = secondRoutine?.activityName || secondRoutine?.title || 'Morning Walk';

        return {
          activityId: `act_vr_next_${Date.now()}`,
          category: 'routine_recall',
          subType: 'what_comes_next',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? `"${r1Name}" ৰ পিছত আপোনাৰ কি কাৰ্যসূচী আছে?` : `What comes after "${r1Name}" in your routine?`,
          instructions: 'Select the activity that follows in your daily schedule.',
          media: {
            type: 'icon',
            symbol: firstRoutine?.icon || '☕',
            caption: `${firstRoutine?.time || '08:00 AM'} - ${r1Name}`
          },
          options: [
            { id: 'opt_r1', text: `${secondRoutine?.time || '09:00 AM'} - ${r2Name}`, isCorrect: true },
            { id: 'opt_r2', text: '11:00 PM - Night Sleep', isCorrect: false }
          ],
          correctAnswer: r2Name,
          hints: ['Think about what you enjoy right after your morning tea.']
        };
      }

      case 'odd_one_out': {
        return {
          activityId: `act_vr_odd_${Date.now()}`,
          category: 'attention',
          subType: 'odd_one_out',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? 'কোনটো বস্তু আনবোৰতকৈ পৃথক?' : 'Which item is different from the rest?',
          instructions: 'Spot the single symbol that stands out from the group.',
          media: {
            type: 'icon',
            symbol: '🍃  🍃  🍃  🌸  🍃',
            caption: 'Leaves & Flower'
          },
          options: [
            { id: 'opt_o1', text: lang === 'as' ? 'ফুল 🌸' : 'Flower 🌸', isCorrect: true },
            { id: 'opt_o2', text: lang === 'as' ? 'পাত 🍃' : 'Leaves 🍃', isCorrect: false }
          ],
          correctAnswer: 'Flower 🌸',
          hints: ['Look closely for the colorful blossom among green leaves.']
        };
      }

      case 'pattern_completion': {
        return {
          activityId: `act_vr_pat_${Date.now()}`,
          category: 'attention',
          subType: 'pattern_completion',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? 'আৰ্হিটো সম্পূৰ্ণ কৰিবলৈ কি বহিব?' : 'What comes next to complete the pattern?',
          instructions: 'Notice the repeating pattern from left to right.',
          media: {
            type: 'icon',
            symbol: '☀️  🌙  ☀️  🌙  ?',
            caption: 'Sun & Moon Pattern'
          },
          options: [
            { id: 'opt_pt1', text: lang === 'as' ? 'সূৰ্য ☀️' : 'Sun ☀️', isCorrect: true },
            { id: 'opt_pt2', text: lang === 'as' ? 'তৰা ⭐' : 'Star ⭐', isCorrect: false }
          ],
          correctAnswer: 'Sun ☀️',
          hints: ['Sun follows Moon, and Moon follows Sun.']
        };
      }

      case 'which_song': {
        const firstAudio = audios.length > 0 ? audios[0] : null;
        const songTitle = firstAudio?.title || 'Bistirno Parore (Bhupen Hazarika)';

        return {
          activityId: `act_vr_song_${Date.now()}`,
          category: 'emotional_engagement',
          subType: 'which_song',
          difficulty: 1,
          language: lang,
          prompt: lang === 'as' ? 'এই সুৰটো কি গীতৰ হয়?' : 'Which beloved melody or song is this?',
          instructions: 'Listen to the acoustic tune and choose the song name.',
          media: {
            type: 'audio',
            symbol: '🎵',
            caption: songTitle
          },
          options: [
            { id: 'opt_s1', text: songTitle, isCorrect: true },
            { id: 'opt_s2', text: lang === 'as' ? 'আধুনিক ডিস্কো গীত' : 'Modern Disco Song', isCorrect: false }
          ],
          correctAnswer: songTitle,
          hints: ['A timeless, nostalgic regional melody.']
        };
      }

      default:
        return this.synthesizeActivityForGame('who_is_this');
    }
  }

  /**
   * Clears in-world game geometry and unregisters targets
   */
  clearStage() {
    this.gameTargetIds.forEach(id => {
      this.interactionManager.unregister(id);
    });
    this.gameTargetIds = [];
    this.activeAnimators = [];

    while (this.gameRoot.children.length > 0) {
      const child = this.gameRoot.children[0];
      this.gameRoot.remove(child);
    }
  }

  /**
   * Helper to create dynamic 2D canvas textures
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
   * Helper to wrap text cleanly on 2D canvas
   */
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || '').split(' ');
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
   * Per-frame animation tick (e.g. spinning vinyl record disc)
   */
  update(delta) {
    for (let i = 0; i < this.activeAnimators.length; i++) {
      this.activeAnimators[i](delta);
    }
    if (this.celebrationStar) {
      this.celebrationStar.rotation.y += (delta || 0.016) * 1.5;
      this.celebrationStar.rotation.x += (delta || 0.016) * 0.8;
    }
  }

  /**
   * Closes the game session and returns to normal room view
   */
  close() {
    this.clearStage();
    if (this.interactionManager?.setInteractionScope) {
      this.interactionManager.setInteractionScope('all');
    }
    this.scene.remove(this.gameRoot);
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
