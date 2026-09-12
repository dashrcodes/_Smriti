/**
 * SMRITI VR WORLD ATMOSPHERE
 * Interaction-reinforcing environmental atmosphere:
 * - Experience state-based lighting:
 *   - 'ROOM' / 'WELCOME': Balanced, warm golden living room lighting
 *   - 'MEMORY': Warm spotlighting highlighting the Memory Wall, peripheral room softened
 *   - 'FAMILY': Warm accent lighting illuminating the Family Corner
 *   - 'GAME': Focused warm pool of light over the Games Table
 *   - 'TALK': Intimate warm amber hearth glow around the Talk Companion
 * - Gentle window sunbeam & soft floor reflection patch on parquet
 * - 35 lightweight floating ambient light motes drifting naturally
 * - Smooth per-frame lerping for all lighting transitions (dementia-safe, no sudden jumps)
 * - Complete GPU resource cleanup
 */

export class VRWorldAtmosphere {
  constructor({ scene, camera, allocatedAssets }) {
    this.scene = scene;
    this.camera = camera;
    this.allocatedAssets = allocatedAssets || [];

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.currentState = 'WELCOME';
    this.animTime = 0;

    // State light targets
    this.targetLights = {
      ambient: 1.45,
      chandelier: 1.2,
      wallSpot: 0.4,
      tableSpot: 0.3,
      talkSpot: 0.3
    };

    this.currentLights = { ...this.targetLights };

    this.initAtmosphericLighting();
    this.initSunbeamAndFloorPatch();
    this.initLightMotes();
  }

  /**
   * Initializes interaction-focused spot and accent lights
   */
  initAtmosphericLighting() {
    // 1. Memory Wall Accent Spotlight (aimed at front curved wall, z: -3.3m)
    if (typeof THREE.SpotLight !== 'undefined') {
      this.wallSpotLight = new THREE.SpotLight(0xFFFBEB, 0.4, 9.0, Math.PI / 3, 0.4, 1.2);
      this.wallSpotLight.position.set(0, 3.2, 0);
      this.wallSpotLight.target.position.set(0, 1.45, -3.3);
      this.scene.add(this.wallSpotLight);
      this.scene.add(this.wallSpotLight.target);

      // 2. Games Table Accent Spotlight (aimed at front-right table, x: 2.3, z: -2.3)
      this.tableSpotLight = new THREE.SpotLight(0xFDF4DC, 0.3, 8.0, Math.PI / 4, 0.5, 1.2);
      this.tableSpotLight.position.set(1.5, 3.2, -1.0);
      this.tableSpotLight.target.position.set(2.3, 0.85, -2.3);
      this.scene.add(this.tableSpotLight);
      this.scene.add(this.tableSpotLight.target);

      // 3. Talk & Recall Hearth Accent Spotlight (aimed at companion area, z: -1.9m)
      this.talkSpotLight = new THREE.SpotLight(0xFDE68A, 0.3, 7.5, Math.PI / 3.5, 0.5, 1.2);
      this.talkSpotLight.position.set(0, 3.0, -0.5);
      this.talkSpotLight.target.position.set(0, 1.35, -1.9);
      this.scene.add(this.talkSpotLight);
      this.scene.add(this.talkSpotLight.target);
    }
  }

