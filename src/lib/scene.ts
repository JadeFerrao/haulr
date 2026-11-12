import * as THREE from 'three';
import {
  buildColors, mat, bas, box, cyl, rnd, resetSeed, smooth,
  loopPts, at, PB, poseOn,
  type LoopPath, type SignalApproach, type PathBuilder,
} from './threeHelpers';

export interface FleetVehicle {
  id: string; route: string; lp: LoopPath; d: number;
  m: THREE.Group; p: number; delayed: boolean; kmh: number;
  spd: number; ln?: number; t0?: number;
  tag?: HTMLButtonElement; row?: HTMLButtonElement;
  st?: HTMLElement; eta?: HTMLElement; bar?: HTMLElement;
}

export interface WH { u: number; g: number }
export interface Drone {
  pad: Pad; to: Pad | null; t: number; state: 'park' | 'fly';
  dwell: number; cruise: number; v: number; yaw: number;
  m: THREE.Group; t0?: number; late?: boolean; want?: number;
}
export interface Pad { x: number; y: number; z: number; owner: Drone | null; node: { x: number; y: number; z: number; name: string } }
export interface BeltItem { on: boolean; x: number; z: number; zEnd: number; wh: number }
export interface Belt { x: number; z0: number; zEnd: number; kind: string; ph: number; wh: number; timer: number }
export interface BeltFork {
  m: THREE.Group; fk: THREE.Group; crate: THREE.Mesh;
  cx: number; wh: number; zp: number; zd: number; z: number; zEnd: number;
  ph: string; t: number; fy: number; carry: boolean;
}
export interface Forklift {
  m: THREE.Group; fk: THREE.Group; crate: THREE.Mesh;
  xa: number; xb: number; z: number; fs: number; x: number;
  ph: string; next: string; t: number; carry: boolean; fy: number; px: number;
}
export interface Bay {
  x: number; im: THREE.MeshBasicMaterial; busy: boolean;
  ph: number; van: StationVan | null; res: StationVan | null;
  exit: PathBuilder; enter: PathBuilder; de: number;
}
export interface Station { cx: number; cz: number; i: number; j: number; bays: Bay[]; lp: LoopPath; spd: number; dm: number; tex: number; vans: StationVan[]; lock: StationVan | null }
export interface StationVan {
  m: THREE.Group; state: string; bay: Bay | null; timer: number;
  d: number; lap: number; s: number; path: PathBuilder | null;
}
export interface Ship { lane: number; dir: number; berth?: number; start: number; v: number; p: number; m: THREE.Group; state: string; timer: number; turn: number; off: number; docks?: number }
export interface Trolley { g: THREE.Group; x0: number; amp: number; sp: number; ph: number }

export interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  fleet: FleetVehicle[];
  drones: Drone[];
  ships: Ship[];
  stations: Station[];
  forklifts: Forklift[];
  bforks: BeltFork[];
  belts: Belt[];
  items: BeltItem[];
  itemM: THREE.InstancedMesh;
  trolleys: Trolley[];
  radars: THREE.Mesh[];
  chargers: Bay[];
  beltTex: THREE.CanvasTexture;
  WH: WH[];
  padList: Pad[];
  nodes: { x: number; y: number; z: number; name: string }[];
  ring: THREE.Mesh;
  waves: { x: number; z: number; s: number }[];
  wm: THREE.InstancedMesh;
  sigAps: SignalApproach[];
  lamps: THREE.InstancedMesh[];
  LC: THREE.Color[][];
  beaconM: THREE.MeshBasicMaterial;
  pvN: number;
  M: SimMetrics;
  simT: number;
}

export interface SimMetrics {
  pD: number; pL: number; dD: number; dL: number;
  fl: { dur: number; late: boolean }[];
  rt: number; re: number; win: number[];
  kwh: number; peak: number;
  pr: number[]; pl: number[]; sol: number[]; dem: number[]; acc: number[];
}

const RX = [-72, -48, -24, 0, 24, 48, 72];
const RZ = [-60, -36, -12, 12, 36, 60];
const SLA_EXTRA = 17;

