/**
 * SMRITI VR MEMORY ROOM & INTERACTIVE STATIONS
 * Phase 2A: Interactive 3D World Foundation
 * Transforms the 3D Sanctuary into a living, physical memory room:
 * - Architectural Room Enclosure: Warm teak parquet, wainscoting paneling, warm lighting
 * - Zone 1: Front Curved Memory Wall (6–8 real photos as physical framed interactive paintings)
 * - Zone 2: Left Wing Family Corner (real family members on physical pedestals with respectful titles)
 * - Zone 3: Front-Right Games Table (crafted table with interactive 3D cognitive puzzle tiles)
 * - Zone 4: Right Wing Music Corner (vintage 3D gramophone with brass horn and nostalgic tracks)
 * - Zone 5: Cozy Hearth Talk & Recall (companion table, warm amber lantern, and reminiscence prompt)
 * - Unified integration with VRInteractionManager for hover badges, dwell selection, and inspection
 */

import {
  VR_CONFIG,
  formatFamilyDisplayName,
  createTextPlaqueTexture,
  createAvatarFallbackTexture,
  createStationPlaqueTexture
} from './vr-ui.js';
import { VRGameSession } from './vr-game-session.js';
import { VRTalkCompanion } from './vr-talk-companion.js';

export class SmritiVRMemoryWall {
  constructor({
    scene,
    camera,
    cameraRig,
    expData,
    sessionToken,
    interactionManager,
    onSpeak,
    voiceService,
    currentPack,
    elderlyUserId,
    cognitiveClient,
    onRecordSession,
    onStateChange
  }) {
    this.scene = scene;
    this.camera = camera || null;
    this.cameraRig = cameraRig || null;
    this.expData = expData || {};
    this.sessionToken = sessionToken || '';
    this.interactionManager = interactionManager || null;
    this.onSpeak = onSpeak || (() => {});
    this.voiceService = voiceService || (typeof window !== 'undefined' ? window.VoiceService : null);
    this.currentPack = currentPack || null;
    this.elderlyUserId = elderlyUserId || 'elderly_user';
    this.cognitiveClient = cognitiveClient || null;
    this.onRecordSession = onRecordSession || null;
    this.onStateChange = onStateChange || null;

    this.memoryCards = [];
    this.familyPedestals = [];
    this.gameBlocks = [];
    this.vinylDisc = null;

    this.gameSession = null;
    this.talkCompanion = null;
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.interactiveMeshes = [];
    this.textureLoader = new THREE.TextureLoader();

    // Cache allocated textures & meshes for clean teardown
    this.allocatedTextures = [];
    this.allocatedMaterials = [];
    this.allocatedGeometries = [];

    this.buildSanctuary();
  }

  buildSanctuary() {
    this.buildRoomArchitecture();
    this.buildWelcomePlaque();
    this.buildMemoryWall();
    this.buildFamilyCorner();
    this.buildGamesTable();
    this.buildMusicCorner();
    this.buildTalkAndRecallStation();
  }

  /**
   * 1. Architectural Room Enclosure (Walls, Floor, Wainscoting, Lighting)
   */
  buildRoomArchitecture() {
    // 1a. Warm Teakwood Parquet Floor (radius 6.0m)
    const floorGeo = new THREE.CircleGeometry(6.0, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x221B14,
      roughness: 0.75,
      metalness: 0.1
    });
    this.allocatedGeometries.push(floorGeo);
    this.allocatedMaterials.push(floorMat);

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    this.rootGroup.add(floorMesh);