  /**
   * Adds a subtle warm morning sunbeam light patch on the parquet floor
   */
  initSunbeamAndFloorPatch() {
    // 1. Soft Elliptical Floor Light Patch (sunlight entering from the high window)
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = 512;
    patchCanvas.height = 512;
    const ctx = patchCanvas.getContext('2d');
    if (ctx && typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 240);
      grad.addColorStop(0, 'rgba(254, 243, 199, 0.38)');
      grad.addColorStop(0.5, 'rgba(253, 230, 138, 0.20)');
      grad.addColorStop(1, 'rgba(253, 230, 138, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
    }

    const patchTex = new THREE.CanvasTexture(patchCanvas);
    patchTex.minFilter = THREE.LinearFilter;
    this.allocatedAssets.push(patchTex);

    const patchGeo = new THREE.PlaneGeometry(3.2, 2.4);
    const patchMat = new THREE.MeshBasicMaterial({
      map: patchTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.allocatedAssets.push(patchGeo, patchMat);

    this.floorPatchMesh = new THREE.Mesh(patchGeo, patchMat);
    this.floorPatchMesh.rotation.x = -Math.PI / 2;
    this.floorPatchMesh.rotation.z = Math.PI * 0.15;
    this.floorPatchMesh.position.set(1.6, 0.015, -1.2);
    this.rootGroup.add(this.floorPatchMesh);
  }

  /**
   * 35 lightweight floating ambient light motes that drift naturally in the sunbeam
   */
  initLightMotes() {
    const moteCount = 35;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(moteCount * 3);

    for (let i = 0; i < moteCount; i++) {
      pos[i * 3] = 0.5 + (Math.random() - 0.5) * 3.5;
      pos[i * 3 + 1] = 0.2 + Math.random() * 2.8;
      pos[i * 3 + 2] = -1.5 + (Math.random() - 0.5) * 3.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xFDE68A,
      size: 0.042,
      transparent: true,
      opacity: 0.65
    });
    this.allocatedAssets.push(geo, mat);

    this.moteMesh = new THREE.Points(geo, mat);
    this.rootGroup.add(this.moteMesh);
  }

  /**
   * Sets the experience-based atmospheric state
   * @param {'WELCOME' | 'ROOM' | 'MEMORY' | 'FAMILY' | 'GAME' | 'TALK'} state
   */
  setState(state = 'ROOM') {
    return this.setExperienceState(state);
  }

  setExperienceState(state = 'ROOM') {
    this.currentState = state;

    switch (state) {
      case 'MEMORY':
        // Memory exploration: spotlight on Memory Wall, peripheral dimming
        this.targetLights.ambient = 1.15;
        this.targetLights.chandelier = 0.95;
        this.targetLights.wallSpot = 1.6;
        this.targetLights.tableSpot = 0.15;
        this.targetLights.talkSpot = 0.15;
        break;

      case 'FAMILY':
        // Family Corner focus: soft amber-blue glow
        this.targetLights.ambient = 1.25;
        this.targetLights.chandelier = 1.0;
        this.targetLights.wallSpot = 0.6;
        this.targetLights.tableSpot = 0.2;
        this.targetLights.talkSpot = 0.2;
        break;

      case 'GAME':
        // Cognitive Game focus: focused pool over games table
        this.targetLights.ambient = 1.05;
        this.targetLights.chandelier = 0.85;
        this.targetLights.wallSpot = 0.2;
        this.targetLights.tableSpot = 1.8;
        this.targetLights.talkSpot = 0.2;
        break;

      case 'TALK':
        // Companion focus: intimate hearth glow around companion
        this.targetLights.ambient = 1.0;
        this.targetLights.chandelier = 0.75;
        this.targetLights.wallSpot = 0.2;
        this.targetLights.tableSpot = 0.15;
        this.targetLights.talkSpot = 1.7;
        break;

      case 'WELCOME':
      case 'ROOM':
      default:
        // Balanced welcoming room
        this.targetLights.ambient = 1.45;
        this.targetLights.chandelier = 1.2;
        this.targetLights.wallSpot = 0.4;
        this.targetLights.tableSpot = 0.3;
        this.targetLights.talkSpot = 0.3;
        break;
    }
  }

  /**
   * Per-frame atmospheric update (smooth lighting lerps and gentle mote drift)
   */
  update(deltaMs) {
    const deltaSec = Math.min(deltaMs, 100) * 0.001;
    this.animTime += deltaSec;

    // 1. Smoothly interpolate lighting towards target values (gentle, dementia-safe transitions)
    const lerpSpeed = 2.4 * deltaSec;
    for (const key of Object.keys(this.targetLights)) {
      this.currentLights[key] += (this.targetLights[key] - this.currentLights[key]) * Math.min(1, lerpSpeed);
    }

    if (this.wallSpotLight) this.wallSpotLight.intensity = this.currentLights.wallSpot;
    if (this.tableSpotLight) this.tableSpotLight.intensity = this.currentLights.tableSpot;
    if (this.talkSpotLight) this.talkSpotLight.intensity = this.currentLights.talkSpot;

    // 2. Subtle floor sun patch breathing
    if (this.floorPatchMesh) {
      const patchPulse = 0.95 + Math.sin(this.animTime * 0.8) * 0.05;
      this.floorPatchMesh.scale.set(patchPulse, patchPulse, 1);
    }

    // 3. Gentle natural drift of sunbeam light motes
    if (this.moteMesh) {
      const positions = this.moteMesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += Math.sin(this.animTime * 0.9 + i) * 0.0006;
        positions[i + 1] += 0.0012; // slow upward buoyancy
        positions[i + 2] += Math.cos(this.animTime * 0.8 + i) * 0.0006;

        if (positions[i + 1] > 3.0) {
          positions[i + 1] = 0.2;
        }
      }
      this.moteMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Complete asset cleanup
   */
  dispose() {
    this.scene.remove(this.rootGroup);

    if (this.wallSpotLight) {
      this.scene.remove(this.wallSpotLight);
      this.scene.remove(this.wallSpotLight.target);
      this.wallSpotLight = null;
    }
    if (this.tableSpotLight) {
      this.scene.remove(this.tableSpotLight);
      this.scene.remove(this.tableSpotLight.target);
      this.tableSpotLight = null;
    }
    if (this.talkSpotLight) {
      this.scene.remove(this.talkSpotLight);
      this.scene.remove(this.talkSpotLight.target);
      this.talkSpotLight = null;
    }
    this.ambientLight = null;
    this.moteMesh = null;
  }
}
