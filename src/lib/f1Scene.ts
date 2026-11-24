import * as THREE from 'three';

export interface F1Car {
  i: number;
  tm: [string, number, string]; // [TeamName, colorHex, DriverCode]
  g: THREE.Group;
  rm: THREE.MeshBasicMaterial;
  wheels: [THREE.Group, number][];
  mode: 'grid' | 'track' | 'pit';
  s: number;
  lat: number;
  lane: number;
  v: number;
  slot: number;
  cool: boolean;
  finPos?: number;
  stopS: number;
  slotLat: number;
  pace: number;
  lap: number;
  sPrev: number;
  comp: number;
  wantPit: boolean;
  lapsSince: number;
  stint: number;
  hold: number;
  pitLap: number;
  stops: number;
  lapT0: number;
  last: number;
  u: number;
  pstate: string;
  tt: number;
  dur: number;
  lift: number;
  crewIn: boolean;
  swapped: boolean;
  bx?: number;
  uBox: number;
  offx: number;
  offz: number;
  pos: number;
  tag?: HTMLButtonElement;
  row?: HTMLButtonElement;
  rp?: HTMLElement;
  rg?: HTMLElement;
  rt?: HTMLElement;
}

export interface F1Stats {
  laps: { t: number; c: number }[];
  best: { t: number; drv: string; team: string; lap: number };
  stops: number[];
  stopN: number;
}

export interface F1TimingItem {
  carIndex: number;
  code: string;
  team: string;
  teamColor: string;
  pos: number;
  gap: string;
  tyre: string;
  tyreColor: string;
}

export interface F1SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  cars: F1Car[];
  cop: {
    mode: string;
    g: THREE.Group;
    u: number;
    s: number;
    v: number;
    uPark: number;
    offx: number;
    offz: number;
  };
  ST: F1Stats;
  TL: number;
  sE: number;
  sX: number;
  PL: number;
  step: (dt: number, now: number) => void;
  timing: () => F1Car[];
  getRt: () => number;
  getPhase: () => string;
  getScOn: () => boolean;
  getGreenT: () => number;
  getLightsN: () => number;
  fring: THREE.Mesh;
  getFstate: () => { msg: string; status: 'red' | 'green' | '' };
  select: (i: number) => void;
  getSel: () => number;
}

