/**
 * SMRITI VR UI & INTERACTION HELPERS
 * Elderly & dementia-friendly interaction helpers:
 * - Configurable gaze-and-dwell reticle
 * - Standardized cultural naming conventions ([Name] Baba / [Name] Maa)
 * - Canvas 2D crisp text and avatar texture generators
 * - Visual hover and focus states
 */

export const VR_CONFIG = {
  // Configurable dwell duration in milliseconds (default 1400ms = 1.4s)
  DWELL_DURATION_MS: 1400,

  // Visual cues
  RETICLE_COLOR: 0xF59E0B,        // Warm amber-gold idle
  RETICLE_ACTIVE_COLOR: 0x10B981, // Soothing emerald on activation
  POINTER_MAX_DISTANCE: 8.0,      // Max raycast distance (meters)
  HIGHLIGHT_COLOR: 0xF59E0B,     // Warm amber outline on focus
  CARD_HOVER_FORWARD: 0.15,       // Subtle forward float on gaze (meters)

  // Memory Wall Constraints
  MAX_VISIBLE_MEMORIES: 8,        // Phase 1 MVP memory limit to protect GPU memory
  TEXTURE_MAX_SIZE: 1024,         // Texture clamp to prevent VRAM exhaustion on mobile headsets

  // Phase 2A Physical Interactive Station Themes
  STATION_COLORS: {
    MEMORY: { hex: '#F59E0B', num: 0xF59E0B, label: 'View Memory' },
    FAMILY: { hex: '#38BDF8', num: 0x38BDF8, label: 'Meet Family' },
    GAMES: { hex: '#C084FC', num: 0xC084FC, label: 'Play a Memory Game' },
    MUSIC: { hex: '#34D399', num: 0x34D399, label: 'Listen to Music' },
    TALK: { hex: '#FB7185', num: 0xFB7185, label: 'Talk to Smriti' }
  }
};

/**
 * Resolves respectful senior and family naming strictly according to convention:
 * Male: [Real Name] Baba
 * Female: [Real Name] Maa
 * Neutral / Missing Gender: [Real Name]
 * NEVER: Baba [Name] or Maa [Name]
 * NEVER infers gender purely from a name string
 */
export function formatFamilyDisplayName(member) {
  if (!member) return 'Family Member';
  const rawName = (member.name || member.displayName || '').trim();
  if (!rawName) return 'Family Member';

  const gender = (member.gender || '').toLowerCase().trim();
  const title = (member.familiarTitle || member.relationship || '').trim();

  // Guard against double suffixing
  if (gender === 'male') {
    if (rawName.endsWith(' Baba')) return rawName;
    return `${rawName} Baba`;
  }
  if (gender === 'female') {
    if (rawName.endsWith(' Maa')) return rawName;
    return `${rawName} Maa`;
  }

  // If gender is missing or neutral, preserve real name with optional familiar title
  return rawName;
}

/**
 * Creates a crisp, high-contrast canvas texture for 3D wooden/slate text plaques
 */
export function createTextPlaqueTexture({
  title = '',
  subtitle = '',
  meta = '',
  width = 512,
  height = 256,
  bgColor = '#1E2438',
  textColor = '#FFFFFF',
  accentColor = '#F59E0B'
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background panel with soft rounded bevel
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 32px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const truncatedTitle = title.length > 26 ? title.substring(0, 24) + '...' : title;
  ctx.fillText(truncatedTitle, width / 2, height * 0.38);

  // Subtitle / Relationship
  if (subtitle) {
    ctx.fillStyle = accentColor;
    ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const truncatedSubtitle = subtitle.length > 32 ? subtitle.substring(0, 30) + '...' : subtitle;
    ctx.fillText(truncatedSubtitle, width / 2, height * 0.65);
  }

  // Extra Meta / Date info
  if (meta) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(meta, width / 2, height * 0.85);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Creates a fallback circular avatar canvas texture when real image URL is missing
 */
export function createAvatarFallbackTexture({
  name = 'Family',
  relation = '',
  gender = '',
  size = 256
}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Gentle gradient background
  const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size / 2);
  if (gender === 'female') {
    grad.addColorStop(0, '#FFE4E6');
    grad.addColorStop(1, '#FDA4AF');
  } else if (gender === 'male') {
    grad.addColorStop(0, '#E0E7FF');
    grad.addColorStop(1, '#A5B4FC');
  } else {
    grad.addColorStop(0, '#FEF3C7');
    grad.addColorStop(1, '#FDE68A');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Icon symbol
  ctx.font = `${Math.round(size * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const symbol = gender === 'female' ? '👵' : gender === 'male' ? '👨‍🦳' : '🧑‍💼';
  ctx.fillText(symbol, size / 2, size * 0.45);

  // Name initials or short label
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const shortName = name.length > 14 ? name.substring(0, 12) + '..' : name;
  ctx.fillText(shortName, size / 2, size * 0.82);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Constructs an interactive Gaze Reticle attached to the Three.js camera
 */
export function createGazeReticle() {
  const group = new THREE.Group();

  // Outer countdown ring
  const ringGeo = new THREE.RingGeometry(0.018, 0.024, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: VR_CONFIG.RETICLE_COLOR,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75,
    depthTest: false
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.renderOrder = 999;
  group.add(ringMesh);

  // Center focus dot
  const dotGeo = new THREE.CircleGeometry(0.005, 16);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xFFFFFF,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });
  const dotMesh = new THREE.Mesh(dotGeo, dotMat);
  dotMesh.renderOrder = 1000;
  group.add(dotMesh);

  // Position 1.2m directly in front of the camera viewpoint
  group.position.set(0, 0, -1.2);

  return {
    group,
    ringMesh,
    dotMesh,
    setProgress(pct) {
      // Scale outer ring subtly to indicate dwell progress
      const clamped = Math.max(0, Math.min(1, pct));
      if (clamped > 0) {
        ringMat.color.setHex(clamped >= 1 ? VR_CONFIG.RETICLE_ACTIVE_COLOR : VR_CONFIG.RETICLE_COLOR);
        ringMesh.scale.set(1 + clamped * 0.35, 1 + clamped * 0.35, 1);
        ringMat.opacity = 0.95;
      } else {
        ringMat.color.setHex(VR_CONFIG.RETICLE_COLOR);
        ringMesh.scale.set(1, 1, 1);
        ringMat.opacity = 0.75;
      }
    },
    setVisible(visible) {
      group.visible = visible;
    }
  };
}

/**
 * Creates high-contrast, tactile 3D signage for memory room stations
 */
export function createStationPlaqueTexture({
  title = '',
  subtitle = '',
  icon = '',
  width = 512,
  height = 256,
  accentColor = '#F59E0B',
  bgColor = '#181C28'
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);

  // Icon
  if (icon) {
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, width / 2, height * 0.32);
  }

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = icon ? height * 0.65 : height * 0.45;
  ctx.fillText(title, width / 2, titleY);

  // Subtitle
  if (subtitle) {
    ctx.fillStyle = accentColor;
    ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const subY = icon ? height * 0.85 : height * 0.72;
    ctx.fillText(subtitle, width / 2, subY);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