    // 1b. Cozy Center Woven Carpet (radius 2.5m)
    const rugGeo = new THREE.CircleGeometry(2.5, 48);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x3D281D,
      roughness: 0.95
    });
    this.allocatedGeometries.push(rugGeo);
    this.allocatedMaterials.push(rugMat);

    const rugMesh = new THREE.Mesh(rugGeo, rugMat);
    rugMesh.rotation.x = -Math.PI / 2;
    rugMesh.position.y = 0.005;
    this.rootGroup.add(rugMesh);

    // Rug golden border rim
    const rugRimGeo = new THREE.RingGeometry(2.45, 2.55, 48);
    const rugRimMat = new THREE.MeshBasicMaterial({
      color: 0xD97706,
      side: THREE.DoubleSide
    });
    this.allocatedGeometries.push(rugRimGeo, rugRimMat);
    this.allocatedMaterials.push(rugRimMat);

    const rugRimMesh = new THREE.Mesh(rugRimGeo, rugRimMat);
    rugRimMesh.rotation.x = -Math.PI / 2;
    rugRimMesh.position.y = 0.008;
    this.rootGroup.add(rugRimMesh);

    // 1c. Curved Room Wall Enclosure (Cylinder with radius 5.8m, height 4.2m)
    const wallGeo = new THREE.CylinderGeometry(5.8, 5.8, 4.2, 48, 1, true);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x28231D, // Warm muted taupe/cream wall
      roughness: 0.85,
      side: THREE.BackSide
    });
    this.allocatedGeometries.push(wallGeo);
    this.allocatedMaterials.push(wallMat);

    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.y = 2.1;
    this.rootGroup.add(wallMesh);

    // Lower Wainscoting Wood Paneling (height 1.2m)
    const wainscotGeo = new THREE.CylinderGeometry(5.78, 5.78, 1.2, 48, 1, true);
    const wainscotMat = new THREE.MeshStandardMaterial({
      color: 0x1A1410, // Dark cedar wainscoting
      roughness: 0.6,
      side: THREE.BackSide
    });
    this.allocatedGeometries.push(wainscotGeo);
    this.allocatedMaterials.push(wainscotMat);

    const wainscotMesh = new THREE.Mesh(wainscotGeo, wainscotMat);
    wainscotMesh.position.y = 0.6;
    this.rootGroup.add(wainscotMesh);

    // 1d. Wainscoting Chair Rail Molding
    const railGeo = new THREE.RingGeometry(5.74, 5.78, 48);
    const railMat = new THREE.MeshBasicMaterial({ color: 0xF59E0B, side: THREE.DoubleSide });
    this.allocatedGeometries.push(railGeo, railMat);
    this.allocatedMaterials.push(railMat);

    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.rotation.x = -Math.PI / 2;
    railMesh.position.y = 1.2;
    this.rootGroup.add(railMesh);
  }

  /**
   * 2. Personalized Reassuring 3D Welcome Plaque
   */
  buildWelcomePlaque() {
    const seniorName = this.expData.displayName || 'Elder';
    const welcomeTexture = createTextPlaqueTexture({
      title: `Welcome Home, ${seniorName}`,
      subtitle: 'Your Living Sanctuary of Memories & Loved Ones ❤️',
      meta: 'Gaze or click on any memory, game, song, or companion',
      width: 1024,
      height: 256,
      bgColor: '#181C28',
      textColor: '#FFFBEB',
      accentColor: '#F59E0B'
    });
    this.allocatedTextures.push(welcomeTexture);

    const plaqueGeo = new THREE.PlaneGeometry(3.6, 0.9);
    const plaqueMat = new THREE.MeshBasicMaterial({
      map: welcomeTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.allocatedGeometries.push(plaqueGeo);
    this.allocatedMaterials.push(plaqueMat);

    const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaqueMesh.position.set(0, 2.5, -3.4);
    this.rootGroup.add(plaqueMesh);
  }

  /**
   * 3. Spatial Curved Memory Wall (6–8 Real Photos as Physical Interactive Frames)
   */
  buildMemoryWall() {
    const photos = Array.isArray(this.expData.memories?.photos) ? this.expData.memories.photos : [];
    const visiblePhotos = photos.slice(0, VR_CONFIG.MAX_VISIBLE_MEMORIES);

    // Empty state plaque if user has no photos uploaded yet
    if (visiblePhotos.length === 0) {
      const emptyTexture = createTextPlaqueTexture({
        title: 'Your Memories Will Live Here',
        subtitle: 'Cherished moments and family photographs will appear as your loved ones add them ❤️',
        meta: 'This space is lovingly reserved for your special moments.',
        width: 768,
        height: 384,
        bgColor: '#1E2438',
        textColor: '#FFFFFF',
        accentColor: '#D97706'
      });
      this.allocatedTextures.push(emptyTexture);

      const emptyGeo = new THREE.PlaneGeometry(2.4, 1.2);
      const emptyMat = new THREE.MeshBasicMaterial({ map: emptyTexture, side: THREE.DoubleSide });
      this.allocatedGeometries.push(emptyGeo);
      this.allocatedMaterials.push(emptyMat);

      const emptyMesh = new THREE.Mesh(emptyGeo, emptyMat);
      emptyMesh.position.set(0, 1.5, -3.2);
      this.rootGroup.add(emptyMesh);
      return;
    }

    // Crescent arc directly in front of the seated user
    const arcRadius = 3.3;
    const count = visiblePhotos.length;
    const angleSpan = count > 1 ? 1.3 : 0;
    const startAngle = -angleSpan / 2;
    const angleStep = count > 1 ? angleSpan / (count - 1) : 0;

    visiblePhotos.forEach((photo, idx) => {
      const angle = count === 1 ? 0 : startAngle + idx * angleStep;
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius;

      const cardGroup = new THREE.Group();
      cardGroup.position.set(x, 1.45, z);
      cardGroup.lookAt(0, 1.45, 0);

      // Wooden Frame with gold trim
      const frameGeo = new THREE.BoxGeometry(1.05, 1.25, 0.06);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x2A241C,
        roughness: 0.6,
        metalness: 0.2
      });
      this.allocatedGeometries.push(frameGeo);
      this.allocatedMaterials.push(frameMat);
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      cardGroup.add(frameMesh);

      // Inner Photo Plane
      const photoGeo = new THREE.PlaneGeometry(0.92, 0.82);
      this.allocatedGeometries.push(photoGeo);

      let photoTexture = null;
      if (photo.storagePath) {
        const streamUrl = `/api/media/file/${photo.storagePath}${this.sessionToken ? `?token=${encodeURIComponent(this.sessionToken)}` : ''}`;
        photoTexture = this.textureLoader.load(
          streamUrl,
          (t) => {
            t.minFilter = THREE.LinearFilter;
            t.generateMipmaps = false;
            t.needsUpdate = true;
          },
          undefined,
          () => {
            photoMesh.material.map = createTextPlaqueTexture({
              title: photo.title || 'Memory Photo',
              subtitle: 'Photo in Vault',
              bgColor: '#2D3748'
            });
            photoMesh.material.needsUpdate = true;
          }
        );
        this.allocatedTextures.push(photoTexture);
      } else {
        photoTexture = createTextPlaqueTexture({
          title: photo.title || 'Family Moment',
          subtitle: 'Cherished Memory',
          bgColor: '#2D3748'
        });
        this.allocatedTextures.push(photoTexture);
      }

      const photoMat = new THREE.MeshBasicMaterial({
        map: photoTexture,
        side: THREE.FrontSide
      });
      this.allocatedMaterials.push(photoMat);

      const photoMesh = new THREE.Mesh(photoGeo, photoMat);
      photoMesh.position.set(0, 0.14, 0.035);
      cardGroup.add(photoMesh);

      // Bottom Title Plaque
      const plaqueTexture = createTextPlaqueTexture({
        title: photo.title || 'Family Memory',
        subtitle: photo.caption || photo.date || 'Cherished Photograph',
        width: 512,
        height: 128,
        bgColor: '#1E2438',
        textColor: '#FFFFFF',
        accentColor: '#F59E0B'
      });
      this.allocatedTextures.push(plaqueTexture);

      const titleGeo = new THREE.PlaneGeometry(0.92, 0.24);
      const titleMat = new THREE.MeshBasicMaterial({ map: plaqueTexture });
      this.allocatedGeometries.push(titleGeo);
      this.allocatedMaterials.push(titleMat);

      const titleMesh = new THREE.Mesh(titleGeo, titleMat);
      titleMesh.position.set(0, -0.44, 0.035);
      cardGroup.add(titleMesh);

      this.interactiveMeshes.push(cardGroup);
      this.rootGroup.add(cardGroup);

      this.memoryCards.push({
        group: cardGroup,
        basePosY: 1.45,
        phase: idx * 0.5
      });

      // Register with VRInteractionManager for unified focus, badges & inspection
      if (this.interactionManager) {
        this.interactionManager.register({
          id: `photo_${photo.id || idx}`,
          category: 'memory',
          rootGroup: cardGroup,
          pickableMeshes: [frameMesh, photoMesh, titleMesh],
          focusLabel: 'View Memory',
          focusSublabel: photo.title || 'Cherished Photo',
          accentHex: VR_CONFIG.STATION_COLORS.MEMORY.hex,
          accentColorNum: VR_CONFIG.STATION_COLORS.MEMORY.num,
          defaultColorNum: 0x2A241C,
          highlightMesh: frameMesh,
          badgeOffsetY: 0.85,
          inspectData: {
            title: photo.title || 'Family Memory',
            subtitle: photo.caption ? (photo.date ? `${photo.date} • ${photo.caption}` : photo.caption) : (photo.date || 'Cherished Photograph'),
            description: photo.caption || photo.description || 'A cherished memory preserved in your family digital vault.',
            footerNote: 'Gaze or click "Back to Room" to return.',
            icon: '🖼️',
            accentHex: VR_CONFIG.STATION_COLORS.MEMORY.hex,
            speechText: photo.caption ? `Let's remember this moment. ${photo.title}. ${photo.caption}` : `Let's remember this moment. ${photo.title || 'A beautiful family photograph.'}`
          }
        });
      }
    });
  }

  /**
   * 4. Family Corner (Physical Pedestals & Respectful Titles)
   */
  buildFamilyCorner() {
    const family = Array.isArray(this.expData.family) ? this.expData.family : [];

    if (family.length === 0) {
      const emptyTexture = createTextPlaqueTexture({
        title: 'Family Sanctuary',
        subtitle: 'Portraits of your children, grandchildren, and loved ones will be lovingly placed here 👨‍👩‍👧',
        meta: 'Cherished ties that bind family hearts across generations.',
        width: 768,
        height: 384,
        bgColor: '#1E2438'
      });
      this.allocatedTextures.push(emptyTexture);

      const emptyGeo = new THREE.PlaneGeometry(1.6, 0.8);
      const emptyMat = new THREE.MeshBasicMaterial({ map: emptyTexture });
      this.allocatedGeometries.push(emptyGeo);
      this.allocatedMaterials.push(emptyMat);

      const emptyMesh = new THREE.Mesh(emptyGeo, emptyMat);
      emptyMesh.position.set(-2.8, 1.4, -1.5);
      emptyMesh.lookAt(0, 1.4, 0);
      this.rootGroup.add(emptyMesh);
      return;
    }

    const startAngle = -0.95; // ~ -55 degrees
    const endAngle = -1.57;   // ~ -90 degrees (direct left)
    const arcRadius = 3.0;
    const count = Math.min(family.length, 5);
    const angleStep = count > 1 ? (endAngle - startAngle) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const member = family[i];
      const angle = count === 1 ? (startAngle + endAngle) / 2 : startAngle + i * angleStep;
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius;

      const familyGroup = new THREE.Group();
      familyGroup.position.set(x, 1.4, z);
      familyGroup.lookAt(0, 1.4, 0);

      // Pedestal column base (teakwood cylinder)
      const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.9, 24);
      const pedestalMat = new THREE.MeshStandardMaterial({
        color: 0x33261D,
        roughness: 0.7
      });
      this.allocatedGeometries.push(pedestalGeo);
      this.allocatedMaterials.push(pedestalMat);
      const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestalMesh.position.set(0, -0.45, 0);
      familyGroup.add(pedestalMesh);

      // Circular Portrait Plaque
      const portraitGeo = new THREE.CircleGeometry(0.32, 32);
      this.allocatedGeometries.push(portraitGeo);

      const photoUrl = member.avatarUrl || member.photoURL;
      let portraitTexture = null;

      if (photoUrl) {
        portraitTexture = this.textureLoader.load(
          photoUrl,
          (t) => {
            t.minFilter = THREE.LinearFilter;
            t.needsUpdate = true;
          },
          undefined,
          () => {
            portraitMesh.material.map = createAvatarFallbackTexture({
              name: member.name || 'Family',
              relation: member.relationship || '',
              gender: member.gender || ''
            });
            portraitMesh.material.needsUpdate = true;
          }
        );
        this.allocatedTextures.push(portraitTexture);
      } else {
        portraitTexture = createAvatarFallbackTexture({
          name: member.name || 'Family',
          relation: member.relationship || '',
          gender: member.gender || ''
        });
        this.allocatedTextures.push(portraitTexture);
      }

      const portraitMat = new THREE.MeshBasicMaterial({
        map: portraitTexture,
        side: THREE.DoubleSide
      });
      this.allocatedMaterials.push(portraitMat);

      const portraitMesh = new THREE.Mesh(portraitGeo, portraitMat);
      portraitMesh.position.set(0, 0.28, 0.05);
      familyGroup.add(portraitMesh);

      // Strict cultural naming rules
      const formattedName = formatFamilyDisplayName(member);
      const relationLabel = member.familiarTitle || member.relationship || 'Family';
      const metaLabel = member.isFavorite ? '⭐ Close to Heart' : (member.location ? `📍 ${member.location}` : '');

      const nameTexture = createTextPlaqueTexture({
        title: formattedName,
        subtitle: relationLabel,
        meta: metaLabel,
        width: 512,
        height: 180,
        bgColor: '#1E2438',
        textColor: '#FFFFFF',
        accentColor: '#38BDF8'
      });
      this.allocatedTextures.push(nameTexture);

      const nameGeo = new THREE.PlaneGeometry(0.7, 0.25);
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTexture });
      this.allocatedGeometries.push(nameGeo);
      this.allocatedMaterials.push(nameMat);

      const nameMesh = new THREE.Mesh(nameGeo, nameMat);
      nameMesh.position.set(0, -0.15, 0.05);
      familyGroup.add(nameMesh);

      this.interactiveMeshes.push(familyGroup);
      this.rootGroup.add(familyGroup);

      this.familyPedestals.push({
        group: familyGroup,
        basePosY: 1.4,
        phase: i * 0.6
      });

      if (this.interactionManager) {
        this.interactionManager.register({
          id: `family_${member.id || i}`,
          category: 'family',
          rootGroup: familyGroup,
          pickableMeshes: [pedestalMesh, portraitMesh, nameMesh],
          focusLabel: 'Meet Family',
          focusSublabel: formattedName,
          accentHex: VR_CONFIG.STATION_COLORS.FAMILY.hex,
          accentColorNum: VR_CONFIG.STATION_COLORS.FAMILY.num,
          defaultColorNum: 0x33261D,
          highlightMesh: pedestalMesh,
          badgeOffsetY: 0.75,
          inspectData: {
            title: formattedName,
            subtitle: relationLabel,
            description: member.personalContext || member.shortDescription || `${formattedName} is in your close family circle. Always in your thoughts and heart.`,
            footerNote: metaLabel || 'Family member in your sanctuary circle.',
            icon: '👨‍👩‍👧‍👦',
            accentHex: VR_CONFIG.STATION_COLORS.FAMILY.hex,
            speechText: `${formattedName}, your beloved ${relationLabel}. ${member.personalContext || ''}`
          }
        });
      }
    }
  }

  /**
   * 5. Games Table (Crafted 3D Wooden Table with Tactile Cognitive Pieces)
   */
  buildGamesTable() {
    const tableGroup = new THREE.Group();
    // Position at Front-Right (x: 1.8m, z: -1.8m) angled toward user
    tableGroup.position.set(1.8, 0, -1.8);
    tableGroup.lookAt(0, 0, 0);

    // Tabletop (teakwood slab)
    const topGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.08, 32);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x2E1E14,
      roughness: 0.6
    });
    this.allocatedGeometries.push(topGeo);
    this.allocatedMaterials.push(topMat);
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.y = 0.85;
    tableGroup.add(topMesh);

    // Central Pillar Base & Pedestal
    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.22, 0.85, 24);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x22150E, roughness: 0.7 });
    this.allocatedGeometries.push(pillarGeo, pillarMat);
    this.allocatedMaterials.push(pillarMat);
    const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
    pillarMesh.position.y = 0.425;
    tableGroup.add(pillarMesh);

    // Tactile 3D Puzzle Game Blocks on tabletop
    const block1Geo = new THREE.BoxGeometry(0.2, 0.04, 0.28);
    const block1Mat = new THREE.MeshStandardMaterial({ color: 0x8B5CF6, roughness: 0.4 });
    this.allocatedGeometries.push(block1Geo, block1Mat);
    this.allocatedMaterials.push(block1Mat);
    const block1 = new THREE.Mesh(block1Geo, block1Mat);
    block1.position.set(-0.22, 0.91, -0.05);
    block1.rotation.y = 0.2;
    tableGroup.add(block1);

    const block2Geo = new THREE.BoxGeometry(0.2, 0.04, 0.28);
    const block2Mat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
    this.allocatedGeometries.push(block2Geo, block2Mat);
    this.allocatedMaterials.push(block2Mat);
    const block2 = new THREE.Mesh(block2Geo, block2Mat);
    block2.position.set(0.08, 0.91, 0.05);
    block2.rotation.y = -0.3;
    tableGroup.add(block2);

    this.gameBlocks = [
      { mesh: block1, baseY: 0.91, phase: 0 },
      { mesh: block2, baseY: 0.91, phase: Math.PI }
    ];

    // Table Station Signage Plaque
    const signTexture = createStationPlaqueTexture({
      title: 'Memory Games',
      subtitle: 'Gentle Brain & Recall Activities',
      icon: '🧩',
      accentColor: VR_CONFIG.STATION_COLORS.GAMES.hex,
      bgColor: '#1B1528'
    });
    this.allocatedTextures.push(signTexture);

    const signGeo = new THREE.PlaneGeometry(0.75, 0.38);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    this.allocatedGeometries.push(signGeo, signMat);
    this.allocatedMaterials.push(signMat);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 1.18, 0);
    tableGroup.add(signMesh);

    this.interactiveMeshes.push(tableGroup);
    this.rootGroup.add(tableGroup);

    if (this.interactionManager) {
      this.interactionManager.register({
        id: 'station_games',
        category: 'game',
        rootGroup: tableGroup,
        pickableMeshes: [topMesh, signMesh, block1, block2],
        focusLabel: 'Play a Memory Game',
        focusSublabel: 'Daily Cognitive Activities',
        accentHex: VR_CONFIG.STATION_COLORS.GAMES.hex,
        accentColorNum: VR_CONFIG.STATION_COLORS.GAMES.num,
        defaultColorNum: 0x2E1E14,
        highlightMesh: topMesh,
        badgeOffsetY: 1.25,
        onSelect: () => {
          this.openGamesSession();
        }
      });
    }
  }

  /**
   * Launches the 3D Interactive Cognitive Game Session on the Games Table
   */
  openGamesSession() {
    if (this.onStateChange) this.onStateChange('GAME');

    if (this.gameSession) {
      this.gameSession.dispose();
      this.gameSession = null;
    }

    this.gameSession = new VRGameSession({
      scene: this.scene,
      camera: this.camera,
      cameraRig: this.cameraRig,
      expData: this.expData,
      currentPack: this.currentPack,
      elderlyUserId: this.elderlyUserId,
      cognitiveClient: this.cognitiveClient,
      onRecordSession: this.onRecordSession,
      onSpeak: this.onSpeak,
      interactionManager: this.interactionManager,
      onReturnToRoom: () => {
        this.gameSession = null;
        if (this.onStateChange) this.onStateChange('ROOM');
      }
    });

    this.gameSession.openMenu();
  }

  /**
   * 6. Music Corner (Vintage 3D Gramophone & Nostalgic Tracks)
   */
  buildMusicCorner() {
    const musicGroup = new THREE.Group();
    // Position at Right Wing (x: 2.7m, z: -0.6m) angled toward center
    musicGroup.position.set(2.7, 0, -0.6);
    musicGroup.lookAt(0, 0, 0);

    // Cabinet Credenza Base
    const cabGeo = new THREE.BoxGeometry(0.85, 0.8, 0.65);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x261910, roughness: 0.7 });
    this.allocatedGeometries.push(cabGeo, cabMat);
    this.allocatedMaterials.push(cabMat);
    const cabMesh = new THREE.Mesh(cabGeo, cabMat);
    cabMesh.position.y = 0.4;
    musicGroup.add(cabMesh);

    // Gramophone Square Wooden Base
    const gramoBaseGeo = new THREE.BoxGeometry(0.55, 0.12, 0.55);
    const gramoBaseMat = new THREE.MeshStandardMaterial({ color: 0x3D2415, roughness: 0.5 });
    this.allocatedGeometries.push(gramoBaseGeo, gramoBaseMat);
    this.allocatedMaterials.push(gramoBaseMat);
    const gramoBaseMesh = new THREE.Mesh(gramoBaseGeo, gramoBaseMat);
    gramoBaseMesh.position.y = 0.86;
    musicGroup.add(gramoBaseMesh);

    // Vinyl Record Disc
    const vinylGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32);
    const vinylMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.4 });
    this.allocatedGeometries.push(vinylGeo, vinylMat);
    this.allocatedMaterials.push(vinylMat);
    const vinylMesh = new THREE.Mesh(vinylGeo, vinylMat);
    vinylMesh.position.set(0, 0.93, 0);
    musicGroup.add(vinylMesh);
    this.vinylDisc = vinylMesh;

    // Golden Record Label center
    const labelGeo = new THREE.CircleGeometry(0.07, 24);
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xD97706, side: THREE.DoubleSide });
    this.allocatedGeometries.push(labelGeo, labelMat);
    this.allocatedMaterials.push(labelMat);
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.set(0, 0.945, 0);
    musicGroup.add(labelMesh);

    // Flared Brass Gramophone Horn (ConeGeometry oriented upward & flared)
    const hornGeo = new THREE.ConeGeometry(0.26, 0.6, 24, 1, true);
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0xD4AF37,
      metalness: 0.85,
      roughness: 0.25,
      side: THREE.DoubleSide
    });
    this.allocatedGeometries.push(hornGeo, hornMat);
    this.allocatedMaterials.push(hornMat);
    const hornMesh = new THREE.Mesh(hornGeo, hornMat);
    hornMesh.position.set(-0.08, 1.25, -0.05);
    hornMesh.rotation.z = Math.PI * 0.75;
    hornMesh.rotation.y = 0.3;
    musicGroup.add(hornMesh);

    // Station Signage Plaque
    const audioCount = Array.isArray(this.expData.memories?.audios) ? this.expData.memories.audios.length : 0;
    const signTexture = createStationPlaqueTexture({
      title: 'Melody Room',
      subtitle: `${audioCount} Nostalgic Songs in Vault`,
      icon: '🎵',
      accentColor: VR_CONFIG.STATION_COLORS.MUSIC.hex,
      bgColor: '#12261F'
    });
    this.allocatedTextures.push(signTexture);

    const signGeo = new THREE.PlaneGeometry(0.75, 0.38);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    this.allocatedGeometries.push(signGeo, signMat);
    this.allocatedMaterials.push(signMat);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 1.6, 0);
    musicGroup.add(signMesh);

    this.interactiveMeshes.push(musicGroup);
    this.rootGroup.add(musicGroup);

    if (this.interactionManager) {
      const topSongTitle = this.expData.memories?.audios?.[0]?.title || 'Regional Folk & Golden Era Classics';
      this.interactionManager.register({
        id: 'station_music',
        category: 'music',
        rootGroup: musicGroup,
        pickableMeshes: [cabMesh, gramoBaseMesh, vinylMesh, hornMesh, signMesh],
        focusLabel: 'Listen to Music',
        focusSublabel: 'Nostalgic Melodies',
        accentHex: VR_CONFIG.STATION_COLORS.MUSIC.hex,
        accentColorNum: VR_CONFIG.STATION_COLORS.MUSIC.num,
        defaultColorNum: 0x261910,
        highlightMesh: cabMesh,
        badgeOffsetY: 1.7,
        inspectData: {
          title: 'Nostalgic Melody Corner',
          subtitle: `${audioCount} Cherished Songs in Memory Vault`,
          description: `Featuring: "${topSongTitle}". Nostalgic melodies, golden-era classics, and soothing regional tunes that kindle warmth, rhythm, and pleasant reminiscence.`,
          footerNote: 'Nostalgic music soothes, comforts, and awakens old memories.',
          icon: '🎵',
          accentHex: VR_CONFIG.STATION_COLORS.MUSIC.hex,
          speechText: 'Welcome to the melody corner. Let us listen to your favorite nostalgic songs.'
        }
      });
    }
  }

  /**
   * 7. Cozy Hearth Talk & Recall Companion Station
   */
  buildTalkAndRecallStation() {
    const talkGroup = new THREE.Group();
    // Position at Left Comfort Corner (x: -2.0m, z: 1.5m) angled toward center
    talkGroup.position.set(-2.0, 0, 1.5);
    talkGroup.lookAt(0, 0, 0);

    // Companion Side Table
    const tableGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.8, 24);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x2A1C14, roughness: 0.7 });
    this.allocatedGeometries.push(tableGeo, tableMat);
    this.allocatedMaterials.push(tableMat);
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = 0.4;
    talkGroup.add(tableMesh);

    // Warm Ambient Lantern on Table
    const lanternGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.28, 16);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xFB7185,
      emissive: 0xFB7185,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    this.allocatedGeometries.push(lanternGeo, lanternMat);
    this.allocatedMaterials.push(lanternMat);
    const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
    lanternMesh.position.set(0, 0.94, 0);
    talkGroup.add(lanternMesh);

    // Soft warm lantern light
    const lanternLight = new THREE.PointLight(0xFFA07A, 0.8, 3.5);
    lanternLight.position.set(0, 1.05, 0);
    talkGroup.add(lanternLight);

    // Station Signage Plaque
    const signTexture = createStationPlaqueTexture({
      title: 'Talk to Smriti',
      subtitle: 'Gentle Conversational Friend',
      icon: '🗣️',
      accentColor: VR_CONFIG.STATION_COLORS.TALK.hex,
      bgColor: '#261219'
    });
    this.allocatedTextures.push(signTexture);

    const signGeo = new THREE.PlaneGeometry(0.75, 0.38);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    this.allocatedGeometries.push(signGeo, signMat);
    this.allocatedMaterials.push(signMat);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 1.35, 0);
    talkGroup.add(signMesh);

    this.interactiveMeshes.push(talkGroup);
    this.rootGroup.add(talkGroup);

    if (this.interactionManager) {
      this.interactionManager.register({
        id: 'station_talk',
        category: 'talk',
        rootGroup: talkGroup,
        pickableMeshes: [tableMesh, lanternMesh, signMesh],
        focusLabel: 'Talk to Smriti',
        focusSublabel: 'Patient Conversational Companion',
        accentHex: VR_CONFIG.STATION_COLORS.TALK.hex,
        accentColorNum: VR_CONFIG.STATION_COLORS.TALK.num,
        defaultColorNum: 0x2A1C14,
        highlightMesh: tableMesh,
        badgeOffsetY: 1.5,
        onSelect: () => this.openTalkCompanion(),
        inspectData: {
          title: 'Talk & Recall Companion',
          subtitle: 'Your Patient, Caring Conversational Friend',
          description: 'A comforting, listening presence ready to hear your stories, remember childhood places, and reminisce about the good old days in Assamese, Bengali, Hindi, or English.',
          footerNote: 'Speak freely whenever you wish to share a memory.',
          icon: '🗣️',
          accentHex: VR_CONFIG.STATION_COLORS.TALK.hex,
          speechText: 'Hello, I am Smriti. I am always here to listen and talk about your cherished stories.'
        }
      });
    }
  }

  /**
   * Opens the dedicated 3D Conversational Companion Space
   */
  openTalkCompanion(initialContext = null) {
    if (this.onStateChange) this.onStateChange('TALK');

    if (this.gameSession) {
      this.gameSession.dispose();
      this.gameSession = null;
    }
    if (this.talkCompanion) {
      this.talkCompanion.dispose();
      this.talkCompanion = null;
    }

    this.talkCompanion = new VRTalkCompanion({
      scene: this.scene,
      camera: this.camera,
      cameraRig: this.cameraRig,
      expData: this.expData,
      elderlyUserId: this.elderlyUserId,
      cognitiveClient: this.cognitiveClient,
      voiceService: this.voiceService,
      interactionManager: this.interactionManager,
      initialContext,
      onNavigateToMemoryWall: () => {
        if (this.talkCompanion) {
          this.talkCompanion.close();
        }
      },
      onReturnToRoom: () => {
        this.talkCompanion = null;
        if (this.onStateChange) this.onStateChange('ROOM');
      }
    });

    this.talkCompanion.open();
  }

  /**
   * Returns all interactive 3D objects for legacy raycasting compatibility
   */
  getInteractiveObjects() {
    return this.interactiveMeshes;
  }

  /**
   * Legacy selection trigger: delegates to VRInteractionManager if available
   */
  onSelectTarget(targetGroup) {
    if (!targetGroup) return;

    if (this.interactionManager) {
      const targetId = targetGroup.userData?.targetId;
      const target = targetId ? this.interactionManager.targets.get(targetId) : null;
      if (target) {
        this.interactionManager.triggerSelect(target);
        return;
      }
    }

    // Fallback animation
    targetGroup.position.y += 0.08;
    setTimeout(() => {
      targetGroup.position.y -= 0.08;
    }, 600);
  }

  /**
   * Animation update tick
   */
  update(delta) {
    if (this.gameSession && typeof this.gameSession.update === 'function') {
      this.gameSession.update(delta);
    }
    if (this.talkCompanion && typeof this.talkCompanion.update === 'function') {
      this.talkCompanion.update(delta);
    }

    // Phase 3: Subtle Living Room Idle Breathing (skips objects currently forward-moved or inspected)
    const t = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) * 0.001;

    // 1. Memory Wall gentle float
    if (Array.isArray(this.memoryCards)) {
      for (const item of this.memoryCards) {
        if (item.group && !item.group.userData?.isForwardMoved) {
          item.group.position.y = item.basePosY + Math.sin(t * 1.2 + item.phase) * 0.008;
        }
      }
    }

    // 2. Family Corner subtle pedestal breath
    if (Array.isArray(this.familyPedestals)) {
      for (const item of this.familyPedestals) {
        if (item.group && !item.group.userData?.isForwardMoved) {
          item.group.position.y = item.basePosY + Math.sin(t * 0.9 + item.phase) * 0.006;
        }
      }
    }

    // 3. Games Table tactile pieces subtle hover
    if (Array.isArray(this.gameBlocks)) {
      for (const item of this.gameBlocks) {
        if (item.mesh) {
          item.mesh.position.y = item.baseY + Math.sin(t * 1.5 + item.phase) * 0.004;
        }
      }
    }

    // 4. Music Corner vinyl slow idle rotation
    if (this.vinylDisc) {
      this.vinylDisc.rotation.y += (delta || 0.016) * 0.4;
    }
  }

  /**
   * Clean memory disposal on VR exit
   */
  dispose() {
    if (this.gameSession) {
      this.gameSession.dispose();
      this.gameSession = null;
    }
    if (this.talkCompanion) {
      this.talkCompanion.dispose();
      this.talkCompanion = null;
    }

    this.interactiveMeshes = [];
    this.scene.remove(this.rootGroup);

    this.allocatedGeometries.forEach(g => {
      if (g && typeof g.dispose === 'function') g.dispose();
    });
    this.allocatedMaterials.forEach(m => {
      if (m && typeof m.dispose === 'function') m.dispose();
    });
    this.allocatedTextures.forEach(t => {
      if (t && typeof t.dispose === 'function') t.dispose();
    });

    this.allocatedGeometries = [];
    this.allocatedMaterials = [];
    this.allocatedTextures = [];
  }
}