export function buildF1Scene(canvas: HTMLCanvasElement): F1SceneState {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const K = dark
    ? {
        sand: 0x1b2641, run: 0x24325a, asph: 0x2e3b5c, asph2: 0x3a4a70, pit: 0x3f4f78,
        wall: 0x5a6a99, gar: 0x2a3b62, garR: 0x34466f, dgl: 0x0e1830, glass: 0x4d93ff,
        white: 0xdce6ff, palm: 0x2f8f62, bar1: 0x3d63e8, bar2: 0xdce6ff, line: 0xe8efff,
      }
    : {
        sand: 0xe8e0cb, run: 0xd8cfb3, asph: 0x56617b, asph2: 0x65708b, pit: 0x7a86a3,
        wall: 0xb4bed4, gar: 0xffffff, garR: 0xe3ebf7, dgl: 0x1c2c5a, glass: 0x2f6bff,
        white: 0xffffff, palm: 0x3f9a5f, bar1: 0x1f4fe0, bar2: 0xffffff, line: 0xffffff,
      };
  const SKIN = [0xf2c9a5, 0xd9a27a, 0x9a6b4a, 0x6b4630];

  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFSoftShadowMap;

  const S = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 500);

  S.add(new THREE.HemisphereLight(dark ? 0x8fa8ff : 0xffffff, dark ? 0x0c1426 : 0xa9bfe3, dark ? 0.9 : 0.62));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 0.6 : 0.5);
  sun.position.set(-50, 80, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(innerWidth < 900 ? 2048 : 4096);
  const bCam = 165;
  Object.assign(sun.shadow.camera, { left: -bCam, right: bCam, top: bCam, bottom: -bCam, near: 1, far: 300 });
  sun.shadow.radius = 4;
  S.add(sun);

  const mats: Record<number, THREE.MeshStandardMaterial> = {};
  function mat(c: number) {
    return mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }));
  }
  function box(w: number, h: number, d: number, c: number, x: number, y: number, z: number, sh = true, p: THREE.Object3D = S) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    m.castShadow = sh;
    m.receiveShadow = true;
    p.add(m);
    return m;
  }
  function cyl(rt: number, rb: number, h: number, c: number, x: number, y: number, z: number, seg = 12, p: THREE.Object3D = S) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    p.add(m);
    return m;
  }
  const bas = (c: number) => new THREE.MeshBasicMaterial({ color: c });

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ss = (t: number) => smooth(clamp(t));
  const TS = 3.9;
  const dd = new THREE.Object3D();

  const G = new THREE.Group();
  S.add(G);

  const B = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, sh = true) => box(w, h, d, c, x, y, z, sh, G);
  const Y = (rt: number, rb: number, h: number, c: number, x: number, y: number, z: number, seg = 12) => cyl(rt, rb, h, c, x, y, z, seg, G);

  const TEAMS: [string, number, string][] = [
    ['Apex', 0xe0443a, 'ALX'],
    ['Vortex', 0x1f6bff, 'BRN'],
    ['Nova', 0xf5a623, 'CHO'],
    ['Titan', 0x2fd08a, 'DVR'],
    ['Zephyr', 0x9b6bff, 'ELL'],
    ['Orbit', 0x19c6d8, 'FRN'],
    ['Helix', 0xff5ca8, 'GRC'],
    ['Quasar', 0xf2e63c, 'HNT'],
    ['Falcon', 0xf4f6ff, 'IVN'],
    ['Pulse', 0x8892b8, 'JKS'],
  ];
  const HELM = [0xffffff, 0xffd23c, 0x2fe08a, 0xff4b4b, 0x19c6d8, 0xf5a623, 0xffffff, 0x9b6bff, 0xe0443a, 0x1f6bff];
  const COMP = [
    { n: 'S', c: 0xff4b4b },
    { n: 'M', c: 0xffd23c },
    { n: 'H', c: 0xf4f6ff },
  ];

  const fg = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(K.sand));
  fg.rotation.x = -Math.PI / 2;
  fg.receiveShadow = true;
  G.add(fg);

  // ---- circuit centre line, curvature, speed profile
  const ctrl: [number, number][] = [
    [0, 0], [30, 0], [60, 0], [86, 2], [103, 17], [111, 40], [115, 66], [115.5, 82], [113, 96],
    [107.9, 104.4], [99.7, 112.4], [91.9, 119.4], [86.5, 127], [83.8, 136.8], [81.7, 149],
    [76.7, 162.2], [65.9, 173.1], [48.6, 178.7], [26.4, 177], [0, 168.8], [-21.1, 157.4],
    [-32.7, 146.5], [-41.9, 139.2], [-52.3, 136.1], [-65.7, 135.6], [-81.2, 135.1], [-96.1, 132.2],
    [-107.6, 126.2], [-114.7, 117.3], [-117.8, 106.7], [-118.9, 94.9], [-119.4, 80], [-119.6, 65],
    [-118, 50], [-112, 34], [-101, 18], [-86, 5], [-62, 0], [-30, 0],
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'centripetal');
  const FN = 720, TL = curve.getLength(), TD = TL / FN, PS = curve.getSpacedPoints(FN);
  const Px = new Float32Array(FN + 1), Pz = new Float32Array(FN + 1), Tx = new Float32Array(FN + 1), Tz = new Float32Array(FN + 1), Nx = new Float32Array(FN + 1), Nz = new Float32Array(FN + 1), ks = new Float32Array(FN + 1);

  for (let i = 0; i <= FN; i++) { Px[i] = PS[i].x; Pz[i] = PS[i].z; }
  for (let i = 0; i < FN; i++) {
    const a = (i - 1 + FN) % FN, b = (i + 1) % FN, dx = Px[b] - Px[a], dz = Pz[b] - Pz[a], l = Math.hypot(dx, dz) || 1;
    Tx[i] = dx / l; Tz[i] = dz / l;
  }
  Tx[FN] = Tx[0]; Tz[FN] = Tz[0];
  for (let i = 0; i <= FN; i++) { Nx[i] = -Tz[i]; Nz[i] = Tx[i]; }

  const kr = new Float32Array(FN);
  for (let i = 0; i < FN; i++) {
    const a = (i - 2 + FN) % FN, b = (i + 2) % FN;
    kr[i] = ((Tx[b] - Tx[a]) * Nx[i] + (Tz[b] - Tz[a]) * Nz[i]) / (4 * TD);
  }
  for (let i = 0; i < FN; i++) {
    let s = 0;
    for (let k = -5; k <= 5; k++) s += kr[(i + k + FN) % FN];
    ks[i] = s / 11;
  }
  ks[FN] = ks[0];

  const VMIN = 13, VMAX = 42, vp = new Float32Array(FN);
  for (let i = 0; i < FN; i++) vp[i] = VMIN + (VMAX - VMIN) * Math.exp(-Math.abs(ks[i]) * 38);
  for (let r = 0; r < 3; r++) {
    for (let i = FN - 1; i >= -FN; i--) {
      const k = ((i % FN) + FN) % FN, n = (k + 1) % FN;
      vp[k] = Math.min(vp[k], Math.sqrt(vp[n] * vp[n] + 2 * 26 * TD));
    }
    for (let i = 0; i < 2 * FN; i++) {
      const k = i % FN, p = (k - 1 + FN) % FN;
      vp[k] = Math.min(vp[k], Math.sqrt(vp[p] * vp[p] + 2 * 13 * TD));
    }
  }

  function kAt(s: number) {
    const f = (((s % TL) + TL) % TL) / TD, i = Math.floor(f) % FN;
    return Math.abs(ks[i]);
  }
  function vprof(s: number) {
    const f = (((s % TL) + TL) % TL) / TD, i = Math.floor(f) % FN, j = (i + 1) % FN;
    return vp[i] + (vp[j] - vp[i]) * (f - Math.floor(f));
  }
  const po = { x: 0, z: 0, h: 0 };
  function tp(s: number, lat: number) {
    const f = (((s % TL) + TL) % TL) / TD, i = Math.floor(f) % FN, j = (i + 1) % FN, u = f - Math.floor(f);
    const tx = Tx[i] + (Tx[j] - Tx[i]) * u, tz = Tz[i] + (Tz[j] - Tz[i]) * u;
    po.x = Px[i] + (Px[j] - Px[i]) * u - tz * lat;
    po.z = Pz[i] + (Pz[j] - Pz[i]) * u + tx * lat;
    po.h = Math.atan2(-tz, tx);
    return po;
  }

  // ---- surfaces
  function ribbonFrom(X: Float32Array, Z: Float32Array, NX: Float32Array, NZ: Float32Array, n: number, a: number, b: number, y: number, m: THREE.Material) {
    const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx: number[] = [];
    for (let i = 0; i < n; i++) {
      pos.set([X[i] + NX[i] * a, y, Z[i] + NZ[i] * a, X[i] + NX[i] * b, y, Z[i] + NZ[i] * b], i * 6);
      nor.set([0, 1, 0, 0, 1, 0], i * 6);
    }
    for (let i = 0; i < n - 1; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    const me = new THREE.Mesh(g, m);
    me.receiveShadow = true;
    G.add(me);
    return me;
  }
  const sm = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  const TW = 5.8;
  ribbonFrom(Px, Pz, Nx, Nz, FN + 1, -10, 10, 0.02, sm(K.run));
  ribbonFrom(Px, Pz, Nx, Nz, FN + 1, -TW, TW, 0.04, sm(K.asph));
  ribbonFrom(Px, Pz, Nx, Nz, FN + 1, -TW + 0.15, -TW + 0.4, 0.05, sm(K.line));
  ribbonFrom(Px, Pz, Nx, Nz, FN + 1, TW - 0.4, TW - 0.15, 0.05, sm(K.line));

  // kerbs on the inside of every corner (red/white)
  {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    let n = 0;
    for (let i = 0; i < FN; i++) {
      if (Math.abs(ks[i]) < 0.028 || Math.abs(ks[(i + 1) % FN]) < 0.028) continue;
      const sg = Math.sign(ks[i]), j = i + 1, a = sg * TW, b = sg * (TW + 1.1), c = (Math.floor(i / 3) % 2) ? [0.88, 0.27, 0.23] : [0.96, 0.97, 1];
      pos.push(Px[i] + Nx[i] * a, 0.055, Pz[i] + Nz[i] * a, Px[i] + Nx[i] * b, 0.055, Pz[i] + Nz[i] * b, Px[j] + Nx[j] * a, 0.055, Pz[j] + Nz[j] * a, Px[j] + Nx[j] * b, 0.055, Pz[j] + Nz[j] * b);
      for (let q = 0; q < 4; q++) col.push(...c);
      if (sg > 0) idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      else idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      n += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setIndex(idx);
    const me = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    me.receiveShadow = true;
    G.add(me);
  }

  // start / finish line + gantry
  const bulbs: THREE.MeshBasicMaterial[][] = [];
  {
    const cv2 = document.createElement('canvas');
    cv2.width = 32; cv2.height = 128;
    const g = cv2.getContext('2d')!;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 4; c++) {
        g.fillStyle = (r + c) % 2 ? '#ffffff' : '#141a2c';
        g.fillRect(c * 8, r * 8, 8, 8);
      }
    }
    const t = new THREE.CanvasTexture(cv2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2 * TW), new THREE.MeshBasicMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.06, 0);
    G.add(m);

    [-8.2, 8.2].forEach(z => Y(0.3, 0.3, 8, K.wall, 3, 4, z, 8));
    B(1, 0.8, 17.6, K.wall, 3, 8, 0);
    [-4.4, -2.2, 0, 2.2, 4.4].forEach(z => {
      B(0.8, 3.7, 1.7, 0x161b2e, 3, 5.85, z, false);
      Y(0.06, 0.06, 0.3, K.wall, 3, 7.8, z, 6);
      const col: THREE.MeshBasicMaterial[] = [];
      [7, 6.35, 5.7, 5.05].forEach(y => {
        const bm = new THREE.MeshBasicMaterial({ color: 0x2a1c1c });
        const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 18), bm);
        bb.rotation.z = Math.PI / 2;
        bb.position.set(2.56, y, z);
        G.add(bb);
        col.push(bm);
      });
      bulbs.push(col);
    });
  }

  // barriers along the outside of the track (instanced), skipped on the pit side
  const sE = (() => {
    let bd = 1e9, r = 0;
    for (let i = Math.floor(FN * 0.8); i < FN; i++) {
      const d = Math.abs(Px[i] + 66);
      if (d < bd) { bd = d; r = i * TD; }
    }
    return r;
  })();
  const sX = (() => {
    let bd = 1e9, r = 0;
    for (let i = 0; i < FN * 0.2; i++) {
      const d = Math.abs(Px[i] - 66);
      if (d < bd) { bd = d; r = i * TD; }
    }
    return r;
  })();

  {
    const list: [number, number][] = [];
    for (let s = 0; s < TL; s += 4.2) {
      for (const side of [-1, 1]) {
        if (side < 0 && (s > sE - 8 || s < sX + 8)) continue;
        list.push([s, side]);
      }
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 0.75, 0.35), mat(0xffffff), list.length);
    im.castShadow = true; im.receiveShadow = true;
    list.forEach(([s, side], k) => {
      const q = tp(s, side * (TW + 1.9));
      dd.position.set(q.x, 0.38, q.z);
      dd.rotation.set(0, q.h, 0);
      dd.updateMatrix();
      im.setMatrixAt(k, dd.matrix);
      im.setColorAt(k, new THREE.Color(Math.floor(s / 4.2) % 2 ? K.bar1 : K.bar2));
    });
    dd.rotation.set(0, 0, 0);
    G.add(im);
  }

  // floodlight masts
  for (let s = 30; s < TL; s += 88) {
    const q = tp(s, 16), x = q.x, z = q.z;
    if (Math.abs(x) < 60 && z < 34) continue;
    Y(0.18, 0.3, 15, K.wall, x, 7.5, z, 8);
    B(2.2, 0.35, 0.8, 0xffffff, x, 15.2, z, false);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.6), bas(0xffffff));
    hd.position.set(x, 15, z);
    G.add(hd);
  }

  // ---- pit lane (fast lane + working lane), links to the track
  const pcv = (() => {
    const a = tp(sE, -3.2), ax = a.x, az = a.z, b = tp(sX, -3.2), bx = b.x, bz = b.z;
    return new THREE.CatmullRomCurve3(
      [
        [ax, az], [-58, -5], [-51, -7.8], [-46, -8.5], [-20, -8.5],
        [0, -8.5], [20, -8.5], [46, -8.5], [52, -7.8], [59, -5], [bx, bz],
      ].map(p => new THREE.Vector3(p[0], 0, p[1])),
      false, 'centripetal'
    );
  })();

  const PN = 360, PL = pcv.getLength(), PD = PL / PN, pps = pcv.getSpacedPoints(PN);
  const pxA = new Float32Array(PN + 1), pzA = new Float32Array(PN + 1), pnx = new Float32Array(PN + 1), pnz = new Float32Array(PN + 1);
  for (let i = 0; i <= PN; i++) { pxA[i] = pps[i].x; pzA[i] = pps[i].z; }
  for (let i = 0; i <= PN; i++) {
    const a = Math.max(0, i - 1), b = Math.min(PN, i + 1), dx = pxA[b] - pxA[a], dz = pzA[b] - pzA[a], l = Math.hypot(dx, dz) || 1;
    pnx[i] = -dz / l; pnz[i] = dx / l;
  }
  ribbonFrom(pxA, pzA, pnx, pnz, PN + 1, -1.9, 1.9, 0.07, sm(K.pit));
  B(100, 0.05, 4.4, K.pit, 0, 0.06, -13.5, false);
  B(98, 0.02, 0.12, 0xffffff, 0, 0.1, -10.9, false);
  B(104, 0.9, 0.45, K.wall, 0, 0.45, -6.2);
  const dS = TL - sE + sX;
  const ubFor = (bx: number) => {
    for (let i = 0; i <= PN; i++) {
      if (pxA[i] >= bx && pzA[i] < -8.4) return i * PD;
    }
    return PL * 0.5;
  };

  // ---- people (instanced seated spectators / guests)
  const seats: [number, number, number, number, number, number][] = [];
  function seat(x: number, y: number, z: number, ry: number, cc: number) {
    seats.push([x, y, z, ry, cc, SKIN[Math.floor(rnd() * 4)]]);
  }
  const CLOTH = [0xe0443a, 0x1f6bff, 0xf5a623, 0x2fd08a, 0x9b6bff, 0x19c6d8, 0xff5ca8, 0xf2e63c, 0xf4f6ff, 0x2a3558];
  const pick = () => CLOTH[Math.floor(rnd() * CLOTH.length)];

  // ---- team garages + pit boxes + crews + wall screens
  const garages = TEAMS.map((t, i) => {
    const bx = -40.5 + 9 * i, col = t[1];
    B(8.7, 4.2, 0.3, K.gar, bx, 2.1, -24.5);
    B(0.3, 4.2, 7.2, K.gar, bx - 4.5, 2.1, -21);
    if (i === 9) B(0.3, 4.2, 7.2, K.gar, bx + 4.5, 2.1, -21);
    B(9, 0.35, 7.6, K.garR, bx, 4.4, -21);
    B(9, 0.95, 0.25, col, bx, 3.55, -17.4);
    const sg = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.1, 0.1), bas(col));
    sg.position.set(bx, 2.9, -17.35); G.add(sg);
    B(8.5, 0.04, 7, K.asph, bx, 0.05, -21, false);
    B(1.3, 1.3, 0.8, col, bx - 2.4, 0.65, -23.8);
    B(1.9, 0.9, 0.7, K.wall, bx + 0.2, 0.45, -23.9);
    [0, 1].forEach(k => {
      for (let r = 0; r < 3; r++) Y(0.5, 0.5, 0.32, 0x151a2b, bx + 2.3 + k * 0.1, 0.2 + r * 0.34, -22.9 + k * 1.15, 12);
    });
    const lm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 0.4), bas(0xffffff));
    lm.position.set(bx, 4.15, -21); G.add(lm);
    B(5.4, 0.02, 2.6, col, bx, 0.075, -13.5, false);
    B(0.1, 0.02, 2.6, 0xffffff, bx - 2.75, 0.085, -13.5, false);
    B(0.1, 0.02, 2.6, 0xffffff, bx + 2.75, 0.085, -13.5, false);
    B(0.16, 3, 0.16, K.white, bx, 1.8, -6.2, false);
    const sc = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 0.1), bas(col));
    sc.position.set(bx, 3.4, -6.35); G.add(sc);
    for (let k = 0; k < 6; k++) seat(bx - 3 + k * 1.2, 4.58, -19.2, 0, pick());
    return { bx, col };
  });

  const crew = TEAMS.map((t, i) => {
    const bx = garages[i].bx;
    return Array.from({ length: 5 }, (_, k) => {
      const g = new THREE.Group();
      box(0.34, 0.62, 0.26, t[1], 0, 0.55, 0, true, g);
      box(0.3, 0.3, 0.22, 0x1a2238, 0, 0.15, 0, true, g);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(0xffffff));
      hd.position.y = 1.0; hd.castShadow = true; g.add(hd);
      const ix = bx + (k - 2) * 0.85, iz = -16.3;
      g.position.set(ix, 0, iz);
      G.add(g);
      const wk = [
        [bx + 1.5, -11.75],
        [bx + 1.5, -15.25],
        [bx - 1.4, -11.75],
        [bx - 1.4, -15.25],
        [bx + 3.6, -13.5],
      ][k];
      return { g, ix, iz, wx: wk[0], wz: wk[1] };
    });
  });

  // ---- paddock hospitality blocks
  function hosp(bx: number, bz: number, w: number, d: number, tc: number) {
    B(w, 3, d, K.garR, bx, 1.5, bz);
    B(w - 0.8, 3, d - 3.2, K.gar, bx, 4.5, bz - 1.6);
    B(w - 1.6, 3, d - 6.4, K.garR, bx, 7.5, bz - 3.2);
    const z2 = bz - 1.6 + (d - 3.2) / 2, z3 = bz - 3.2 + (d - 6.4) / 2;
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(w - 2.2, 2, 0.12), bas(K.glass));
    g1.position.set(bx, 4.6, z2 + 0.08); G.add(g1);
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(w - 3, 2, 0.12), bas(K.glass));
    g2.position.set(bx, 7.6, z3 + 0.08); G.add(g2);
    const g0 = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 1.7, 0.12), bas(K.glass));
    g0.position.set(bx, 1.6, bz + d / 2 + 0.08); G.add(g0);
    B(w + 1, 0.3, d - 3, tc, bx, 10.4, bz - 2.4);
    [[-1, 1], [1, 1]].forEach(([a]) => Y(0.1, 0.1, 3, K.white, bx + a * (w / 2 - 1), 8.9, z3 + 0.5, 6));
    B(w - 0.4, 0.9, 0.08, K.white, bx, 3.5, bz + d / 2 - 0.1, false);
    B(w - 1.2, 0.9, 0.08, K.white, bx, 6.5, z2, false);
    for (let k = 0; k < Math.floor((w - 2) / 1.05); k++) {
      const x = bx - (w - 2) / 2 + k * 1.05 + 0.5;
      seat(x, 3.05, bz + d / 2 - 1, 0, pick());
      seat(x + 0.5, 3.05, bz + d / 2 - 2.2, 0, pick());
      if (k % 2 === 0) seat(x, 6.05, z2 - 0.9, 0, pick());
    }
    [-1, 1].forEach(a => {
      Y(0.05, 0.05, 1.8, K.white, bx + a * w * 0.22, 3.9, bz + d / 2 - 1.6, 6);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1, 0.45, 10), mat(tc));
      um.position.set(bx + a * w * 0.22, 4.9, bz + d / 2 - 1.6);
      um.castShadow = true; G.add(um);
    });
  }
  [[-34, 0xe0443a], [-17, 0x1f6bff], [0, 0xf5a623], [17, 0x2fd08a], [34, 0x9b6bff]].forEach(([x, c]) => hosp(x, -36, 14, 12, c));

  // ---- grandstand opposite the pits
  for (let k = 0; k < 5; k++) {
    B(104, 0.5, 2.2, K.garR, 0, 0.5 + 0.9 * k, 15.3 + 2.2 * k);
    for (let x = -48; x <= 48; x += 1.3) seat(x, 0.75 + 0.9 * k, 15.6 + 2.2 * k, Math.PI, pick());
  }
  B(104, 0.3, 7, K.white, 0, 9, 22.5);
  [-50, -25, 0, 25, 50].forEach(x => Y(0.2, 0.2, 9, K.wall, x, 4.5, 25.4, 8));
  for (let k = 0; k < 10; k++) B(10, 1.4, 0.15, TEAMS[k][1], -47 + k * 10.4, 1.1, 14.3, false);

  // ---- Bahrain-style paddock tower
  const palms: [number, number][] = [], flag = new THREE.Group();
  function tower(x0: number, z0: number) {
    Y(9.4, 9.8, 1.2, K.white, x0, 0.6, z0, 40);
    for (let k = 0; k < 7; k++) {
      const r = 6.3 + k * 0.22, y0 = 1.2 + k * 2.45;
      Y(r, r, 1.6, K.dgl, x0, y0 + 0.8, z0, 40);
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.55, r + 0.55, 0.55, 40), bas(0x3b7cff));
      bm.position.set(x0, y0 + 1.9, z0); G.add(bm);
      Y(r + 0.62, r + 0.62, 0.1, K.white, x0, y0 + 2.22, z0, 40);
      Y(r + 1, r + 1, 0.12, K.white, x0, y0 + 0.1, z0, 40);
      const n = 18;
      for (let q = 0; q < n; q++) {
        const a = q / n * Math.PI * 2;
        if (Math.sin(a) > 0.2 || k < 1) seat(x0 + Math.cos(a) * (r + 0.78), y0 + 0.12, z0 + Math.sin(a) * (r + 0.78), -a + Math.PI / 2, pick());
      }
    }
    const top = 1.2 + 7 * 2.45;
    for (let q = 0; q < 10; q++) {
      const a = q / 10 * Math.PI * 2, cx = x0 + Math.cos(a) * 6.8, cz = z0 + Math.sin(a) * 6.8;
      Y(0.09, 0.09, 2.6, K.white, cx, top + 1.3, cz, 6);
      const cn = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.4, 6), mat(K.white));
      cn.position.set(cx, top + 4.3, cz); cn.castShadow = true; G.add(cn);
      Y(0.04, 0.04, 1, K.white, cx, top + 6.5, cz, 4);
    }
    Y(0.3, 2.4, 0.5, K.white, x0, top + 0.4, z0, 20);
    const cc = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 10), mat(K.white));
    cc.position.set(x0, top + 3.4, z0); cc.castShadow = true; G.add(cc);
    Y(0.07, 0.07, 8, K.white, x0, top + 9.4, z0, 6);
    flag.position.set(x0, top + 11.6, z0); G.add(flag);
    [[-9, 10], [-4, 13], [4, 13], [9, 10]].forEach(([dx, dz]) => {
      B(3.2, 1.2, 3.2, K.white, x0 + dx, 0.6, z0 + dz);
      const tn = new THREE.Mesh(new THREE.ConeGeometry(2.5, 2.8, 4), mat(K.white));
      tn.rotation.y = Math.PI / 4; tn.position.set(x0 + dx, 2.6, z0 + dz); tn.castShadow = true; G.add(tn);
      Y(0.04, 0.04, 1.2, K.white, x0 + dx, 4.6, z0 + dz, 4);
    });
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + 0.2, r = 13 + ((k * 7) % 5);
      palms.push([x0 + Math.cos(a) * r, z0 + Math.sin(a) * r * 0.9]);
    }
  }

  {
    const red = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: 0xce1126, side: THREE.DoubleSide }));
    red.position.set(1.1, 0, 0); flag.add(red);
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.7); sh.lineTo(0.78, -0.7); sh.lineTo(0.58, -0.42); sh.lineTo(0.78, -0.14);
    sh.lineTo(0.58, 0.14); sh.lineTo(0.78, 0.42); sh.lineTo(0.58, 0.7); sh.lineTo(0, 0.7);
    const wf = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    wf.position.z = 0.01; flag.add(wf);
  }
  tower(88, -38);
  for (let k = 0; k < 16; k++) palms.push([-70 + k * 10 + ((k * 13) % 7), -48 - ((k * 5) % 6)]);
  for (let k = 0; k < 8; k++) palms.push([108 + (k % 3) * 4, -12 - k * 6]);

  {
    const N = palms.length, tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 4.2, 6), mat(0x8a7456), N);
    const fr = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 2.4, 4), mat(K.palm), N * 7);
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    let n = 0;
    tr.castShadow = true; fr.castShadow = true;
    palms.forEach(([x, z], k) => {
      const s = 0.85 + ((k * 37) % 10) / 25;
      dd.position.set(x, 2.1 * s, z); dd.rotation.set(0, 0, 0); dd.scale.set(s, s, s); dd.updateMatrix();
      tr.setMatrixAt(k, dd.matrix);
      for (let f = 0; f < 7; f++) {
        const a = f / 7 * Math.PI * 2 + k;
        dir.set(Math.cos(a), -0.45, Math.sin(a)).normalize();
        dd.scale.set(s, s, s); dd.quaternion.setFromUnitVectors(up, dir);
        dd.position.set(x + dir.x * 1.1 * s, 4.2 * s + dir.y * 1.1 * s, z + dir.z * 1.1 * s);
        dd.updateMatrix(); fr.setMatrixAt(n++, dd.matrix);
      }
    });
    dd.quaternion.identity(); dd.scale.set(1, 1, 1);
    G.add(tr); G.add(fr);
  }

  const cornerS = (tx: number, tz: number) => {
    let bd = 1e9, r = 0;
    for (let i = 0; i < FN; i++) {
      const d = Math.hypot(Px[i] - tx, Pz[i] - tz);
      if (d < bd) { bd = d; r = i * TD; }
    }
    return r;
  };
  function curveStand(sc: number, len: number, tiers: number) {
    const q = tp(sc, -(TW + 12)), sg = new THREE.Group(), qx = q.x, qz = q.z, qh = q.h;
    sg.position.set(qx, 0, qz); sg.rotation.y = qh; G.add(sg);
    const ch = Math.cos(qh), sh = Math.sin(qh);
    for (let k = 0; k < tiers; k++) {
      box(len, 0.5, 2.2, K.garR, 0, 0.5 + 0.9 * k, -k * 2.2, true, sg);
      for (let x = -len / 2 + 1; x <= len / 2 - 1; x += 1.25) {
        const lz = -k * 2.2 + 0.3;
        seat(qx + x * ch + lz * sh, 0.75 + 0.9 * k, qz - x * sh + lz * ch, qh + Math.PI, pick());
      }
    }
    box(len, 0.3, tiers * 2.2 + 1.5, K.white, 0, tiers * 0.9 + 3.2, -(tiers * 2.2) / 2 + 0.8, true, sg);
    [-len / 2 + 1, 0, len / 2 - 1].forEach(x => box(0.3, tiers * 0.9 + 3, 0.3, K.wall, x, (tiers * 0.9 + 3) / 2, -(tiers - 1) * 2.2 - 1, true, sg));
    for (let k = 0; k < 8; k++) box(len / 8 - 0.2, 1.3, 0.12, TEAMS[(k * 3) % 10][1], -len / 2 + len / 16 + k * len / 8, 1.1, 1.2, false, sg);
  }
  curveStand(cornerS(-100, 22), 44, 5);
  curveStand(cornerS(106, 22), 44, 5);
  curveStand(cornerS(72, 168), 72, 7);

  // instanced crowd
  {
    const SN = seats.length;
    const ch = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.28, 0.36), mat(K.wall), SN);
    const to = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.44, 0.24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), SN);
    const hd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), SN);
    seats.forEach(([x, y, z, ry, cc, sk], k) => {
      dd.scale.set(1, 1, 1); dd.rotation.set(0, ry, 0); dd.position.set(x, y + 0.14, z); dd.updateMatrix(); ch.setMatrixAt(k, dd.matrix);
      dd.position.set(x, y + 0.5, z); dd.updateMatrix(); to.setMatrixAt(k, dd.matrix); to.setColorAt(k, new THREE.Color(cc));
      dd.position.set(x, y + 0.86, z); dd.updateMatrix(); hd.setMatrixAt(k, dd.matrix); hd.setColorAt(k, new THREE.Color(sk));
    });
    dd.rotation.set(0, 0, 0);
    [ch, to, hd].forEach(m => { m.castShadow = true; G.add(m); });
  }

  // ---- the cars
  function makeCar(t: [string, number, string], ti: number) {
    const g = new THREE.Group(), col = t[1];
    g.scale.setScalar(1.05);
    const P = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => box(w, h, d, c, x, y, z, true, g);
    P(2.7, 0.3, 0.55, col, -0.2, 0.52, 0);
    P(1.5, 0.16, 0.3, col, 1.5, 0.44, 0);
    P(0.5, 0.08, 1.55, 0xf0f4ff, 2.3, 0.2, 0);
    P(0.3, 0.22, 0.06, col, 2.3, 0.3, 0.76);
    P(0.3, 0.22, 0.06, col, 2.3, 0.3, -0.76);
    P(1.2, 0.3, 1.1, col, -0.35, 0.48, 0);
    P(1.1, 0.36, 0.45, col, -1, 0.78, 0);
    P(0.42, 0.07, 1.2, 0xf0f4ff, -1.8, 1, 0);
    P(0.4, 0.55, 0.07, col, -1.8, 0.74, 0.58);
    P(0.4, 0.55, 0.07, col, -1.8, 0.74, -0.58);
    P(0.5, 0.22, 0.5, 0x1a2238, 0.35, 0.74, 0);
    P(0.6, 0.05, 0.07, 0x222a44, 0.45, 1.08, 0);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(HELM[ti]));
    hm.position.set(0.2, 0.9, 0); hm.castShadow = true; g.add(hm);
    const rm = new THREE.MeshBasicMaterial({ color: COMP[0].c });
    const wheels: [THREE.Group, number][] = [];
    [
      [1.4, 0.82, 0.3, 0.42], [1.4, -0.82, 0.3, 0.42],
      [-1.4, 0.84, 0.34, 0.5], [-1.4, -0.84, 0.34, 0.5],
    ].forEach(([x, z, r, w]) => {
      const wg = new THREE.Group();
      wg.position.set(x, r, z);
      const ty = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), mat(0x151a2b));
      ty.rotation.x = Math.PI / 2; ty.castShadow = true; wg.add(ty);
      const rg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.03, 14), rm);
      rg.rotation.x = Math.PI / 2; rg.position.z = Math.sign(z) * (w / 2 + 0.012); wg.add(rg);
      g.add(wg);
      wheels.push([wg, r]);
    });
    G.add(g);
    return { g, rm, wheels };
  }

  const cars: F1Car[] = TEAMS.map((tm, i) => {
    const k = makeCar(tm, i), lane = i % 2 ? 1.7 : -1.7, s = TL - 6 - i * 10;
    return {
      i, tm, g: k.g, rm: k.rm, wheels: k.wheels, mode: 'grid',
      s, lat: lane, lane, v: 0, slot: i, cool: false, finPos: undefined,
      stopS: 0, slotLat: 0, pace: 0.95 + rnd() * 0.07, lap: 0, sPrev: s,
      comp: i % 3, wantPit: false, lapsSince: Math.floor(rnd() * 3),
      stint: 3 + Math.floor(rnd() * 3), hold: 0, pitLap: 1, stops: 0,
      lapT0: 0, last: 0, u: 0, pstate: '', tt: 0, dur: 3, lift: 0,
      crewIn: false, swapped: false, bx: undefined, uBox: 0, offx: 0, offz: 0, pos: i,
    };
  });
  cars.forEach(c => c.rm.color.setHex(COMP[c.comp].c));

  const fring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 3.9, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  fring.rotation.x = -Math.PI / 2;
  G.add(fring);

  // ---- simulation
  const ST: F1Stats = { laps: [], best: { t: 1e9, drv: '---', team: '', lap: 0 }, stops: [], stopN: 0 };
  const PV = 12;
  let rt = 0;
  let fsel = 0;
  const RACE_LAPS = 10;
  const SLOT_S = [6, 12, 18, 28, 37.5, 47, 56.5, 66, 75.5, 85];
  const SLOT_L = (p: number) => p % 2 ? 1.7 : -1.7;
  let phase = 'grid', phT = 0, lightsN = 0, greenT = 0, holdT = 1.6, lightsOff = false, finOrder: F1Car[] = [], scOn = false, scDone = false;

  SLOT_S.forEach((sv, p) => {
    const s0 = TL - sv, lat = SLOT_L(p);
    let q = tp(s0 + 2.9, lat), m = box(0.18, 0.02, 2.7, 0xffffff, q.x, 0.075, q.z, false, G);
    m.rotation.y = q.h;
    [-1.35, 1.35].forEach(d => {
      q = tp(s0, lat + d);
      m = box(4.6, 0.02, 0.1, 0xffffff, q.x, 0.075, q.z, false, G);
      m.rotation.y = q.h;
    });
  });

  function toGrid(order: F1Car[]) {
    scOn = false; scDone = false;
    order.forEach((c, p) => {
      c.slot = p; c.mode = 'grid'; c.v = 0; c.s = TL - SLOT_S[p]; c.lat = c.lane = SLOT_L(p);
      c.lap = 0; c.sPrev = c.s; c.pstate = ''; c.wantPit = false; c.lapsSince = 0;
      c.stint = 4 + Math.floor(rnd() * 3); c.pitLap = 1; c.stops = 0; c.finPos = undefined;
      c.cool = false; c.lift = 0; c.crewIn = false; c.swapped = false; c.bx = undefined;
      c.comp = Math.floor(rnd() * 3); c.rm.color.setHex(COMP[c.comp].c);
      c.lapT0 = 0; c.last = 0; c.hold = 0;
      const q = tp(c.s, c.lat);
      c.g.position.set(q.x, 0, q.z); c.g.rotation.y = q.h;
    });
  }

  function setLights(n: number, green: boolean) {
    bulbs.forEach((col, k) => col.forEach((bm, r) => bm.color.setHex(green ? 0x2fe08a : (k < n && r >= 2) ? 0xff2a2a : 0x2a1c1c)));
  }

  function phaseStep(dt: number) {
    phT += dt;
    if (phase === 'grid') {
      if (phT > 5) { phase = 'lights'; phT = 0; holdT = 1.2 + Math.random() * 1.6; }
    } else if (phase === 'lights') {
      lightsN = Math.min(5, Math.floor(phT));
      setLights(lightsN, false);
      if (phT >= 5 + holdT) {
        phase = 'race'; phT = 0; greenT = 0; lightsOff = false;
        setLights(0, true);
        cars.forEach(c => { c.mode = 'track'; c.lane = c.lat < 0 ? -3.2 : 3.2; c.lapT0 = rt; c.hold = 2; });
      }
    } else if (phase === 'race') {
      greenT += dt;
      if (greenT > 3.5 && !lightsOff) { setLights(0, false); lightsOff = true; }
    } else if (phase === 'finish') {
      if (cars.every(c => c.mode === 'grid')) { phase = 'parked'; phT = 0; }
    } else if (phase === 'parked') {
      if (phT > 9) {
        const order = finOrder.slice();
        finOrder = [];
        toGrid(order);
        phase = 'grid';
        phT = 0;
        setLights(0, false);
      }
    }
  }

  function laneFree(c: F1Car, Y2: number) {
    for (const o of cars) {
      if (o === c || o.mode !== 'track') continue;
      const ds = ((((o.s - c.s) % TL) + TL + TL / 2) % TL) - TL / 2;
      if (ds > -10 && ds < 14 && (Math.abs(o.lat - Y2) < (kAt(c.s) > 0.028 ? 3.6 : 3) || Math.abs(o.lane - Y2) < 0.6)) return false;
    }
    return true;
  }

  function pitOK() {
    return cop.mode === 'park' && cars.filter(o => o.mode === 'pit').length < 2 && !cars.some(o => o.mode === 'pit' && o.pstate !== 'stop' && o.u < 16);
  }

  function mergeClear() {
    for (const o of cars) {
      if (o.mode !== 'track') continue;
      const ds = ((((o.s - sX) % TL) + TL + TL / 2) % TL) - TL / 2;
      if (Math.abs(o.lat + 3.2) < 3 && ((ds > -26 && ds < 0 && o.v > 6) || (ds >= 0 && ds < 12))) return false;
    }
    return true;
  }

  function lapDone(c: F1Car) {
    const t = rt - c.lapT0;
    c.lapT0 = rt; c.lap++; c.lapsSince++;
    if (c.pitLap > 0) {
      c.pitLap--;
    } else if (!c.cool && cop.mode === 'park') {
      c.last = t;
      if (t < ST.best.t) ST.best = { t, drv: c.tm[2], team: c.tm[0], lap: c.lap };
      ST.laps.push({ t, c: c.tm[1] });
      if (ST.laps.length > 24) ST.laps.shift();
    }
    if (c.finPos === undefined && ((phase === 'race' && c.lap >= RACE_LAPS + 1) || phase === 'finish')) {
      if (phase === 'race') phase = 'finish';
      c.finPos = finOrder.length;
      finOrder.push(c);
      c.cool = true; c.wantPit = false;
      c.stopS = TL - SLOT_S[c.finPos];
      c.slotLat = SLOT_L(c.finPos);
    } else if (!c.cool && c.lapsSince >= c.stint && c.lap <= RACE_LAPS - 3) {
      c.wantPit = true;
    }
    if (c.lap > RACE_LAPS - 3) c.wantPit = false;
  }

  const pp2 = { x: 0, z: 0 };
  function pitXZ(c: F1Car, u: number, o: { x: number; z: number }) {
    const f = clamp(u / PD, 0, PN - 1e-6), i = Math.floor(f), w = f - i;
    let x = pxA[i] + (pxA[i + 1] - pxA[i]) * w, z = pzA[i] + (pzA[i + 1] - pzA[i]) * w;
    if (c.bx !== undefined) {
      const a = ss((x - (c.bx - 8)) / 5.5), b = ss((x - (c.bx + 0.3)) / 3.8);
      z -= 5 * a * (1 - b);
    }
    if (u < 14) {
      const k = 1 - u / 14;
      x += c.offx * k; z += c.offz * k;
    }
    o.x = x; o.z = z;
  }

  function trackStep(c: F1Car, dt: number) {
    let vt = vprof(c.s) * c.pace, blocked = false;
    const thr = scOn ? 99 : (kAt(c.s) > 0.028 ? 3.6 : 3);
    const dE = ((sE - c.s) % TL + TL) % TL;

    if (c.cool) {
      vt = Math.min(vprof(c.s) * 0.55, 24);
      const dist = ((c.stopS - c.s) % TL + TL) % TL;
      if (finOrder.length === cars.length) {
        if (dist < 60) c.lane = c.slotLat;
        vt = Math.min(vt, Math.sqrt(2 * 7 * Math.max(0, dist - 0.3)) + 0.4);
        if (dist < 0.5 || dist > TL - 3 || (dist < 6 && c.v < 0.8)) {
          c.mode = 'grid'; c.v = 0; c.s = c.stopS; c.lat = c.lane = c.slotLat;
          const q = tp(c.s, c.lat);
          c.g.position.set(q.x, 0, q.z); c.g.rotation.y = q.h;
          return;
        }
      }
    } else if (c.wantPit && dE < 80) {
      vt = Math.min(vt, 13 + dE * 0.4);
    }

    for (const o of cars) {
      if (o === c) continue;
      let ol = o.lat;
      if (o.mode === 'pit') {
        if (!((o.pstate === 'in' && o.u < 26) || (o.pstate === 'out' && o.u > PL - 24))) continue;
        ol = -3.2;
      } else if (o.mode !== 'track' && o.mode !== 'grid') continue;
      const ds = ((o.s - c.s) % TL + TL) % TL;
      if (ds < 70 && Math.abs(ol - c.lat) < thr) {
        const lim = ds > 6.4 ? Math.sqrt(o.v * o.v + 2 * 28 * (ds - 6.4)) : o.v * 0.85;
        if (lim < vt) { vt = lim; if (ds < 28) blocked = true; }
      }
    }

    {
      const cm = cop.mode;
      if (cm === 'lap' || (cm === 'in' && cop.u < 26) || (cm === 'out' && cop.u > PL - 24)) {
        const ds = ((cop.s - c.s) % TL + TL) % TL;
        if (ds < 70 && (scOn || Math.abs(-3.2 - c.lat) < thr)) {
          const lim = ds > 7 ? Math.sqrt(cop.v * cop.v + 2 * 28 * (ds - 7)) : cop.v * 0.85;
          if (lim < vt) { vt = lim; if (ds < 28) blocked = true; }
        }
      }
    }

    c.v += clamp(vt - c.v, -40 * dt, 15 * dt);
    c.hold -= dt;

    if (blocked && c.hold <= 0 && !c.wantPit && !c.cool) {
      for (const Y2 of (c.lane > 0 ? [c.lane - 3.2, c.lane + 3.2] : c.lane < 0 ? [c.lane + 3.2, c.lane - 3.2] : [3.2, -3.2])) {
        if (Y2 > 3.3 || Y2 < -3.3) continue;
        if (laneFree(c, Y2)) { c.lane = Y2; c.hold = 3.5; break; }
      }
    } else if (!blocked && c.hold <= 0 && c.lane !== 0 && !c.wantPit && !c.cool && Math.random() < dt * 0.35 && laneFree(c, 0)) {
      c.lane = 0; c.hold = 2.5;
    }

    if (!c.wantPit && !c.cool && c.lane < -3 && dE < 130 && laneFree(c, 0)) {
      c.lane = 0; c.hold = 2;
    }
    if (c.wantPit && dE < 110 && c.lane > -3 && laneFree(c, c.lane - 3.2)) {
      c.lane -= 3.2; c.hold = 2;
    }
    if (scOn && !c.cool) c.lane = 0;
    c.lat += clamp(c.lane - c.lat, -3 * dt, 3 * dt);

    if (c.wantPit && dE <= c.v * dt + 0.1 && Math.abs(c.lat + 3.2) < 0.6 && pitOK()) {
      const q = tp(c.s, c.lat), a = pps[0];
      c.mode = 'pit'; c.u = 0; c.pstate = 'in'; c.wantPit = false;
      c.bx = garages[c.i].bx; c.uBox = ubFor(c.bx);
      c.offx = q.x - a.x; c.offz = q.z - a.z;
      c.pitLap = 2; c.swapped = false;
      return;
    }

    c.s += c.v * dt;
    if (c.s >= TL) c.s -= TL;
    const q = tp(c.s, c.lat);
    c.g.position.set(q.x, 0, q.z); c.g.rotation.y = q.h;
  }

  function pitStep(c: F1Car, dt: number) {
    let vt = PV;
    for (const o of cars) {
      if (o === c || o.mode !== 'pit' || o.pstate === 'stop') continue;
      const du = o.u - c.u;
      if (du > 0 && du < 10) {
        const lim = o.v + (du - 6.8) * 1.6;
        if (lim < vt) vt = Math.max(0, lim);
      }
    }
    if (c.pstate === 'in') {
      const rem = c.uBox - c.u;
      if (rem < 16) c.crewIn = true;
      vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 16 * rem)) + (rem > 0.5 ? 0.8 : 0));
      if (rem < 0.35 && c.v < 1.6) {
        c.u = c.uBox; c.v = 0; c.pstate = 'stop'; c.tt = 0; c.dur = 2 + Math.random() * 1.2;
      }
    } else if (c.pstate === 'stop') {
      c.v = 0; c.tt += dt;
      if (!c.swapped && c.tt > c.dur * 0.5) {
        c.swapped = true;
        c.comp = (c.comp + 1 + Math.floor(Math.random() * 2)) % 3;
        c.rm.color.setHex(COMP[c.comp].c);
      }
      c.lift = 0.34 * ss(c.tt / 0.4) * (1 - ss((c.tt - (c.dur - 0.4)) / 0.4));
      if (c.tt >= c.dur && !cars.some(o => o !== c && o.mode === 'pit' && o.pstate !== 'stop' && Math.abs(o.u - c.uBox) < 13)) {
        c.pstate = 'out'; c.crewIn = false; c.lift = 0; c.stops++;
        ST.stopN++; ST.stops.push(c.dur);
        if (ST.stops.length > 24) ST.stops.shift();
        c.lapsSince = 0; c.stint = 3 + Math.floor(rnd() * 3);
      }
    } else if (c.u > PL - 31 && c.u < PL - 26 && !mergeClear()) {
      vt = 0;
    } else if (c.u >= PL - 0.1) {
      if (mergeClear()) {
        c.mode = 'track'; c.s = sX; c.lat = -3.2; c.lane = -3.2; c.hold = 3;
        c.v = Math.max(c.v, PV); c.sPrev = c.s;
        return;
      } else {
        vt = 0;
      }
    }

    if (c.pstate !== 'stop') {
      c.v += clamp(vt - c.v, -40 * dt, 14 * dt);
      c.u = Math.min(PL, c.u + c.v * dt);
    }
    c.s = (sE + c.u / PL * dS) % TL;
    pitXZ(c, c.u, pp2);
    const x = pp2.x, z = pp2.z;
    pitXZ(c, c.u + 0.7, pp2);
    c.g.position.set(x, c.lift, z);
    c.g.rotation.y = Math.atan2(-(pp2.z - z), pp2.x - x);
  }

  // ---- safety (police) car
  const copBay = { x: -53, z: -13.3 };
  {
    box(6, 0.02, 2.8, 0x1f4fe0, copBay.x, 0.075, copBay.z, false, G);
    [-1.4, 1.4].forEach(dz => [-2.8, 2.8].forEach(dx => box(0.16, 2.8, 0.16, K.wall, copBay.x + dx, 1.4, copBay.z + dz, false, G)));
    box(6.4, 0.2, 3.4, K.white, copBay.x, 2.85, copBay.z, true, G);
    const sg2 = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.12), bas(0x2f6bff));
    sg2.position.set(copBay.x, 2.7, copBay.z + 1.6); G.add(sg2);
  }

  function makeCop() {
    const g = new THREE.Group();
    const P = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => box(w, h, d, c, x, y, z, true, g);
    P(4.2, 0.7, 1.7, 0xf4f6ff, 0, 0.7, 0);
    P(4.22, 0.22, 1.72, 0x1f4fe0, 0, 0.62, 0);
    P(2, 0.6, 1.55, 0xf4f6ff, -0.15, 1.3, 0);
    P(1.8, 0.34, 1.58, 0x1a2238, -0.15, 1.32, 0);
    const lr = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const lb = new THREE.MeshBasicMaterial({ color: 0x2a6bff });
    [[lr, 0.42], [lb, -0.42]].forEach(([m, z]) => {
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.7), m as THREE.Material);
      bb.position.set(-0.15, 1.72, z as number); g.add(bb);
    });
    const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12);
    [[1.3, 0.78], [1.3, -0.78], [-1.3, 0.78], [-1.3, -0.78]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x151a2b));
      w.rotation.x = Math.PI / 2; w.position.set(x, 0.38, z); w.castShadow = true; g.add(w);
    });
    g.scale.setScalar(1.15); G.add(g);
    g.userData = { lr, lb };
    return g;
  }

  const cop = { mode: 'park', g: makeCop(), u: 0, s: 0, v: 0, uPark: 0, offx: 0, offz: 0 };
  for (let i = 0; i <= PN; i++) {
    if (pxA[i] >= copBay.x - 0.5) { cop.uPark = i * PD; break; }
  }

  const cb = { x: 0, z: 0 }, cb2 = { x: 0, z: 0 };
  function pitBase(u: number, o: { x: number; z: number }) {
    const f = clamp(u / PD, 0, PN - 1e-6), i = Math.floor(f), w = f - i;
    o.x = pxA[i] + (pxA[i + 1] - pxA[i]) * w;
    o.z = pzA[i] + (pzA[i + 1] - pzA[i]) * w;
  }
  function copPose(u: number): [number, number] {
    pitBase(u, cb);
    let x = cb.x, z = cb.z;
    if (cop.mode === 'out') {
      const k = clamp(1 - (u - cop.uPark) / 10);
      x += cop.offx * k; z += cop.offz * k;
    } else if (cop.mode === 'in') {
      if (u < 14) {
        const k = 1 - u / 14;
        x += cop.offx * k; z += cop.offz * k;
      }
      const w = ss((u - (cop.uPark - 10)) / 10);
      pitBase(cop.uPark, cb2);
      x += (copBay.x - cb2.x) * w; z += (copBay.z - cb2.z) * w;
    }
    return [x, z];
  }
  function copPlace() {
    const p1 = copPose(cop.u), p2 = copPose(cop.u + 0.7);
    cop.g.position.set(p1[0], 0, p1[1]);
    cop.g.rotation.y = Math.atan2(-(p2[1] - p1[1]), p2[0] - p1[0]);
  }
  function copStep(dt: number, now: number) {
    const ud = cop.g.userData, fl = Math.floor(now * 4) % 2;
    ud.lr.color.setHex(fl ? 0xff2a2a : 0x2a0a0a);
    ud.lb.color.setHex(fl ? 0x0a1a3a : 0x2a6bff);
    if (cop.mode === 'park') {
      const lead = cars.reduce((a, c) => (c.lap * TL + c.s > a.lap * TL + a.s ? c : a), cars[0]);
      if (phase === 'race' && !scDone && lead.lap === 4 && !cars.some(c => c.mode === 'pit')) {
        const dB = ((sX - lead.s) % TL + TL) % TL;
        if (dB < 560 && dB > 150) {
          scDone = true; cop.mode = 'out'; cop.u = cop.uPark; cop.v = 0;
          pitBase(cop.uPark, cb);
          cop.offx = copBay.x - cb.x; cop.offz = copBay.z - cb.z;
        }
      }
      cop.g.position.set(copBay.x, 0, copBay.z);
      cop.g.rotation.y = 0;
      return;
    }
    if (cop.mode === 'out') {
      cop.v += clamp(14 - cop.v, -40 * dt, 8 * dt);
      cop.u = Math.min(PL, cop.u + cop.v * dt);
      cop.s = (sE + cop.u / PL * dS) % TL;
      if (cop.u >= PL - 0.1) {
        let free = true;
        for (const o of cars) {
          if (o.mode !== 'track') continue;
          const ds = ((((o.s - sX) % TL) + TL + TL / 2) % TL) - TL / 2;
          if (Math.abs(o.lat + 3.2) < 3 && ds > -8 && ds < 16) free = false;
        }
        if (free) {
          cop.mode = 'lap'; cop.s = sX; cop.v = Math.max(cop.v, 12); scOn = true;
        } else {
          cop.v = 0;
        }
      } else {
        copPlace();
        return;
      }
    }
    if (cop.mode === 'lap') {
      cop.v += clamp(24 - cop.v, -20 * dt, 8 * dt);
      const dE = ((sE - cop.s) % TL + TL) % TL;
      if (dE <= cop.v * dt + 0.1) {
        const q = tp(cop.s, -3.2), a = pps[0];
        cop.mode = 'in'; cop.u = 0; cop.offx = q.x - a.x; cop.offz = q.z - a.z; scOn = false;
      } else {
        cop.s += cop.v * dt;
        if (cop.s >= TL) cop.s -= TL;
        const q = tp(cop.s, -3.2);
        cop.g.position.set(q.x, 0, q.z); cop.g.rotation.y = q.h;
        return;
      }
    }
    if (cop.mode === 'in') {
      const rem = cop.uPark - cop.u;
      cop.v += clamp(Math.min(12, Math.sqrt(2 * 8 * Math.max(0, rem)) + 0.4) - cop.v, -30 * dt, 6 * dt);
      cop.u = Math.min(cop.uPark, cop.u + cop.v * dt);
      cop.s = (sE + cop.u / PL * dS) % TL;
      if (cop.uPark - cop.u < 0.15) { cop.mode = 'park'; cop.v = 0; }
      copPlace();
    }
  }

  function timing(): F1Car[] {
    const order = cars.slice().sort((a, b) => {
      const fa = a.finPos, fb = b.finPos;
      if (fa !== undefined && fb !== undefined) return fa - fb;
      if (fa !== undefined) return -1;
      if (fb !== undefined) return 1;
      if (phase === 'grid' || phase === 'lights') return a.slot - b.slot;
      return (b.lap * TL + b.s) - (a.lap * TL + a.s);
    });
    order.forEach((c, p) => {
      c.pos = p;
    });
    return order;
  }

  function getFstate(): { msg: string; status: 'red' | 'green' | '' } {
    const order = timing();
    const msg = (phase === 'race' && (cop.mode === 'lap' || cop.mode === 'out'))
      ? 'Safety car deployed · follow the leader'
      : phase === 'grid'
      ? 'Cars on the grid'
      : phase === 'lights'
      ? (lightsN ? 'Start lights ' + '● '.repeat(lightsN) + '○ '.repeat(5 - lightsN) : 'Start lights')
      : phase === 'race'
      ? (greenT < 3.5 ? 'GREEN · racing' : 'Lap ' + clamp(order[0].lap, 1, RACE_LAPS) + ' of ' + RACE_LAPS)
      : phase === 'finish'
      ? 'Chequered flag · cool-down lap'
      : 'Race over · back on the grid';

    const status: 'red' | 'green' | '' = phase === 'lights' ? 'red' : (phase === 'race' && greenT < 3.5) ? 'green' : '';
    return { msg, status };
  }

  function step(dt: number, now: number) {
    rt += dt;
    phaseStep(dt);
    copStep(dt, now);
    for (const c of cars) {
      if (c.mode === 'track') trackStep(c, dt);
      else if (c.mode === 'pit') pitStep(c, dt);
      if (c.sPrev > TL * 0.8 && c.s < TL * 0.2) lapDone(c);
      c.sPrev = c.s;
      for (const w of c.wheels) w[0].rotation.z -= c.v * dt / w[1];
    }
    crew.forEach((cr, i) => {
      const c = cars[i], a = c.crewIn, k = Math.min(1, dt * 5);
      cr.forEach((p, j) => {
        const tx = a ? p.wx : p.ix, tz = a ? p.wz : p.iz;
        p.g.position.x += (tx - p.g.position.x) * k;
        p.g.position.z += (tz - p.g.position.z) * k;
        p.g.position.y = a && c.pstate === 'stop' ? Math.abs(Math.sin(now * 12 + j)) * 0.05 : 0;
        p.g.rotation.y = a ? (j < 2 ? -Math.PI / 2 : j < 4 ? Math.PI / 2 : Math.PI) : 0;
      });
    });

    const sc = cars[fsel]?.g.position;
    if (sc) {
      fring.position.set(sc.x, 0.12, sc.z);
      fring.scale.setScalar(1 + Math.sin(now * 4) * 0.05);
    }
    flag.rotation.y = Math.sin(now * 2.2) * 0.18;
    flag.rotation.z = Math.sin(now * 3) * 0.03;
  }

  toGrid(cars.slice());
  setLights(0, false);

  return {
    renderer: R,
    scene: S,
    camera: cam,
    cars,
    cop,
    ST,
    TL,
    sE,
    sX,
    PL,
    step,
    timing,
    getRt: () => rt,
    getPhase: () => phase,
    getScOn: () => scOn,
    getGreenT: () => greenT,
    getLightsN: () => lightsN,
    fring,
    getFstate,
    select: (i: number) => { fsel = i; },
    getSel: () => fsel,
  };
}