export function buildScene(canvas: HTMLCanvasElement): SceneState {
  resetSeed();

  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const C = buildColors(dark);
  const dd = new THREE.Object3D();

  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFSoftShadowMap;

  const S = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 500);

  S.add(new THREE.HemisphereLight(dark ? 0x8fa8ff : 0xffffff, dark ? 0x0c1426 : 0xa9bfe3, dark ? 0.9 : 0.62));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 0.6 : 0.5);
  sun.position.set(-50, 80, 35); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(innerWidth < 900 ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 300 });
  sun.shadow.radius = 4; S.add(sun);

  // Ground, water, roads
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(C.ground));
  gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; S.add(gr);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(320, 760),
    new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.35, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-238, 0.04, 0); S.add(water);

  box(4.2, 0.3, 124, C.slab, -76, 0.15, 0, false, S);
  RZ.forEach(z => box(156, 0.06, 3.6, C.road, 6, 0.03, z, false, S));
  RX.forEach(x => box(3.6, 0.06, 134, C.road, x, 0.03, 5, false, S));

  const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.07, 0.14),
    new THREE.MeshStandardMaterial({ color: C.dash, roughness: 0.9 }), 800);
  let dn = 0;
  RZ.forEach(z => { for (let x = -70; x <= 82; x += 3) { dd.position.set(x, 0.07, z); dd.rotation.y = 0; dd.updateMatrix(); dm.setMatrixAt(dn++, dd.matrix); } });
  RX.forEach(x => { for (let z = -60; z <= 70; z += 3) { dd.position.set(x, 0.07, z); dd.rotation.y = Math.PI / 2; dd.updateMatrix(); dm.setMatrixAt(dn++, dd.matrix); } });
  dm.count = dn; S.add(dm); dd.rotation.y = 0;

  // Trees
  const tm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: C.tree, roughness: 0.85 }), 420);
  tm.castShadow = true; tm.receiveShadow = true; let tn = 0;
  function tree(x: number, z: number, s = 1) {
    if (tn >= 420) return;
    dd.position.set(x, 1.2 * s + 0.2, z); dd.scale.set(s, s, s); dd.updateMatrix();
    tm.setMatrixAt(tn++, dd.matrix); dd.scale.set(1, 1, 1);
  }
  for (let k = 0; k < 360; k++) {
    const x = -79 + rnd() * 250, z = (rnd() - 0.5) * 320;
    if (x < 88 && Math.abs(z) < 68) continue;
    tree(x, z, 0.7 + rnd() * 0.9);
  }

  // Containers
  const cGeo = new THREE.BoxGeometry(2.2, 1, 0.95);
  const cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const ccols = [C.navy, C.blue, 0x3b4a73, C.warn].map(c => new THREE.Color(c));
  const cm = new THREE.InstancedMesh(cGeo, cMat, 1800);
  cm.castShadow = true; cm.receiveShadow = true; let cn = 0;
  function cont(x: number, y: number, z: number, k: number) {
    if (cn >= 1800) return;
    dd.position.set(x, y, z); dd.updateMatrix();
    cm.setMatrixAt(cn, dd.matrix); cm.setColorAt(cn, ccols[k % 4]); cn++;
  }
  function stack(x: number, z: number, n: number, m: number) {
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const k = (i * 3 + j) % 3; cont(x + i * 2.35, 0.7, z + j * 1.1, k);
      if ((i + j) % 2 === 0) cont(x + i * 2.35, 1.75, z + j * 1.1, (k + 1 + (i % 2 ? 2 : 0)) % 4);
    }
  }

  const nodes: SceneState['nodes'] = [];
  const padList: Pad[] = [];
  const chargers: Bay[] = [];
  const trolleys: Trolley[] = [];
  const radars: THREE.Mesh[] = [];
  const forklifts: Forklift[] = [];
  const stations: Station[] = [];
  const svans: StationVan[] = [];
  const belts: Belt[] = [];
  const bforks: BeltFork[] = [];
  const items: BeltItem[] = [];
  const sigAps: SignalApproach[] = [];
  const WH: WH[] = [];
  let pvN = 0, whn = 0;
  const beaconM = bas(0xff5a36);

  function addPads(nd: SceneState['nodes'][0], xs: number[], z: number, y = 0.32) {
    nd && xs.forEach(x => { const p: Pad = { x, y, z, owner: null, node: nd }; padList.push(p); });
  }

  function warehouse(x: number, z: number, w: number, h: number, d: number) {
    box(w, h, d, C.bld, x, h / 2 + 0.2, z, true, S);
    box(w + 0.3, 0.25, d + 0.3, C.roof, x, h + 0.32, z, true, S);
    box(w * 0.28, h * 0.6, 0.2, C.navy, x, h * 0.3 + 0.2, z + d / 2 + 0.05, false, S);
  }

  function pv(x: number, y: number, z: number, t: number) {
    pvN++;
    const m = box(2.8, 0.1, 1.9, C.panel, x, y, z, true, S);
    m.rotation.x = -t; return m;
  }
  function roofPanels(cx: number, cz: number, y: number, cols: number) {
    for (let i = 0; i < cols; i++) for (let r = 0; r < 2; r++) pv(cx - (cols - 1) * 1.55 + i * 3.1, y, cz + (r ? 2.3 : -2.3), 0.2);
  }

  function tower(x: number, z: number, h: number) {
    cyl(0.25, 0.75, h, C.mast, x, h / 2, z, 8, S);
    for (let k = 1; k < 4; k++) cyl(1.1 - 0.2 * k, 1.1 - 0.2 * k, 0.12, C.roof, x, h * k / 4, z, 10, S);
    box(1.8, 0.4, 0.4, C.roof, x, h + 0.2, z, true, S);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), beaconM);
    b.position.set(x, h + 0.8, z); S.add(b);
  }

  const corners: [number, number][] = [[1, -1], [-1, -1], [-1, 1], [1, 1]];
  function ring4(cx: number, cz: number, tw: number) {
    corners.forEach(([a, b], k) => {
      const x = cx + a * 8.6, z = cz + b * 8.6;
      if (k === tw) tower(x, z, 14);
      else { tree(x, z, 0.9 + rnd() * 0.4); tree(x - a * 1.3, z - b * 0.4, 0.6); }
    });
  }

  function makeVan(open = false) {
    const g = new THREE.Group();
    if (open) box(0.06, 0.95, 1.15, 0x0b1020, -1.72, 1, 0, false, g);
    box(3, 1.4, 1.5, C.van, -0.2, 1, 0, true, g); box(1, 1.05, 1.5, C.van, 1.8, 0.82, 0, true, g);
    box(0.08, 0.45, 1.25, 0xd7e6ff, 2.32, 1.05, 0, false, g); box(3.02, 0.18, 1.52, C.blue, -0.2, 0.75, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.35, 12);
    [[-1.2, 0.7], [1.5, 0.7], [-1.2, -0.7], [1.5, -0.7]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z); w.castShadow = true; g.add(w);
    });
    g.scale.setScalar(0.85); S.add(g); return g;
  }

  function makeTruck(open = false) {
    const g = new THREE.Group();
    if (open) box(0.06, 1.15, 1.4, 0x0b1020, -3.02, 1.25, 0, false, g);
    box(4.6, 1.6, 1.7, C.blue, -0.7, 1.25, 0, true, g); box(4.62, 0.14, 1.72, 0xffffff, -0.7, 0.55, 0, false, g);
    box(1.5, 1.25, 1.7, C.cab, 2.2, 0.95, 0, true, g); box(0.1, 0.5, 1.4, 0xd7e6ff, 2.98, 1.2, 0, false, g);
    box(7.1, 0.3, 1.2, 0x1b2440, 0.7, 0.38, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12);
    [[-2.4, 0.85], [-1.3, 0.85], [2.3, 0.85], [-2.4, -0.85], [-1.3, -0.85], [2.3, -0.85]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); w.castShadow = true; g.add(w);
    });
    g.scale.setScalar(0.72); S.add(g); return g;
  }

  function makePickup() {
    const g = new THREE.Group();
    box(3.8, 0.6, 1.6, C.warn, 0, 0.7, 0, true, g); box(1.4, 0.85, 1.55, C.warn, 0.55, 1.35, 0, true, g);
    box(0.7, 0.5, 1.5, C.warn, 1.55, 0.95, 0, true, g); box(0.08, 0.45, 1.25, 0xd7e6ff, 1.26, 1.4, 0, false, g);
    [0.72, -0.72].forEach(z => box(1.7, 0.4, 0.08, C.warn, -1.05, 1.15, z, true, g));
    box(0.08, 0.4, 1.5, C.warn, -1.9, 1.15, 0, true, g);
    box(0.8, 0.6, 0.8, C.blue, -1.1, 1.3, 0.28, true, g); box(0.7, 0.5, 0.7, C.navy, -0.6, 1.25, -0.38, true, g);
    const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 12);
    [[-1.2, 0.75], [1.3, 0.75], [-1.2, -0.75], [1.3, -0.75]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.38, z); w.castShadow = true; g.add(w);
    });
    g.scale.setScalar(0.82); S.add(g); return g;
  }

  function makeForklift() {
    const g = new THREE.Group();
    box(1.7, 0.7, 1, C.warn, 0, 0.7, 0, true, g); box(0.6, 0.9, 1, C.navy, -0.8, 0.95, 0, true, g);
    box(0.18, 1.7, 0.9, C.mast, 1, 1.05, 0, false, g);
    [0.48, -0.48].forEach(z => box(0.08, 1, 0.08, C.mast, 0.25, 1.6, z, false, g));
    box(1.2, 0.07, 1.1, C.navy, 0.2, 2.12, 0, false, g);
    const fk = new THREE.Group();
    [0.28, -0.28].forEach(z => box(1.15, 0.07, 0.17, 0x2a3150, 1.55, 0, z, false, fk));
    box(0.1, 0.5, 0.95, C.mast, 1.04, 0.2, 0, false, fk); fk.position.set(0, 0.7, 0); g.add(fk);
    const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10);
    [[0.55, 0.55], [0.55, -0.55], [-0.6, 0.55], [-0.6, -0.55]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, z); w.castShadow = true; g.add(w);
    });
    g.userData.fk = fk; S.add(g); return g;
  }

  function addForklift(xa: number, xb: number, z: number) {
    const m = makeForklift(), fk: THREE.Group = m.userData.fk;
    const fs = Math.sign(xb - xa) || 1, p = 0.1 + rnd() * 0.8, x = xa + (xb - xa) * p;
    const crate = box(0.95, 0.8, 0.95, C.blue, x, 0.5, z, true, S) as unknown as THREE.Mesh;
    forklifts.push({ m, fk, crate, xa, xb, z, fs, x, ph: 'fwd', next: 'rev', t: 0, carry: true, fy: 0.7, px: x });
  }

  // Belt canvas texture
  const BV = 1.3;
  const beltFrame = dark ? 0x35507f : 0x3a4770;
  const beltCan = document.createElement('canvas'); beltCan.width = 32; beltCan.height = 64;
  { const g = beltCan.getContext('2d')!; g.fillStyle = dark ? '#1d2a4a' : '#2a355a'; g.fillRect(0, 0, 32, 64); g.fillStyle = dark ? '#4a67a8' : '#6b7aa8'; g.fillRect(0, 0, 32, 5); g.fillRect(0, 32, 32, 5); }
  const beltTex = new THREE.CanvasTexture(beltCan); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(1, 4.7);
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 });

  function beltAt(x: number, cz: number, kind: string, ph: number, wh: number) {
    const L = 4.7, z0 = cz + 0.5, zc = z0 + L / 2;
    box(1.4, 0.5, L, beltFrame, x, 0.45, zc, true, S);
    [-0.65, 0.65].forEach(d => box(0.1, 0.2, L, C.mast, x + d, 0.8, zc, false, S));
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(1.1, L), beltMat);
    sf.rotation.x = -Math.PI / 2; sf.position.set(x, 0.71, zc); sf.receiveShadow = true; S.add(sf);
    box(1.7, 1.7, 0.12, 0x0b1020, x, 1.05, cz + 5.14, false, S);
    const b: Belt = { x, z0, zEnd: cz + 5.12, kind, ph, wh, timer: Math.random() * 2 };
    belts.push(b); return b;
  }

  function addBeltFork(cx: number, cz: number, zEnd: number, wh: number) {
    const m = makeForklift(), fk: THREE.Group = m.userData.fk;
    const crate = box(0.95, 0.8, 0.95, C.blue, cx, 0.57, cz - 3.45, true, S) as unknown as THREE.Mesh;
    bforks.push({ m, fk, crate, cx, wh, zp: cz - 5, zd: cz - 0.55, z: cz - 5, zEnd, ph: 'pick', t: Math.random() * 0.9, fy: 0.7, carry: false });
  }

  function rmg(cx: number, cz: number, ph: number) {
    [-5.5, 5.5].forEach(x => [-2.2, 2.2].forEach(z => box(0.35, 6, 0.35, C.warn, cx + x, 3.2, cz + z, true, S)));
    [-2.2, 2.2].forEach(z => box(12, 0.5, 0.5, C.warn, cx, 6.3, cz + z, true, S));
    const tr = new THREE.Group();
    box(1.4, 0.6, 5, C.navy, 0, 0, 0, true, tr); box(0.1, 2.6, 0.1, C.mast, 0, -1.5, 0, false, tr); box(2.2, 0.9, 0.9, C.blue, 0, -3, 0, true, tr);
    tr.position.set(cx, 6.7, cz); S.add(tr); trolleys.push({ g: tr, x0: cx, amp: 4, sp: 0.5, ph });
  }

  function sts(z: number, ph: number) {
    [-77.6, -74.6].forEach(x => [-2, 2].forEach(dz => box(0.4, 10, 0.4, C.warn, x, 5, z + dz, true, S)));
    [-2, 2].forEach(dz => box(20, 0.6, 0.6, C.warn, -83, 10.3, z + dz, true, S));
    [-77.6, -74.6].forEach(x => box(0.5, 0.5, 4.6, C.warn, x, 10, z, true, S));
    const tr = new THREE.Group();
    box(1.8, 0.6, 4.6, C.navy, 0, 0, 0, true, tr); box(0.08, 4.6, 0.08, C.mast, 0, -2.5, 0, false, tr); box(0.95, 1, 2.2, C.blue, 0, -5.3, 0, true, tr);
    tr.position.set(-83, 10.3, z); S.add(tr); trolleys.push({ g: tr, x0: -83, amp: 6, sp: 0.4, ph });
  }
  [-37, -30, -23, 23, 30, 37].forEach((z, i) => sts(z, i * 1.3));

  const hubNames = ['Harbor Hub', 'Northgate Hub', 'Midtown Hub', 'East Hub', 'West Hub', 'Eastside Hub', 'Mid-South Hub', 'Southeast Hub', 'South Hub', 'Southgate Hub'];
  const chNames = ['Charge A', 'Charge B', 'Charge C'];
  let hn = 0, chn = 0, yn = 0;

  function hub(cx: number, cz: number, name: string, tw: number) {
    warehouse(cx, cz, 11, 3.2, 7.5); roofPanels(cx, cz, 3.95, 3); box(3, 1.6, 2.4, C.bld, cx + 7.2, 1, cz - 1, true, S);
    const nd = { x: cx, y: 4.3, z: cz, name }; nodes.push(nd);
    addPads(nd, [-4.5, -1.5, 1.5, 4.5].map(d => cx + d), cz + 7.6);
    ring4(cx, cz, tw); addForklift(cx - 3.5, cx + 3.5, cz + 4.8);
  }

  function whCell(cx: number, cz: number) {
    [-5.2, 5.2].forEach(dx => { warehouse(cx + dx, cz - 8.2, 8, 3, 3.6); pv(cx + dx - 1.7, 3.85, cz - 8.2, 0.2); pv(cx + dx + 1.7, 3.85, cz - 8.2, 0.2); });
    warehouse(cx, cz + 7.5, 15, 3.6, 4.6);
    const wi = whn++; WH.push({ u: 0.62 + rnd() * 0.22, g: 0.7 + rnd() * 0.8 });
    const nd = { x: cx, y: 4.4, z: cz + 7.5, name: 'Warehouse ' + (wi + 1) }; nodes.push(nd);
    addPads(nd, [-6, -2, 2, 6].map(d => cx + d), cz + 7.5, 4.17);
    const ph = rnd() * 34;
    beltAt(cx - 5.5, cz, 't', ph, wi); beltAt(cx + 5.5, cz, 'v', ph + 11, wi);
    const bf = beltAt(cx, cz, 'f', 0, wi);
    const tk = makeTruck(true); tk.position.set(cx - 5.5, 0, cz - 1.72); tk.rotation.y = Math.PI / 2;
    const vn = makeVan(true); vn.position.set(cx + 5.5, 0, cz - 1.01); vn.rotation.y = Math.PI / 2;
    addBeltFork(cx, cz, bf.zEnd, wi);
  }

  function main(cx: number, cz: number) {
    warehouse(cx, cz, 15, 4.6, 10); roofPanels(cx, cz, 5.3, 4);
    cyl(0.9, 1.1, 9, C.bld, cx - 8, 4.7, cz + 6.5, 10, S); box(3, 1.2, 3, C.glass, cx - 8, 9.6, cz + 6.5, true, S);
    radars.push(box(2.6, 0.15, 0.3, C.navy, cx - 8, 10.4, cz + 6.5, true, S) as unknown as THREE.Mesh);
    const nd = { x: cx, y: 5.6, z: cz, name: 'Central Hub' }; nodes.push(nd);
    addPads(nd, [-4.5, -1.5, 1.5, 4.5].map(d => cx + d), cz + 8.6);
    tree(cx + 8.6, cz - 8.6, 1); tree(cx + 8.6, cz - 7, 0.6); addForklift(cx - 5, cx + 5, cz + 6.2);
  }

  function solar(cx: number, cz: number) {
    for (let i = 0; i < 5; i++) for (let r = 0; r < 3; r++) {
      const x = cx - 6.8 + i * 3.4, z = cz - 7 + r * 3.2;
      box(0.15, 0.9, 0.15, C.mast, x, 0.65, z, true, S); pv(x, 1.1, z, 0.4);
    }
    stack(cx - 4, cz + 5.5, 3, 1); box(2.6, 2, 2.6, C.bld, cx + 6.5, 1.2, cz + 6, true, S);
    cyl(0.12, 0.12, 3, C.mast, cx + 6.5, 3.5, cz + 6, 6, S);
  }

  function dOf(lp: LoopPath, x: number, z: number) {
    let best = 0, bd = 1e9;
    for (let d = 0; d < lp.T; d += 0.05) { const q = at(lp, d), e = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (e < bd) { bd = e; best = d; } }
    return best;
  }

  function charge(cx: number, cz: number, name: string, ci: number, cj: number) {
    box(13, 0.35, 6.4, C.roof, cx, 3.4, cz, true, S);
    for (let i = 0; i < 3; i++) pv(cx - 3.4 + i * 3.4, 3.7, cz, 0.15);
    [-5.5, 0, 5.5].forEach(x => [-2.8, 2.8].forEach(z => box(0.3, 3.2, 0.3, C.mast, cx + x, 1.8, cz + z, true, S)));
    box(16, 0.03, 2.6, C.road, cx - 1, 0.215, cz + 5.9, false, S);
    const st: Station = { cx, cz, i: ci, j: cj, bays: [], lock: null, vans: [], lp: null as unknown as LoopPath, spd: 0, dm: 0, tex: 0 };
    for (let b = 0; b < 6; b++) {
      const x = cx - 4.5 + 1.8 * b;
      box(0.5, 1.5, 0.5, C.bld, x, 0.95, cz - 1.8, true, S); box(1.5, 0.03, 3, C.road, x, 0.215, cz + 0.9, false, S);
      const im = bas(0x2fe08a);
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.08), im); ind.position.set(x, 1.4, cz - 1.5); S.add(ind);
      const bay: Bay = { x, im, busy: false, ph: rnd() * 6, van: null, res: null, exit: null as unknown as PathBuilder, enter: null as unknown as PathBuilder, de: 0 };
      st.bays.push(bay); chargers.push(bay);
    }
    box(3.4, 2.2, 2.6, C.bld, cx - 1, 1.3, cz - 7, true, S); box(1.5, 1.5, 0.2, 0x2fe08a, cx + 6, 4.2, cz - 7.5, false, S);
    box(0.3, 3.5, 0.3, C.mast, cx + 6, 1.8, cz - 7.5, true, S);
    const nd = { x: cx, y: 4.2, z: cz, name }; nodes.push(nd);
    addPads(nd, [-8.4, -5.3, 2.8, 8.9].map(d => cx + d), cz - 7);
    stations.push(st);
  }

  function yard(cx: number, cz: number, n: number) {
    [-8.8, -1.2, 8].forEach(z => { stack(cx - 8.5, cz + z, 4, 2); stack(cx + 1.2, cz + z, 3, 2); });
    rmg(cx, cz - 4.4, n); rmg(cx, cz + 4.6, n + 2);
  }

  function park(cx: number, cz: number) {
    tower(cx + 3, cz - 3, 19); tower(cx - 5, cz + 4, 14);
    for (let k = 0; k < 30; k++) {
      const x = cx + (rnd() - 0.5) * 18.4, z = cz + (rnd() - 0.5) * 18.4;
      if (Math.hypot(x - cx - 3, z - cz + 3) < 2 || Math.hypot(x - cx + 5, z - cz - 4) < 2) continue;
      tree(x, z, 0.7 + rnd() * 0.9);
    }
  }

  const layout = [
    ['yard', 'hub', 'warehouse', 'hub', 'solar', 'park'],
    ['yard', 'warehouse', 'hub', 'charge', 'warehouse', 'hub'],
    ['yard', 'hub', 'warehouse', 'main', 'hub', 'solar'],
    ['yard', 'solar', 'hub', 'warehouse', 'charge', 'hub'],
    ['yard', 'warehouse', 'charge', 'hub', 'park', 'hub'],
  ];

  layout.forEach((row, j) => row.forEach((t, i) => {
    const cx = (RX[i] + RX[i + 1]) / 2, cz = (RZ[j] + RZ[j + 1]) / 2;
    box(20.4, 0.2, 20.4, C.slab, cx, 0.1, cz, false, S);
    if (t === 'hub') hub(cx, cz, hubNames[hn++], (i + j) % 4);
    else if (t === 'main') main(cx, cz);
    else if (t === 'solar') solar(cx, cz);
    else if (t === 'charge') charge(cx, cz, chNames[chn++], i, j);
    else if (t === 'yard') yard(cx, cz, yn++ * 1.7);
    else if (t === 'warehouse') whCell(cx, cz);
    else park(cx, cz);
  }));

  cm.count = cn; S.add(cm); tm.count = tn; S.add(tm);

  const padM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.25, 1.25, 0.14, 24), new THREE.MeshStandardMaterial({ color: C.roof, roughness: 0.8 }), padList.length);
  const padR = new THREE.InstancedMesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: C.blue, side: THREE.DoubleSide }), padList.length);
  padList.forEach((p, i) => {
    dd.rotation.set(0, 0, 0); dd.position.set(p.x, p.y - 0.12, p.z); dd.updateMatrix(); padM.setMatrixAt(i, dd.matrix);
    dd.rotation.set(-Math.PI / 2, 0, 0); dd.position.set(p.x, p.y - 0.03, p.z); dd.updateMatrix(); padR.setMatrixAt(i, dd.matrix);
  });
  dd.rotation.set(0, 0, 0); padM.receiveShadow = true; S.add(padM); S.add(padR);

  const itemM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), cMat, 300);
  itemM.castShadow = true; itemM.frustumCulled = false;
  for (let k = 0; k < 300; k++) {
    items.push({ on: false, x: 0, z: 0, zEnd: 0, wh: 0 });
    itemM.setColorAt(k, ccols[k % 4]); dd.position.set(0, -20, 0); dd.updateMatrix(); itemM.setMatrixAt(k, dd.matrix);
  }
  S.add(itemM);

  function spawnItem(x: number, z: number, zEnd: number, wh: number) {
    const k = items.findIndex(q => !q.on); if (k < 0) return;
    const it = items[k]; it.on = true; it.x = x; it.z = z; it.zEnd = zEnd; it.wh = wh;
    itemM.setColorAt(k, ccols[Math.floor(Math.random() * 4)]); itemM.instanceColor!.needsUpdate = true;
  }
  belts.forEach(b => { if (b.kind !== 'f') for (let z = b.z0 + 0.9; z < b.zEnd - 0.5; z += 2.9) spawnItem(b.x, z, b.zEnd, b.wh); });

  // Ships
  const hs = new THREE.Shape();
  [[-12, -2.8], [8, -2.8], [12.5, -0.8], [12.5, 0.8], [8, 2.8], [-12, 2.8]].forEach(([x, y], i) => i ? hs.lineTo(x, y) : hs.moveTo(x, y));
  const hullGeo = new THREE.ExtrudeGeometry(hs, { depth: 2.2, bevelEnabled: false });
  function makeShip(k: number) {
    const g = new THREE.Group();
    const h = new THREE.Mesh(hullGeo, mat(k % 2 ? C.navy : 0x34406a)); h.rotation.x = -Math.PI / 2; h.castShadow = true; g.add(h);
    box(3.2, 4.2, 4.6, C.van, -9.4, 4.3, 0, true, g); box(0.1, 0.7, 4, C.glass, -7.78, 5.6, 0, false, g);
    cyl(0.8, 0.8, 2, C.warn, -10.4, 7.4, 0, 10, g); box(0.2, 3, 0.2, C.mast, -9.4, 8.6, 0, false, g);
    const im = new THREE.InstancedMesh(cGeo, cMat, 96); let n = 0;
    for (let b = 0; b < 6; b++) for (let c = 0; c < 4; c++) {
      const hh = 1 + Math.floor(rnd() * 4);
      for (let y = 0; y < hh; y++) { dd.position.set(-5.6 + b * 2.3, 2.7 + y, -1.6 + c * 1.07); dd.updateMatrix(); im.setMatrixAt(n, dd.matrix); im.setColorAt(n, ccols[(b + c + y + k) % 4]); n++; }
    }
    im.count = n; im.castShadow = true; g.add(im); S.add(g); return g;
  }

  const yawOf = (d: number) => d > 0 ? -Math.PI / 2 : Math.PI / 2;
  const ships: Ship[] = [
    { lane: -82, dir: 1, berth: -30, start: -150, v: 6, docks: 1 },
    { lane: -82, dir: -1, berth: 30, start: 150, v: 6, docks: 1 },
    { lane: -118, dir: 1, v: 3.2, start: -150 },
    { lane: -134, dir: -1, v: 2.6, start: 150 },
    { lane: -150, dir: 1, v: 2.1, start: -40 },
  ].map((s, i) => Object.assign(s, { p: s.start, m: makeShip(i), state: 'in', timer: 0, turn: 0, off: 0 }));
  ships[0].p = -72; ships[1].p = 30; ships[1].state = 'dock'; ships[1].timer = 14;
  ships[2].p = -45; ships[3].p = 50; ships[4].p = 15;

  const waves = Array.from({ length: 80 }, () => ({ x: -84 - rnd() * 110, z: (rnd() - 0.5) * 250, s: 0.5 + rnd() * 0.8 }));
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: C.foam, transparent: true, opacity: 0.45 }), 80);
  wm.frustumCulled = false; S.add(wm);

  // Traffic loop paths
  const o = 0.9, lpCache: Record<string, LoopPath> = {}, occ: Record<string, Record<number, number>> = {};
  function L(i: number, j: number, v: number): LoopPath {
    const k = i + ',' + j;
    return lpCache[k] ?? (lpCache[k] = Object.assign(loopPts(RX[i] + o, RX[i + 1] - o, RZ[j] + o, RZ[j + 1] - o, 3.2), { v }));
  }

  const defs: [string, string, number, number, number, number][] = [
    ['HX-204', 'Central Hub → East Hub', 3, 2, 4.6, 0], ['HX-279', 'South Hub → Central Hub', 3, 2, 4.6, 0.5],
    ['HX-217', 'Harbor Hub → Midtown Hub', 1, 0, 4, 0], ['HX-231', 'Charge A → Northgate Hub', 2, 2, 3.8, 0],
    ['HX-248', 'East Hub → Eastside Hub', 5, 1, 4.2, 0], ['HX-266', 'Northgate Hub → Quay Yard 2', 3, 0, 2.8, 0],
    ['HX-252', 'West Hub → Central Hub', 1, 2, 4.4, 0], ['HX-293', 'Southeast Hub → South Hub', 5, 3, 3.8, 0],
    ['HX-301', 'Quay Yard 1 → Harbor Hub', 0, 0, 4.3, 0], ['HX-318', 'Quay Yard 4 → West Hub', 0, 3, 3.7, 0],
    ['HX-326', 'Midtown Hub → Mid-South Hub', 2, 1, 4.1, 0], ['HX-340', 'Southgate Hub → Charge C', 5, 4, 3.9, 0],
  ];

  const fleet: FleetVehicle[] = defs.map((f, i) => {
    const lp = L(f[2], f[3], f[4]);
    (occ[f[2] + ',' + f[3]] ??= {})[f[5]] = 1;
    return { id: f[0], route: f[1], lp, d: f[5] * lp.T, m: makeTruck(), p: 6, delayed: i === 5, kmh: 50, spd: lp.v * 1.6 };
  });

  const mk = [makeTruck, makeVan, makePickup, makeVan, makePickup] as const;
  const fleetVans: FleetVehicle[] = [];
  layout.forEach((row, j) => row.forEach((t, i) => {
    if (t === 'charge') return;
    const k = i + ',' + j, lp = L(i, j, 3.4 + ((i * 7 + j * 13) % 9) * 0.16), oc = occ[k] ?? {};
    [0, 0.5].forEach((fr, q) => {
      if (oc[fr]) return; if (fr === 0.5 && (i * 3 + j * 5) % 3 === 0) return;
      const mi = (i * 2 + j * 3 + q) % 5;
      fleetVans.push({ id: '', route: '', lp, d: fr * lp.T, m: mk[mi](), p: [6, 3, 2, 3, 2][mi], delayed: false, kmh: 0, spd: lp.v * 1.6 });
    });
  }));
  const allV = fleet.concat(fleetVans);

  // Traffic signals
  let simT = 0;
  const SIGK = [[1, 0, 0, 1, 0, 0, 1], [1, 1, 1, 0, 1, -1, 0], [0, 1, 0, -1, 0, 0, -1], [0, 0, 1, 0, -1, 1, 0]];
  layout.forEach((row, j) => row.forEach((t, i) => {
    const lp = L(i, j, 3.6); lp.sig = [];
    SIGK.forEach((q, k) => {
      const d = (((lp.L[10 * k] - 0.6) % lp.T) + lp.T) % lp.T, pt = at(lp, d);
      const hv = [[1, 0], [0, 1], [-1, 0], [0, -1]][k], inw = [[0, 1], [-1, 0], [0, -1], [1, 0]][k];
      const ap: SignalApproach = { d, ax: k % 2, off: ((i * 5 + j * 3) % 7) * 4, flash: t === 'charge', state: -1, qx: pt[0], qz: pt[1], hx: hv[0], hz: hv[1], px: pt[0] + inw[0] * 1.15, pz: pt[1] + inw[1] * 1.15 };
      lp.sig!.push(ap); sigAps.push(ap);
    });
  }));

  const NS = sigAps.length;
  const sigPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), mat(C.mast), NS);
  const sigBox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), mat(0x1a2238), NS);
  const sigStop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.03, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), NS);
  const lamps = [0, 1, 2].map(() => new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), NS));
  const LC = [[0xff3b30, 0x401512], [0xffc531, 0x3d300d], [0x2fe08a, 0x0e3624]].map(p => p.map(c => new THREE.Color(c)));

  sigAps.forEach((ap, n) => {
    dd.rotation.set(0, 0, 0); dd.position.set(ap.px, 1.6, ap.pz); dd.updateMatrix(); sigPole.setMatrixAt(n, dd.matrix);
    dd.position.set(ap.px, 3.3, ap.pz); dd.updateMatrix(); sigBox.setMatrixAt(n, dd.matrix);
    dd.position.set(ap.qx, 0.085, ap.qz); dd.rotation.set(0, ap.hz !== 0 ? Math.PI / 2 : 0, 0); dd.updateMatrix(); sigStop.setMatrixAt(n, dd.matrix); dd.rotation.set(0, 0, 0);
    [0.45, 0, -0.45].forEach((dy, k) => { dd.position.set(ap.px - ap.hx * 0.3, 3.3 + dy, ap.pz - ap.hz * 0.3); dd.updateMatrix(); lamps[k].setMatrixAt(n, dd.matrix); lamps[k].setColorAt(n, LC[k][1]); });
  });
  sigPole.castShadow = true; [sigPole, sigBox, sigStop, ...lamps].forEach(m => { m.frustumCulled = false; S.add(m); });

  // Charging-station path setup
  stations.forEach(st => {
    const lp = L(st.i, st.j, 3.6), cx = st.cx, cz = st.cz, xt = cx + 6;
    st.lp = lp; st.spd = lp.v * 1.6; st.dm = dOf(lp, cx + 4.8, cz + 11.1);
    st.bays.forEach(b => {
      const xb = b.x;
      b.exit = PB(xb, cz + 0.9).add(xb, cz + 3.4).arc(xb - 2.5, cz + 3.4, 2.5, 0, Math.PI / 2).mark().add(xt, cz + 5.9).arc(xt, cz + 7.9, 2, -Math.PI / 2, 0).arc(xt - 1.2, cz + 7.9, 3.2, 0, Math.PI / 2);
      b.enter = PB(xb + 3.2, cz + 11.1).arc(xb + 3.2, cz + 7.9, 3.2, Math.PI / 2, Math.PI).add(xb, cz + 0.9);
      b.de = dOf(lp, xb + 3.2, cz + 11.1);
    });
    const p0 = st.bays[0].exit; let s0 = 0, t0 = 0;
    while (s0 < p0.T) { s0 += (s0 < p0.revEnd ? 1.5 : Math.min(st.spd, 2.2 + 0.6 * (s0 - p0.revEnd))) * 0.05; t0 += 0.05; }
    st.tex = t0 + 1;
    [1, 3, 5, -1, -1].forEach((bi, k) => {
      const v: StationVan = { m: makeVan(), state: bi >= 0 ? 'park' : 'loop', bay: null, timer: 5 + k * 8, d: 0, lap: Math.random() * 10, s: 0, path: null };
      if (bi >= 0) { v.bay = st.bays[bi]; v.bay.van = v; v.bay.busy = true; }
      else v.d = st.dm + lp.T * (k === 3 ? 0.3 : 0.7);
      st.vans.push(v); svans.push(v);
    });
  });

  // Drones
  function makeDrone() {
    const g = new THREE.Group();
    box(0.9, 0.25, 0.9, C.van, 0, 0, 0, true, g); box(2.2, 0.07, 0.12, C.navy, 0, 0.05, 0, false, g);
    box(0.12, 0.07, 2.2, C.navy, 0, 0.05, 0, false, g); box(0.55, 0.4, 0.55, C.blue, 0, -0.4, 0, true, g);
    const rs: THREE.Mesh[] = [];
    [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]].forEach(([x, z]) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 12), new THREE.MeshBasicMaterial({ color: C.glass, transparent: true, opacity: 0.55 }));
      r.position.set(x, 0.2, z); g.add(r); rs.push(r);
    });
    g.scale.setScalar(1.25); S.add(g); g.userData.rs = rs; return g;
  }

  const drones: Drone[] = Array.from({ length: 18 }, (_, i) => {
    const pad = padList[(i * 4 + 3) % padList.length];
    const d: Drone = { pad, to: null, t: 0, state: 'park', dwell: 1 + i * 0.9, cruise: 4 + i * 1, v: 9 + (i % 4) * 1.5, yaw: 0, m: makeDrone() };
    pad.owner = d; return d;
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 40), new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; S.add(ring);

  // Sim metrics
  const M: SimMetrics = {
    pD: 18240, pL: 306, dD: 1940, dL: 37,
    fl: Array.from({ length: 24 }, () => ({ dur: 8 + Math.random() * 6, late: Math.random() < 0.05 })),
    rt: 9640, re: 118, win: Array.from({ length: 300 }, () => (Math.random() > 0.012 ? 1 : 0)),
    kwh: 14.2, peak: 2480,
    pr: [], pl: [], sol: [], dem: [], acc: [],
  };

  // Vehicle speed groups
  const groups = new Map<LoopPath, typeof allV>();
  allV.forEach(f => { f.spd = f.lp.v * 1.6; if (!groups.has(f.lp)) groups.set(f.lp, []); groups.get(f.lp)!.push(f); });

  return {
    renderer: R, scene: S, camera: cam,
    fleet, drones, ships, stations, forklifts, bforks, belts, items, itemM,
    trolleys, radars, chargers, beltTex, WH, padList, nodes, ring, waves, wm,
    sigAps, lamps, LC, beaconM, pvN, M, simT,
    // expose internals needed by the frame loop
    _groups: groups, _allV: allV, _beltMat: beltMat, _svans: svans, _spawnItem: spawnItem,
    _yawOf: yawOf, _BV: BV, _dd: dd, _smooth: smooth,
  } as unknown as SceneState & Record<string, unknown>;
}

let activeSceneState: (SceneState & Record<string, unknown>) | null = null;
export function getActiveSceneState(): (SceneState & Record<string, unknown>) | null {
  return activeSceneState;
}
export function setActiveSceneState(s: (SceneState & Record<string, unknown>) | null): void {
  activeSceneState = s;
}

let activeAirportSceneState: unknown = null;
export function getActiveAirportSceneState<T>(): T | null {
  return activeAirportSceneState as T | null;
}
export function setActiveAirportSceneState(s: unknown): void {
  activeAirportSceneState = s;
}

let activeNetworkMode: 'logistics' | 'airport' = 'logistics';
export function getActiveNetworkMode(): 'logistics' | 'airport' {
  return activeNetworkMode;
}
export function setActiveNetworkMode(m: 'logistics' | 'airport'): void {
  activeNetworkMode = m;
}

