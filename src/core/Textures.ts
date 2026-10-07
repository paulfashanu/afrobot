import * as THREE from 'three';

/** Procedurally drawn canvas textures — no external image assets needed. */

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Kente-inspired woven stripe band (used on Afrobot and trims). */
export function kenteTexture() {
  return canvasTex('kente', 128, 32, (g) => {
    const cols = ['#f6b40e', '#138a43', '#d7261e', '#111111', '#f6b40e', '#1b4fd1'];
    for (let i = 0; i < 16; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(i * 8, 0, 8, 32);
    }
    g.fillStyle = '#111';
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(i * 8 + 2, j * 8 + 2, 4, 4);
    }
    g.fillStyle = '#f6b40e';
    g.fillRect(0, 0, 128, 3);
    g.fillRect(0, 29, 128, 3);
  });
}

/**
 * Building facade, drawn light so `material.color` can tint it.
 * One tile = one floor (3 units tall) × 4 units wide.
 */
export function facadeTexture(variant: number) {
  return canvasTex('facade' + variant, 256, 192, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 192);
    const glass = '#22335a';
    const frame = '#d9d9d9';
    if (variant === 0) {
      // Zigzag band + square windows
      g.fillStyle = '#bdbdbd';
      g.beginPath();
      for (let x = 0; x <= 256; x += 32) {
        g.lineTo(x, 22);
        g.lineTo(x + 16, 6);
      }
      g.lineTo(256, 30); g.lineTo(0, 30); g.fill();
      for (const x of [24, 140]) {
        g.fillStyle = frame; g.fillRect(x - 6, 52, 104, 112);
        g.fillStyle = glass; g.fillRect(x, 58, 92, 100);
        g.fillStyle = '#4d6aa8'; g.fillRect(x, 58, 92, 22);
      }
    } else if (variant === 1) {
      // Mud-cloth triangles between tall windows
      for (let x = 0; x < 256; x += 64) {
        g.fillStyle = glass; g.fillRect(x + 8, 34, 26, 130);
        g.fillStyle = '#4d6aa8'; g.fillRect(x + 8, 34, 26, 18);
        g.fillStyle = '#a8a8a8';
        for (let y = 40; y < 160; y += 24) {
          g.beginPath(); g.moveTo(x + 42, y); g.lineTo(x + 58, y); g.lineTo(x + 50, y + 14); g.fill();
        }
      }
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 14);
    } else if (variant === 2) {
      // Futuristic vertical fins with balconies
      g.fillStyle = glass; g.fillRect(0, 30, 256, 130);
      g.fillStyle = '#4d6aa8'; g.fillRect(0, 30, 256, 18);
      g.fillStyle = '#f2f2f2';
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 20, 10, 150);
      g.fillStyle = '#c4c4c4'; g.fillRect(0, 160, 256, 14);
    } else {
      // Round porthole windows with dotted pattern
      g.fillStyle = '#c9c9c9';
      for (let x = 8; x < 256; x += 16) for (let y = 8; y < 192; y += 16) {
        g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
      }
      for (const x of [64, 192]) {
        g.fillStyle = frame; g.beginPath(); g.arc(x, 100, 46, 0, Math.PI * 2); g.fill();
        g.fillStyle = glass; g.beginPath(); g.arc(x, 100, 38, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4d6aa8'; g.beginPath(); g.arc(x - 8, 90, 14, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

/** Emissive-ish window grid for the distant skyline. */
export function skylineTexture() {
  return canvasTex('skyline', 128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) for (let y = 0; y < 128; y += 16) {
      g.fillStyle = Math.random() < 0.3 ? '#9fb6d8' : '#5f7398';
      g.fillRect(x + 4, y + 4, 8, 9);
    }
  });
}

/** Asphalt road with Lagos-yellow lane markings. Tile = 12 units wide × 12 long. */
export function roadTexture() {
  return canvasTex('road', 256, 256, (g) => {
    g.fillStyle = '#4a4e5a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#555a66' : '#40444f';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.fillStyle = '#ffc21a';
    g.fillRect(122, 0, 5, 256); g.fillRect(131, 0, 5, 256);
    g.fillStyle = '#f2f2f2';
    for (let y = 0; y < 256; y += 64) { g.fillRect(58, y + 8, 6, 36); g.fillRect(192, y + 8, 6, 36); }
    g.fillRect(4, 0, 6, 256); g.fillRect(246, 0, 6, 256);
  });
}

/** Patterned paving for plazas/sidewalks (tinted). Tile = 4 units. */
export function pavingTexture() {
  return canvasTex('paving', 128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d6d6d6';
    g.fillRect(0, 0, 128, 3); g.fillRect(0, 64, 128, 3); g.fillRect(0, 0, 3, 128); g.fillRect(64, 0, 3, 128);
    g.fillStyle = '#e6e6e6';
    g.beginPath(); g.moveTo(32, 12); g.lineTo(52, 32); g.lineTo(32, 52); g.lineTo(12, 32); g.fill();
    g.beginPath(); g.moveTo(96, 76); g.lineTo(116, 96); g.lineTo(96, 116); g.lineTo(76, 96); g.fill();
  });
}

/** Platform side trim: triangles along the top edge (tinted). Tile = 2 units. */
export function trimTexture() {
  return canvasTex('trim', 128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c8c8c8';
    for (let x = 0; x < 128; x += 32) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 26); g.fill();
    }
    g.fillStyle = '#e2e2e2'; g.fillRect(0, 100, 128, 8);
  });
}

export function waterTexture() {
  return canvasTex('water', 256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d4f6ff'; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 12 + Math.random() * 26;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
    }
  });
}

/** Stripes for market canopies & umbrellas. */
export function stripeTexture(a: string, b: string) {
  return canvasTex('stripe' + a + b, 64, 64, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 64, 64);
    g.fillStyle = b; g.fillRect(0, 0, 16, 64); g.fillRect(32, 0, 16, 64);
  });
}

/** Signboard / hint text. */
export function textTexture(
  key: string,
  lines: string[],
  opts: { w?: number; h?: number; bg?: string; fg?: string; accent?: string; font?: number } = {},
) {
  const w = opts.w ?? 512, h = opts.h ?? 160;
  const t = canvasTex('text:' + key, w, h, (g) => {
    g.fillStyle = opts.bg ?? '#1d1240';
    roundRect(g, 0, 0, w, h, 26); g.fill();
    if (opts.accent) {
      g.fillStyle = opts.accent;
      g.fillRect(0, h - 14, w, 14);
      g.fillRect(0, 0, w, 8);
    }
    g.fillStyle = opts.fg ?? '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = opts.font ?? (lines.length > 1 ? 46 : 64);
    g.font = `700 ${size}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    const lh = size * 1.12;
    const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => g.fillText(ln, w / 2, y0 + i * lh, w - 40));
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** BoxGeometry with UVs scaled to world size so textures tile without stretching. */
export function worldBox(w: number, h: number, d: number, tileU = 4, tileV = 3): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * (fu / tileU), uv.getY(k) * (fv / tileV));
    }
  }
  uv.needsUpdate = true;
  return geo;
}
