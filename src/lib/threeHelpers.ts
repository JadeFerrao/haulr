import * as THREE from 'three';

// ── colour palettes ──────────────────────────────────────────────────────────
export function buildColors(dark: boolean) {
  return dark
    ? {
        ground: 0x121d36, road: 0x1d2d50, dash: 0x3a5080, slab: 0x182544,
        bld: 0x2a3b62, roof: 0x3a4f80, tree: 0x2f4472, navy: 0x0a1020,
        blue: 0x6f93ff, cab: 0x3d63e8, panel: 0x1d4fd0, glass: 0x7fb0ff,
        van: 0xdce6ff, mast: 0x6f86b8, warn: 0xf0a030, water: 0x15305f,
        foam: 0x4d74c0,
      }
    : {
        ground: 0xd9e4f4, road: 0xaebfdb, dash: 0xffffff, slab: 0xeef4fc,
        bld: 0xffffff, roof: 0xcfdbee, tree: 0xf4f8fd, navy: 0x1a2442,
        blue: 0x1f4fe0, cab: 0x173ec0, panel: 0x1f3f9e, glass: 0x9cc3ff,
        van: 0xffffff, mast: 0x9bb0d6, warn: 0xf0a030, water: 0x9fc0ea,
        foam: 0xffffff,
      };
}

// ── material cache ───────────────────────────────────────────────────────────
const matCache: Record<number, THREE.MeshStandardMaterial> = {};
export function mat(c: number) {
  return (matCache[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }));
}
export const bas = (c: number) => new THREE.MeshBasicMaterial({ color: c });

// ── geometry helpers ─────────────────────────────────────────────────────────
export function box(
  w: number, h: number, d: number, c: number,
  x: number, y: number, z: number,
  sh = true, p: THREE.Object3D
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z);
  m.castShadow = sh;
  m.receiveShadow = true;
  p.add(m);
  return m;
}

export function cyl(
  rt: number, rb: number, h: number, c: number,
  x: number, y: number, z: number,
  seg = 12, p: THREE.Object3D
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  p.add(m);
  return m;
}

// ── seeded PRNG ──────────────────────────────────────────────────────────────
let seed = 7;
export function rnd() {
  return (seed = (seed * 16807) % 2147483647) / 2147483647;
}
export function resetSeed() { seed = 7; }

// ── easing ───────────────────────────────────────────────────────────────────
export const smooth = (t: number) => t * t * (3 - 2 * t);

// ── loop-path helpers ────────────────────────────────────────────────────────
export interface LoopPath {
  p: [number, number][];
  L: number[];
  T: number;
  v: number;
  sig?: SignalApproach[];
}

export function loopPts(x0: number, x1: number, z0: number, z1: number, r: number): Omit<LoopPath, 'v'> {
  const p: [number, number][] = [];
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    for (let i = 0; i <= 9; i++) {
      const a = a0 + (a1 - a0) * i / 9;
      p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  arc(x1 - r, z0 + r, -Math.PI / 2, 0);
  arc(x1 - r, z1 - r, 0, Math.PI / 2);
  arc(x0 + r, z1 - r, Math.PI / 2, Math.PI);
  arc(x0 + r, z0 + r, Math.PI, Math.PI * 1.5);
  const L = [0]; let t = 0;
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1], b = p[i % p.length];
    t += Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(t);
  }
  return { p, L, T: t };
}

export function at(lp: LoopPath, d: number): [number, number] {
  d = ((d % lp.T) + lp.T) % lp.T;
  let i = 1;
  while (lp.L[i] < d) i++;
  const a = lp.p[i - 1], b = lp.p[i % lp.p.length];
  const f = (d - lp.L[i - 1]) / (lp.L[i] - lp.L[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// ── path-builder for charging-station maneuvers ──────────────────────────────
export interface PathBuilder {
  pts: [number, number][];
  cum: number[];
  T: number;
  revEnd: number;
  add: (x: number, z: number) => PathBuilder;
  arc: (cx: number, cz: number, r: number, a0: number, a1: number) => PathBuilder;
  mark: () => PathBuilder;
}

export function PB(x: number, z: number): PathBuilder {
  const p: PathBuilder = {
    pts: [[x, z]], cum: [0], T: 0, revEnd: 0,
    add(x2, z2) {
      const a = p.pts[p.pts.length - 1];
      p.T += Math.hypot(x2 - a[0], z2 - a[1]);
      p.pts.push([x2, z2]); p.cum.push(p.T); return p;
    },
    arc(cx, cz, r, a0, a1) {
      for (let k = 1; k <= 10; k++) {
        const a = a0 + (a1 - a0) * k / 10;
        p.add(cx + r * Math.cos(a), cz + r * Math.sin(a));
      }
      return p;
    },
    mark() { p.revEnd = p.T; return p; },
  };
  return p;
}

export function poseOn(p: PathBuilder, s: number): [number, number, number] {
  s = Math.max(0, Math.min(p.T, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < s) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const sg = (p.cum[i] - p.cum[i - 1]) || 1;
  const f = (s - p.cum[i - 1]) / sg;
  let dx = (b[0] - a[0]) / sg, dz = (b[1] - a[1]) / sg;
  if (s < p.revEnd - 1e-6) { dx = -dx; dz = -dz; }
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(-dz, dx)];
}

// ── signal approach type ─────────────────────────────────────────────────────
export interface SignalApproach {
  d: number; ax: number; off: number; flash: boolean; state: number;
  qx: number; qz: number; hx: number; hz: number; px: number; pz: number;
}

