import * as THREE from 'three';
import {
  buildColors, mat, bas, box, cyl, rnd, resetSeed, smooth,
  loopPts, at, type LoopPath
} from './threeHelpers';

export interface AirportFlight {
  id: string;
  type: 'airliner' | 'gse' | 'taxi' | 'car';
  subType: 'landing' | 'takeoff' | 'cruise' | 'parked' | 'docking' | 'tug' | 'fuel' | 'ladder' | 'baggage' | 'bus' | 'catering' | 'followme' | 'taxi';
  route: string;
  m: THREE.Group;
  status: string;
  kmh: number;
  delayed: boolean;
  spd: number;
  d: number;
  lp?: LoopPath;
  tag?: HTMLButtonElement;
  row?: HTMLButtonElement;
  st?: HTMLElement;
  eta?: HTMLElement;
  bar?: HTMLElement;
  altitude?: number;
  phase?: number;
  progress?: number;
  timer?: number;
  rs?: THREE.Mesh[];
}

export interface AirportMetrics {
  flightsToday: number;
  onTimePercent: number;
  delayedCount: number;
  airborneCount: number;
  activeRunways: number;
  fuelDispatchedKGal: number;
  baggageTurnaroundMin: number;
  gseVehiclesActive: number;
  runwayThroughput: number[];
  departureDelayMin: number[];
  baggageTimeline: number[];
  airspaceLoad: number[];
}

export interface AirportSceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  flights: AirportFlight[];
  radars: THREE.Mesh[];
  beaconM: THREE.MeshBasicMaterial;
  approachLights: THREE.Mesh[];
  runwayLights: THREE.Mesh[];
  strobes: THREE.Mesh[];
  ring: THREE.Mesh;
  M: AirportMetrics;
  simT: number;
  // internal references for frame loop
  _takeoffPlane: AirportFlight;
  _landingPlane: AirportFlight;
  _dockingPlane: AirportFlight;
  _cruisingPlane: AirportFlight;
  _buses: AirportFlight[];
  _baggageTrains: AirportFlight[];
  _followMe: AirportFlight;
  _taxis: AirportFlight[];
  _dockingBridgeCab?: THREE.Group;
}

export function buildAirportScene(canvas: HTMLCanvasElement): AirportSceneState {
  resetSeed();

  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const C = buildColors(dark);
  const dd = new THREE.Object3D();

  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFSoftShadowMap;

  const S = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -550, 750);

  // Natural Sky & Sun Lighting
  S.add(new THREE.HemisphereLight(dark ? 0x9fb4ff : 0xf2f7ff, dark ? 0x0c1426 : 0xb0c5e8, dark ? 0.95 : 0.68));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 0.68 : 0.58);
  sun.position.set(-75, 110, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(innerWidth < 900 ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 1, far: 550 });
  sun.shadow.radius = 3.5;
  S.add(sun);

  // ── AIRPORT GROUND & EXPANDED AIRFIELD ───────────────────────────────────────
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(1350, 1350), mat(C.ground));
  gr.rotation.x = -Math.PI / 2;
  gr.receiveShadow = true;
  S.add(gr);

  // Main Apron / Tarmac Concrete Slab (320m wide, 140m deep)
  box(320, 0.22, 140, C.slab, 0, 0.11, 15, false, S);

  // Materials for airport markings
  const markWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const markYellow = new THREE.MeshBasicMaterial({ color: 0xffcb2b });
  const markRed = new THREE.MeshBasicMaterial({ color: 0xee2b2b });
  const rwyMat = new THREE.MeshStandardMaterial({ color: dark ? 0x121722 : 0x242a38, roughness: 0.82 });
  const taxiMat = new THREE.MeshStandardMaterial({ color: dark ? 0x192133 : 0x445268, roughness: 0.85 });

  // ── DUAL INDEPENDENT RUNWAYS (ZERO PLANE CONFLICT) ───────────────────────────
  // Runway 09L (Departures / Takeoffs - EK-204) at rwyZ = 82
  // Runway 09R (Arrivals / Landings - AF-402) at rwyZ = 120
  // Separated by 38 meters laterally!
  const rwyLen = 360, rwyWid = 16;
  const RWYS = [
    { z: 82, name: '09L' },
    { z: 120, name: '09R' },
  ];

  const approachLights: THREE.Mesh[] = [];
  const appLightMat = bas(0xffffff);

  RWYS.forEach(r => {
    const rwyMesh = new THREE.Mesh(new THREE.PlaneGeometry(rwyLen, rwyWid), rwyMat);
    rwyMesh.rotation.x = -Math.PI / 2;
    rwyMesh.position.set(0, 0.23, r.z);
    rwyMesh.receiveShadow = true;
    S.add(rwyMesh);

    // Threshold piano keys
    [-172, 158].forEach(endX => {
      for (let k = -6.5; k <= 6.5; k += 1.4) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 0.75), markWhite);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(endX + 5.5, 0.25, r.z + k);
        S.add(stripe);
      }
    });

    // Dashed centerline
    for (let x = -155; x <= 150; x += 10) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.5), markWhite);
      cl.rotation.x = -Math.PI / 2;
      cl.position.set(x, 0.25, r.z);
      S.add(cl);
    }

    // Touchdown zone markings
    [-125, -95, 90, 120].forEach(x => {
      [-4.0, 4.0].forEach(zOff => {
        const tdz = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 1.2), markWhite);
        tdz.rotation.x = -Math.PI / 2;
        tdz.position.set(x, 0.25, r.z + zOff);
        S.add(tdz);
      }      );
    });
  });

  // Approach lighting towers leading to Runway 09L & 09R
  for (let k = 1; k <= 8; k++) {
    const lx = -180 - k * 14;
    cyl(0.18, 0.18, 2 + k * 0.45, C.mast, lx, 1 + k * 0.22, 82, 8, S);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), appLightMat);
    lamp.position.set(lx, 2 + k * 0.45, 82);
    S.add(lamp);
    approachLights.push(lamp);
  }

  // Taxiways connecting Runway 09L to Apron
  [-130, -65, 0, 65, 130].forEach(x => {
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(12, 32), taxiMat);
    tw.rotation.x = -Math.PI / 2;
    tw.position.set(x, 0.235, 66);
    tw.receiveShadow = true;
    S.add(tw);

    // Yellow taxi centerline
    const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 32), markYellow);
    yl.rotation.x = -Math.PI / 2;
    yl.position.set(x, 0.25, 66);
    S.add(yl);
  });

  // Parallel taxiway along apron
  const pTw = new THREE.Mesh(new THREE.PlaneGeometry(310, 12), taxiMat);
  pTw.rotation.x = -Math.PI / 2;
  pTw.position.set(0, 0.235, 43);
  pTw.receiveShadow = true;
  S.add(pTw);

  const pYl = new THREE.Mesh(new THREE.PlaneGeometry(310, 0.4), markYellow);
  pYl.rotation.x = -Math.PI / 2;
  pYl.position.set(0, 0.25, 43);
  S.add(pYl);

  // ── TREES & GARDENS ──────────────────────────────────────────────────────────
  const tm = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 3.2, 6),
    new THREE.MeshStandardMaterial({ color: C.tree, roughness: 0.85 }), 500);
  tm.castShadow = true;
  tm.receiveShadow = true;
  let tn = 0;
  function tree(x: number, z: number, s = 1) {
    if (tn >= 500) return;
    dd.position.set(x, 1.6 * s + 0.2, z);
    dd.scale.set(s, s, s);
    dd.updateMatrix();
    tm.setMatrixAt(tn++, dd.matrix);
    dd.scale.set(1, 1, 1);
  }

  for (let k = 0; k < 420; k++) {
    const x = -210 + rnd() * 420, z = -190 + rnd() * 340;
    // Clear of runways and apron
    if (x > -165 && x < 165 && z > -48 && z < 140) continue;
    // Clear of terminal & car park
    if (x > -130 && x < 130 && z > -175 && z < -45) continue;
    tree(x, z, 0.8 + rnd() * 0.7);
  }
  tm.count = tn;
  S.add(tm);

  // Landscaped gardens along terminal boulevard
  [-60, -20, 20, 60].forEach(gx => {
    box(28, 0.35, 6, dark ? 0x1f342b : 0xa4cbb2, gx, 0.18, -82, false, S);
    for (let i = -10; i <= 10; i += 5) {
      tree(gx + i, -82, 0.65);
    }
  });

  // ── 1. AUTHENTIC MULTI-BAY AIRPORT CAR PARK (120+ REALISTIC CARS) ─────────────
  // User Requirement 1: "they dont loook like parked cars at all!!"
  // Large asphalt car park plaza (165m × 65m)
  const carParkBase = new THREE.Mesh(
    new THREE.PlaneGeometry(165, 68),
    new THREE.MeshStandardMaterial({ color: dark ? 0x131a28 : 0x3d4a60, roughness: 0.88 })
  );
  carParkBase.rotation.x = -Math.PI / 2;
  carParkBase.position.set(0, 0.16, -134);
  carParkBase.receiveShadow = true;
  S.add(carParkBase);

  // Parking barriers & perimeter curbs
  box(166, 0.35, 0.35, C.mast, 0, 0.25, -99.5, false, S);
  box(166, 0.35, 0.35, C.mast, 0, 0.25, -168.5, false, S);
  box(0.35, 0.35, 69, C.mast, -82.8, 0.25, -134, false, S);
  box(0.35, 0.35, 69, C.mast, 82.8, 0.25, -134, false, S);

  // Overhead high-mast parking floodlights
  [-55, 0, 55].forEach(lx => {
    cyl(0.22, 0.22, 8.5, C.mast, lx, 4.3, -134, 8, S);
    box(3.2, 0.28, 0.6, 0xffffff, lx, 8.6, -134, false, S);
    // Concrete base column
    cyl(0.65, 0.65, 0.7, 0xadb5bd, lx, 0.45, -134, 8, S);
  });

  // Concrete wheel-stop bumpers and white U-shaped parking stall lines
  // Two double parking bays:
  // Bay 1: Drive aisle at z = -153. Stalls at z = -160 and z = -146
  // Bay 2: Drive aisle at z = -122. Stalls at z = -129 and z = -115
  const parkingRows = [
    { stallZ: -160, aisleZ: -153, bumperZ: -162.2, faceNorth: false },
    { stallZ: -146, aisleZ: -153, bumperZ: -143.8, faceNorth: true },
    { stallZ: -129, aisleZ: -122, bumperZ: -131.2, faceNorth: false },
    { stallZ: -115, aisleZ: -122, bumperZ: -112.8, faceNorth: true },
  ];

  parkingRows.forEach(row => {
    for (let x = -72; x <= 72; x += 3.4) {
      // White stall divider lines (perpendicular to drive aisle)
      const pLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 5.2), markWhite);
      pLine.rotation.x = -Math.PI / 2;
      pLine.position.set(x, 0.20, row.stallZ);
      S.add(pLine);

      // Concrete wheel-stop curb at head of stall
      box(2.0, 0.16, 0.32, 0xced4da, x + 1.7, 0.22, row.bumperZ, false, S);
    }
  });

  // Drive aisle painted directional road arrows
  [-45, 0, 45].forEach(ax => {
    [-153, -122].forEach(az => {
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), markWhite);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(ax, 0.19, az);
      S.add(arrow);
    });
  });

  // Builder for detailed low-poly realistic cars (Sedans, SUVs, Hatchbacks)
  function makeRealisticCar(type: 'sedan' | 'suv' | 'hatch', colorHex: number): THREE.Group {
    const g = new THREE.Group();
    // Chassis base
    box(3.4, 0.4, 1.58, colorHex, 0, 0.38, 0, true, g);
    // Front hood
    box(1.1, 0.22, 1.54, colorHex, 1.15, 0.52, 0, true, g);
    // Front bumper / grille
    box(0.12, 0.28, 1.4, 0x111620, 1.72, 0.36, 0, false, g);
    // Headlights
    box(0.08, 0.14, 0.32, 0xffffff, 1.73, 0.46, 0.52, false, g);
    box(0.08, 0.14, 0.32, 0xffffff, 1.73, 0.46, -0.52, false, g);
    // Taillights
    box(0.08, 0.14, 0.32, 0xdd2222, -1.73, 0.46, 0.52, false, g);
    box(0.08, 0.14, 0.32, 0xdd2222, -1.73, 0.46, -0.52, false, g);

    if (type === 'suv') {
      // Taller boxy cabin
      box(2.1, 0.72, 1.46, colorHex, -0.4, 0.95, 0, true, g);
      // Dark glass
      box(0.1, 0.55, 1.34, 0x0f1828, 0.68, 0.95, 0, false, g);
      box(0.1, 0.55, 1.34, 0x0f1828, -1.48, 0.95, 0, false, g);
      box(1.9, 0.5, 1.5, 0x0f1828, -0.4, 0.95, 0, false, g);
      // Roof rails
      box(1.8, 0.08, 0.08, 0x222222, -0.4, 1.35, 0.55, false, g);
      box(1.8, 0.08, 0.08, 0x222222, -0.4, 1.35, -0.55, false, g);
    } else if (type === 'hatch') {
      // Sloping hatchback
      box(1.8, 0.58, 1.44, colorHex, -0.3, 0.88, 0, true, g);
      box(0.1, 0.45, 1.32, 0x0f1828, 0.62, 0.86, 0, false, g);
      box(0.1, 0.45, 1.32, 0x0f1828, -1.22, 0.86, 0, false, g);
      box(1.6, 0.42, 1.48, 0x0f1828, -0.3, 0.86, 0, false, g);
    } else {
      // Sedan with trunk step
      box(1.6, 0.58, 1.44, colorHex, -0.15, 0.88, 0, true, g);
      box(0.7, 0.22, 1.52, colorHex, -1.3, 0.52, 0, true, g);
      box(0.1, 0.45, 1.32, 0x0f1828, 0.66, 0.86, 0, false, g);
      box(0.1, 0.45, 1.32, 0x0f1828, -0.96, 0.86, 0, false, g);
      box(1.4, 0.42, 1.48, 0x0f1828, -0.15, 0.86, 0, false, g);
    }

    // 4 Wheels with rubber tires & silver rims
    const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    const rimGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.26, 8);
    const tireMat = mat(0x181a20);
    const rimMat = mat(0xd0d8e2);
    [[-1.05, 0.74], [1.05, 0.74], [-1.05, -0.74], [1.05, -0.74]].forEach(([wx, wz]) => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.34, wz);
      tire.castShadow = true;
      g.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.34, wz);
      g.add(rim);
    });

    g.scale.setScalar(0.72);
    return g;
  }

  const carColors = [0xfafafa, 0x243248, 0x4a6572, 0x98a6b5, 0xc1272d, 0x1f7a63, 0x333b47, 0xb8860b];
  const carTypes: ('sedan' | 'suv' | 'hatch')[] = ['sedan', 'suv', 'hatch'];

  // Park 130+ cars inside marked stalls facing the drive aisle!
  // Car's local length is along X.
  // To park inside stall with length along Z facing the drive aisle:
  // If drive aisle is to the North (-Z): rotation.y = Math.PI / 2
  // If drive aisle is to the South (+Z): rotation.y = -Math.PI / 2
  parkingRows.forEach(row => {
    for (let x = -70.3; x <= 70.3; x += 3.4) {
      if (rnd() > 0.87) continue; // realistic empty spaces (approx 13% empty)
      const cType = carTypes[Math.floor(rnd() * carTypes.length)];
      const cHex = carColors[Math.floor(rnd() * carColors.length)];
      const car = makeRealisticCar(cType, cHex);

      // Slight natural variation in parking depth
      const zOffset = (rnd() - 0.5) * 0.3;
      car.position.set(x, 0, row.stallZ + zOffset);
      car.rotation.y = row.faceNorth ? Math.PI / 2 : -Math.PI / 2;
      S.add(car);
    }
  });

  // ── 2. EXPANDED AIRPORT TERMINAL COMPLEX ────────────────────────────────────
  // User Requirement 3: "connect these to te airport , it should look liek an airport !!"
  // Main Terminal Central Departure / Arrival Concourse
  box(150, 9.4, 28, C.bld, 0, 4.7, -64, true, S);
  box(154, 0.8, 30, C.roof, 0, 9.8, -64, true, S);
  // Large panoramic floor-to-ceiling tinted glass facades
  box(148, 6.0, 0.25, C.glass, 0, 4.5, -49.8, false, S);
  box(148, 6.0, 0.25, C.glass, 0, 4.5, -78.2, false, S);

  // 3 Concourse Piers (Concourse A, B, C extending into apron)
  const concourses = [-65, 0, 65];
  concourses.forEach(px => {
    box(16, 5.8, 44, C.bld, px, 2.9, -24, true, S);
    box(17, 0.5, 45, C.roof, px, 6.0, -24, true, S);
    box(0.25, 4.0, 42, C.glass, px + 8.05, 3.0, -24, false, S);
    box(0.25, 4.0, 42, C.glass, px - 8.05, 3.0, -24, false, S);
  });

  // West Apron Hangar & Freight Logistics Hub
  box(42, 12.0, 30, dark ? 0x18243b : 0xd8e3f2, -125, 6.0, -15, true, S);
  box(44, 0.6, 32, C.roof, -125, 12.3, -15, true, S);
  box(36, 9.2, 0.25, dark ? 0x0f1828 : 0x24324a, -125, 5.0, 0.1, false, S);

  // ── 3. GREY TRANSPARENT PASSENGER BOARDING BRIDGES (AEROBRIDGES) ────────────
  // User Requirement 5: "i need a grey traparent brindge connected to doors of these planes"
  // User Requirement 3: "connect these to te airport , it should look liek an airport !!"
  const glassBridgeMat = new THREE.MeshStandardMaterial({
    color: 0x94a6bc,
    transparent: true,
    opacity: 0.42,
    roughness: 0.12,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });

  interface JetBridgeConfig {
    pierWallX: number;
    doorTargetX: number;
    doorTargetZ: number;
    gateName: string;
  }

  const jetBridges: JetBridgeConfig[] = [
    // Gate A1 (Concourse A west side)
    { pierWallX: -73.0, doorTargetX: -82.75, doorTargetZ: -32.0, gateName: 'GATE A1' },
    // Gate A2 (Concourse A west side)
    { pierWallX: -73.0, doorTargetX: -82.75, doorTargetZ: -10.0, gateName: 'GATE A2' },
    // Gate B1 (Concourse B west side)
    { pierWallX: -8.0, doorTargetX: -17.75, doorTargetZ: -30.0, gateName: 'GATE B1' },
    // Gate B2 (Concourse B east side)
    { pierWallX: 8.0, doorTargetX: 17.75, doorTargetZ: -30.0, gateName: 'GATE B2' },
    // Gate C1 (Concourse C east side - Docking gate for SQ-012)
    { pierWallX: 73.0, doorTargetX: 82.75, doorTargetZ: -32.0, gateName: 'GATE C1' },
    // Gate C2 (Concourse C east side)
    { pierWallX: 73.0, doorTargetX: 82.75, doorTargetZ: -10.0, gateName: 'GATE C2' },
  ];

  let dockingBridgeCabGroup: THREE.Group | undefined;

  jetBridges.forEach(jb => {
    const span = Math.abs(jb.doorTargetX - jb.pierWallX);
    const midX = (jb.pierWallX + jb.doorTargetX) / 2;
    const z = jb.doorTargetZ;

    // 1. Tarmac gate markings: yellow lead-in line & red safety boundary envelope
    const leadIn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 28), markYellow);
    leadIn.rotation.x = -Math.PI / 2;
    leadIn.position.set(jb.doorTargetX - (jb.pierWallX > jb.doorTargetX ? 1.25 : -1.25), 0.24, z + 8);
    S.add(leadIn);

    // Stop bar line across lead-in
    const stopBar = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.4), markYellow);
    stopBar.rotation.x = -Math.PI / 2;
    stopBar.position.set(jb.doorTargetX - (jb.pierWallX > jb.doorTargetX ? 1.25 : -1.25), 0.25, z);
    S.add(stopBar);

    // 2. Terminal Rotunda Tower (concourse exit portal)
    cyl(1.5, 1.5, 4.4, C.navy, jb.pierWallX, 2.2, z, 12, S);
    // Gate sign display panel
    box(0.2, 0.9, 2.2, 0x111c2e, jb.pierWallX + (jb.pierWallX > jb.doorTargetX ? -0.8 : 0.8), 3.8, z, false, S);

    // 3. GREY TRANSPARENT GLASS WALKWAY SPAN
    // Walkway floor (solid dark slate grey)
    box(span, 0.22, 2.0, 0x2b384c, midX, 1.6, z, true, S);
    // Walkway roof cap (solid grey)
    box(span, 0.22, 2.1, 0x48566d, midX, 3.8, z, true, S);

    // BOTH SIDE WALLS: GREY TRANSPARENT GLASS
    const gWall1 = new THREE.Mesh(new THREE.BoxGeometry(span, 2.0, 0.08), glassBridgeMat);
    gWall1.position.set(midX, 2.7, z + 1.0);
    S.add(gWall1);

    const gWall2 = new THREE.Mesh(new THREE.BoxGeometry(span, 2.0, 0.08), glassBridgeMat);
    gWall2.position.set(midX, 2.7, z - 1.0);
    S.add(gWall2);

    // Vertical structural mullions along the glass corridor
    for (let m = 0; m <= span; m += 2.4) {
      const mx = jb.pierWallX < jb.doorTargetX ? jb.pierWallX + m : jb.pierWallX - m;
      cyl(0.08, 0.08, 2.0, C.mast, mx, 2.7, z + 1.0, 6, S);
      cyl(0.08, 0.08, 2.0, C.mast, mx, 2.7, z - 1.0, 6, S);
    }

    // 4. Telescoping steel support column & wheel bogie on tarmac
    cyl(0.2, 0.2, 1.5, C.mast, midX, 0.8, z, 8, S);
    const bogie = box(0.5, 0.35, 2.0, 0x181818, midX, 0.25, z, false, S);

    // 5. Docking cab with black rubber accordion bellows
    const cabGroup = new THREE.Group();
    box(2.2, 2.3, 2.2, 0x263345, 0, 0, 0, true, cabGroup);
    // Rubber bellows seal facing airplane fuselage door
    box(0.3, 2.1, 1.9, 0x11141a, jb.pierWallX > jb.doorTargetX ? -1.15 : 1.15, 0, 0, false, cabGroup);
    cabGroup.position.set(jb.doorTargetX, 2.7, z);
    S.add(cabGroup);

    if (jb.gateName === 'GATE C1') {
      dockingBridgeCabGroup = cabGroup;
    }
  });

  // ── AIR TRAFFIC CONTROL (ATC) TOWER ─────────────────────────────────────────
  const twX = -100, twZ = -46;
  cyl(2.2, 3.4, 38, C.bld, twX, 19, twZ, 12, S);
  cyl(5.6, 4.0, 5.6, C.glass, twX, 39.5, twZ, 12, S);
  cyl(6.2, 6.2, 0.8, C.roof, twX, 42.6, twZ, 12, S);
  cyl(0.25, 0.25, 4.5, C.mast, twX, 45.4, twZ, 8, S);
  const radar = box(4.8, 0.45, 0.45, C.navy, twX, 47.8, twZ, true, S) as unknown as THREE.Mesh;
  const radars: THREE.Mesh[] = [radar];

  const beaconM = bas(0x2fe08a);
  const beaconSph = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 10), beaconM);
  beaconSph.position.set(twX, 48.7, twZ);
  S.add(beaconSph);

  // ── DETAILED AIRPLANE MODEL BUILDER ─────────────────────────────────────────
  // Local coordinate convention:
  // Forward NOSE: +Z (from z = +9.5 to +12.5)
  // Rear TAIL: -Z (tail fin at z = -12.5)
  // Forward Left Passenger Door (Door 1L): x = -1.25, z = +6.2
  // Forward Right Passenger Door (Door 1R): x = +1.25, z = +6.2
  function makeAirplane(liveryColor = C.blue, scale = 1): THREE.Group {
    const g = new THREE.Group();

    // Fuselage cylinder
    const fuse = cyl(1.25, 1.25, 19, 0xffffff, 0, 0, 0, 16, g);
    fuse.rotation.x = Math.PI / 2;
    fuse.castShadow = true;

    // Cockpit nose cone
    const nose = cyl(0.3, 1.25, 3.5, 0xffffff, 0, 0, 11.2, 16, g);
    nose.rotation.x = Math.PI / 2;
    nose.castShadow = true;

    // Cockpit windshield glass
    box(1.2, 0.45, 0.7, dark ? 0x050810 : 0x1a263d, 0, 0.7, 10.4, false, g);

    // Forward passenger doors (both sides)
    box(0.08, 1.4, 0.85, dark ? 0x223048 : 0x5a7094, -1.26, 0.1, 6.2, false, g);
    box(0.08, 1.4, 0.85, dark ? 0x223048 : 0x5a7094, 1.26, 0.1, 6.2, false, g);

    // Tail cone
    const tailCone = cyl(1.25, 0.3, 4.0, 0xffffff, 0, 0, -11.5, 16, g);
    tailCone.rotation.x = Math.PI / 2;
    tailCone.castShadow = true;

    // Swept wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 2.5);
    wingShape.lineTo(14.5, -4.5);
    wingShape.lineTo(14.5, -7.5);
    wingShape.lineTo(0, -4.0);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.32, bevelEnabled: false });

    const rWing = new THREE.Mesh(wingGeo, mat(0xf5f8ff));
    rWing.rotation.x = Math.PI / 2;
    rWing.position.set(0, -0.2, 0);
    rWing.castShadow = true;
    g.add(rWing);

    const lWing = rWing.clone();
    lWing.scale.x = -1;
    g.add(lWing);

    // Wingtip lights
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), bas(0xff3b30));
    redLight.position.set(-14.5, 0.1, -6.0);
    g.add(redLight);
    const grnLight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), bas(0x2fe08a));
    grnLight.position.set(14.5, 0.1, -6.0);
    g.add(grnLight);

    // Turbofan Jet Engines under wings
    [-5.0, 5.0].forEach(ex => {
      const eng = cyl(0.85, 0.85, 3.8, 0xdfe8f5, ex, -0.9, 0.5, 14, g);
      eng.rotation.x = Math.PI / 2;
      eng.castShadow = true;
      cyl(0.72, 0.72, 0.3, 0x111624, ex, -0.9, 2.4, 12, g).rotation.x = Math.PI / 2;
      box(0.2, 0.85, 2.0, C.mast, ex, -0.4, 0.3, false, g);
    });

    // Vertical Stabilizer (Tail Fin) with airline livery
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0, 5.8);
    finShape.lineTo(2.8, 5.8);
    finShape.lineTo(4.6, 0);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.25, bevelEnabled: false }), mat(liveryColor));
    fin.rotation.y = -Math.PI / 2;
    fin.position.set(-0.12, 1.0, -12.5);
    fin.castShadow = true;
    g.add(fin);

    // Horizontal tail stabilizers
    [-1, 1].forEach(side => {
      const hStab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 2.0), mat(0xffffff));
      hStab.position.set(side * 3.0, 0.7, -11.6);
      hStab.castShadow = true;
      g.add(hStab);
    });

    // Landing gear bogies
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 12);
    [[0, 8.2], [-3.0, -1.0], [3.0, -1.0]].forEach(([gx, gz]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(gx, -1.9, gz);
      w.castShadow = true;
      g.add(w);
      cyl(0.14, 0.14, 1.3, C.mast, gx, -1.25, gz, 8, g);
    });

    g.scale.setScalar(scale);
    S.add(g);
    return g;
  }

  // ── GROUND VEHICLE MODELS ───────────────────────────────────────────────────
  // Modern Low-Floor Airport Passenger Apron Bus
  function makeApronBus(livery = C.blue): THREE.Group {
    const g = new THREE.Group();
    box(8.2, 2.4, 2.6, C.van, 0, 1.4, 0, true, g);
    box(7.5, 0.9, 2.64, C.glass, 0, 1.7, 0, false, g);
    box(8.24, 0.35, 2.62, livery, 0, 0.7, 0, false, g);
    box(1.8, 1.8, 0.08, dark ? 0x18243b : 0x364866, -1.2, 1.2, 1.32, false, g);
    box(1.8, 1.8, 0.08, dark ? 0x18243b : 0x364866, 1.8, 1.2, 1.32, false, g);
    box(2.4, 0.3, 1.5, 0xd0dae8, -1.8, 2.75, 0, false, g);
    box(2.4, 0.3, 1.5, 0xd0dae8, 1.8, 2.75, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 12);
    [[-2.6, 1.2], [2.6, 1.2], [-2.6, -1.2], [2.6, -1.2]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.44, z);
      w.castShadow = true;
      g.add(w);
    });
    g.scale.setScalar(0.78);
    S.add(g);
    return g;
  }

  // Baggage Tractor with 3 Linked Luggage Carts
  function makeBaggageTrain(): THREE.Group {
    const g = new THREE.Group();
    box(1.8, 1.1, 1.2, C.warn, 0, 0.7, 0, true, g);
    box(0.7, 0.8, 1.0, dark ? 0x11182c : 0x22304d, -0.3, 1.4, 0, false, g);
    const cartColors = [C.blue, dark ? 0x4fd1bd : 0x2fb5a2, C.navy, C.warn];
    for (let c = 1; c <= 3; c++) {
      const cz = -c * 2.8;
      box(2.0, 0.4, 1.2, 0x5a6d8c, 0, 0.45, cz, true, g);
      box(0.15, 0.15, 1.4, 0x111624, 0, 0.35, cz + 1.4, false, g);
      for (let s = 0; s < 3; s++) {
        box(0.65, 0.45, 0.45, cartColors[(c + s) % 4], -0.4 + s * 0.4, 0.8, cz, true, g);
      }
      const cwg = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 10);
      [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(cwg, mat(0x11182c));
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.25, cz + wz);
        g.add(w);
      });
    }
    const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10);
    [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.32, wz);
      g.add(w);
    });
    g.scale.setScalar(0.75);
    S.add(g);
    return g;
  }

  // Runway Safety "Follow Me" Car with Amber Lightbar
  function makeFollowMeCar(): THREE.Group {
    const g = new THREE.Group();
    box(3.0, 0.9, 1.5, 0xffcb2b, 0, 0.65, 0, true, g);
    box(1.5, 0.8, 1.4, 0xffcb2b, -0.2, 1.35, 0, true, g);
    box(0.08, 0.5, 1.25, C.glass, 0.56, 1.4, 0, false, g);
    box(1.5, 0.45, 1.52, dark ? 0x11182c : 0x1e2738, -0.2, 0.7, 0, false, g);
    box(0.8, 0.2, 0.25, 0xff8c00, -0.2, 1.85, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.35, z);
      w.castShadow = true;
      g.add(w);
    });
    g.scale.setScalar(0.78);
    S.add(g);
    return g;
  }

  // Yellow Airport City Taxi
  function makeTaxi(): THREE.Group {
    const g = new THREE.Group();
    box(2.8, 0.75, 1.35, 0xffcb2b, 0, 0.55, 0, true, g);
    box(1.4, 0.75, 1.25, 0xffcb2b, -0.2, 1.15, 0, true, g);
    box(0.08, 0.45, 1.1, C.glass, 0.52, 1.25, 0, false, g);
    box(0.5, 0.18, 0.22, 0xffffff, -0.2, 1.6, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12);
    [[-0.9, 0.65], [0.9, 0.65], [-0.9, -0.65], [0.9, -0.65]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.32, z);
      w.castShadow = true;
      g.add(w);
    });
    g.scale.setScalar(0.78);
    S.add(g);
    return g;
  }

  // Pushback Tug
  function makePushbackTug(): THREE.Group {
    const g = new THREE.Group();
    box(4.2, 1.2, 2.2, C.warn, 0, 0.7, 0, true, g);
    box(1.8, 1.1, 2.0, dark ? 0x1c283f : 0x364868, 0.8, 1.5, 0, true, g);
    box(0.08, 0.65, 1.7, C.glass, 1.72, 1.6, 0, false, g);
    box(2.2, 0.18, 0.18, 0x111624, -2.4, 0.45, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.52, 0.52, 0.5, 14);
    [[-1.3, 1.1], [1.3, 1.1], [-1.3, -1.1], [1.3, -1.1]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.52, z);
      w.castShadow = true;
      g.add(w);
    });
    g.scale.setScalar(0.75);
    S.add(g);
    return g;
  }

  // Aviation Fuel Tanker Truck
  function makeFuelTruck(): THREE.Group {
    const g = new THREE.Group();
    box(2.2, 1.8, 1.8, C.van, 2.5, 1.1, 0, true, g);
    box(0.1, 0.7, 1.6, C.glass, 3.62, 1.4, 0, false, g);
    const tank = cyl(1.15, 1.15, 6.4, 0xffffff, -1.4, 1.4, 0, 16, g);
    tank.rotation.z = Math.PI / 2;
    tank.castShadow = true;
    box(6.45, 0.35, 2.32, dark ? 0x3ddc97 : 0x0f9a64, -1.4, 1.4, 0, false, g);
    box(7.5, 0.3, 1.5, 0x1b2440, 0.2, 0.4, 0, false, g);
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 12);
    [[2.2, 0.95], [-0.8, 0.95], [-2.8, 0.95], [2.2, -0.95], [-0.8, -0.95], [-2.8, -0.95]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.44, z);
      w.castShadow = true;
      g.add(w);
    });
    g.scale.setScalar(0.75);
    S.add(g);
    return g;
  }

  // ── 4. PARKED AIRPLANES (CONNECTED TO JET BRIDGES AT DOORS) ─────────────────
  // User Requirement 2 & 5: Connected to door, not tail
  const parkedPlanes: AirportFlight[] = [
    {
      id: 'PA-881',
      type: 'airliner',
      subType: 'parked',
      route: 'Gate A1 · Tokyo HND (Boarding via Jet Bridge)',
      m: makeAirplane(C.blue, 1.0),
      status: 'Gate A1 Boarding',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    },
    {
      id: 'LH-318',
      type: 'airliner',
      subType: 'parked',
      route: 'Gate A2 · Frankfurt FRA (Catering & Baggage)',
      m: makeAirplane(0xd9801a, 1.0),
      status: 'Gate A2 Servicing',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    },
    {
      id: 'BA-109',
      type: 'airliner',
      subType: 'parked',
      route: 'Gate B1 · London LHR (Pre-flight Clearance)',
      m: makeAirplane(C.navy, 1.0),
      status: 'Gate B1 Ready',
      kmh: 0,
      delayed: true,
      spd: 0,
      d: 0,
    },
    {
      id: 'QR-502',
      type: 'airliner',
      subType: 'parked',
      route: 'Gate B2 · Doha DOH (Hydrant Refueling)',
      m: makeAirplane(0x8a2be2, 1.0),
      status: 'Gate B2 Refueling',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    },
    {
      id: 'AF-114',
      type: 'airliner',
      subType: 'parked',
      route: 'Gate C2 · Paris CDG (Baggage Loaded)',
      m: makeAirplane(C.blue, 1.0),
      status: 'Gate C2 Docked',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    },
  ];

  // Exact positions & rotations so Door 1L (at x = -1.25, z = +6.2) meets the jetway cab!
  // Gate A1: plane at x = -84, z = -38.2. Door is at x = -84 + 1.25 = -82.75, z = -38.2 + 6.2 = -32.0!
  parkedPlanes[0].m.position.set(-84, 1.8, -38.2);
  parkedPlanes[0].m.rotation.y = 0;

  // Gate A2: plane at x = -84, z = -16.2. Door is at x = -82.75, z = -16.2 + 6.2 = -10.0!
  parkedPlanes[1].m.position.set(-84, 1.8, -16.2);
  parkedPlanes[1].m.rotation.y = 0;

  // Gate B1: plane at x = -19, z = -36.2. Door is at x = -17.75, z = -30.0!
  parkedPlanes[2].m.position.set(-19, 1.8, -36.2);
  parkedPlanes[2].m.rotation.y = 0;

  // Gate B2: plane at x = 19, z = -36.2. Facing south, left door faces west concourse at x = 17.75, z = -30.0!
  parkedPlanes[3].m.position.set(19, 1.8, -36.2);
  parkedPlanes[3].m.rotation.y = 0;

  // Gate C2: plane at x = 84, z = -16.2. Left door at x = 82.75, z = -10.0!
  parkedPlanes[4].m.position.set(84, 1.8, -16.2);
  parkedPlanes[4].m.rotation.y = 0;

  // Ground service equipment safely docked at stands
  const gateGSE: AirportFlight[] = [
    { id: 'TUG-01', type: 'gse', subType: 'tug', route: 'Gate A1 · Pushback Tug Attached to Nosegear', m: makePushbackTug(), status: 'Tug Connected', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'FUEL-02', type: 'gse', subType: 'fuel', route: 'Gate B2 · Underwing Hydrant Fuel Truck', m: makeFuelTruck(), status: 'Hydrant Active', kmh: 0, delayed: false, spd: 0, d: 0 },
  ];
  gateGSE[0].m.position.set(-84, 0, -28);
  gateGSE[0].m.rotation.y = Math.PI;

  gateGSE[1].m.position.set(26, 0, -36);
  gateGSE[1].m.rotation.y = 0;

  // ── 5. DYNAMIC ACTIVE FLIGHTS ───────────────────────────────────────────────
  // Flight 1: Takeoff Flight (EK-204) - 45-degree angle climb out!
  // User Requirement 2: "planes taking off should have 45 degree angle while taking off!!"
  const takeoffPlane: AirportFlight = {
    id: 'EK-204',
    type: 'airliner',
    subType: 'takeoff',
    route: 'Rwy 09L → Dubai DXB (45° Steep Angle Takeoff Climb)',
    m: makeAirplane(0xd9381e, 1.05),
    status: 'Takeoff Roll (Rwy 09L)',
    kmh: 310,
    delayed: false,
    spd: 45,
    d: 0,
    progress: 0,
    altitude: 1.8,
  };

  // Flight 2: Landing Flight (AF-402) - Approach & Touchdown on Rwy 09R
  // User Requirement 7: "no plane should come close to ech other !!"
  // Operates on Runway 09R (z = 120), completely separated from EK-204 (z = 82)!
  const landingPlane: AirportFlight = {
    id: 'AF-402',
    type: 'airliner',
    subType: 'landing',
    route: 'Paris CDG → Rwy 09R (Touchdown & Vacate)',
    m: makeAirplane(C.blue, 1.05),
    status: 'Final Approach (Rwy 09R)',
    kmh: 240,
    delayed: false,
    spd: 35,
    d: 0,
    progress: 0.5,
    altitude: 50,
  };

  // Flight 3: Live Docking Flight (SQ-012)
  // User Requirement 6: "show planes docking or parking at airport !!"
  const dockingPlane: AirportFlight = {
    id: 'SQ-012',
    type: 'airliner',
    subType: 'docking',
    route: 'Singapore SIN → Taxiing & Docking at Gate C1',
    m: makeAirplane(0x0e7c61, 1.0),
    status: 'Taxiing to Gate C1',
    kmh: 22,
    delayed: false,
    spd: 20,
    d: 0,
    progress: 0,
    altitude: 1.8,
  };

  // Flight 4: High-Altitude Holding / Cruise Flight (UA-920)
  const cruisingPlane: AirportFlight = {
    id: 'UA-920',
    type: 'airliner',
    subType: 'cruise',
    route: 'San Francisco SFO → Sky Holding Pattern (FL085)',
    m: makeAirplane(dark ? 0x4fd1bd : 0x2fb5a2, 1.1),
    status: 'Holding Pattern (FL085)',
    kmh: 540,
    delayed: false,
    spd: 55,
    d: 0,
    progress: 0,
    altitude: 85,
  };

  // ── 6. SEPARATE DEDICATED LANES FOR ALL VEHICLES (ZERO COLLISIONS) ─────────
  // User Requirement 4 & 6: "these are seperate vehicles!!" & no overlap
  // Lane 1: Apron Passenger Bus Corridor (z = 36 to 46)
  const busLoop = loopPts(-115, 115, 36, 46, 4.5);
  const buses: AirportFlight[] = [
    {
      id: 'BUS-01',
      type: 'gse',
      subType: 'bus',
      route: 'Tarmac Shuttle · Terminal A ↔ Remote Stands',
      m: makeApronBus(C.blue),
      status: 'Passenger Transfer',
      kmh: 32,
      delayed: false,
      spd: 5.2,
      d: 0,
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-02',
      type: 'gse',
      subType: 'bus',
      route: 'Tarmac Shuttle · Concourse B ↔ Gate C',
      m: makeApronBus(C.warn),
      status: 'Passenger Boarding',
      kmh: 28,
      delayed: false,
      spd: 4.8,
      d: busLoop.T * 0.333, // exactly 1/3 loop ahead
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-03',
      type: 'gse',
      subType: 'bus',
      route: 'Apron Transfer · Gate C ↔ Arrivals Concourse',
      m: makeApronBus(dark ? 0x4fd1bd : 0x2fb5a2),
      status: 'Transfer Active',
      kmh: 30,
      delayed: false,
      spd: 5.0,
      d: busLoop.T * 0.666, // exactly 2/3 loop ahead
      lp: { ...busLoop, v: 3.2 },
    },
  ];

  // Lane 2: Inner Baggage Service Lane (z = 12 to 20, 16m away from bus lane)
  // Baggage trains ONLY run here, never on bus lane or through buildings!
  const bagLoop = loopPts(-105, 105, 12, 20, 3.8);
  const baggageTrains: AirportFlight[] = [
    {
      id: 'BAG-04',
      type: 'gse',
      subType: 'baggage',
      route: 'Luggage Sorting Hall ↔ Flights Concourse A/B',
      m: makeBaggageTrain(),
      status: 'Baggage Dispatch',
      kmh: 24,
      delayed: false,
      spd: 4.2,
      d: 0,
      lp: { ...bagLoop, v: 2.8 },
    },
    {
      id: 'BAG-08',
      type: 'gse',
      subType: 'baggage',
      route: 'Cargo Sorting Terminal ↔ Flights Pier C',
      m: makeBaggageTrain(),
      status: 'Transferring Bags',
      kmh: 22,
      delayed: false,
      spd: 4.0,
      d: bagLoop.T * 0.50, // 180° away from BAG-04
      lp: { ...bagLoop, v: 2.8 },
    },
  ];

  // Lane 3: Runway Safety Perimeter Patrol Lane (z = 62 to 70)
  const followMeLoop = loopPts(-130, 130, 62, 70, 4.0);
  const followMe: AirportFlight = {
    id: 'FLW-01',
    type: 'gse',
    subType: 'followme',
    route: 'Runway 09L / 09R Safety Inspection Patrol',
    m: makeFollowMeCar(),
    status: 'Runway Safety Patrol',
    kmh: 50,
    delayed: false,
    spd: 8.5,
    d: 0,
    lp: { ...followMeLoop, v: 5.5 },
  };

  // Lane 4: Landside Terminal Access Road (z = -94 to -104, in front of terminal)
  const taxiLoop = loopPts(-85, 85, -104, -94, 4.5);
  const taxis: AirportFlight[] = [
    {
      id: 'TAXI-22',
      type: 'taxi',
      subType: 'taxi',
      route: 'Terminal Arrivals Curb ↔ Downtown City Center',
      m: makeTaxi(),
      status: 'Passenger Pickup',
      kmh: 36,
      delayed: false,
      spd: 6.0,
      d: 0,
      lp: { ...taxiLoop, v: 3.8 },
    },
    {
      id: 'TAXI-84',
      type: 'taxi',
      subType: 'taxi',
      route: 'Terminal Departures Drop-Off Loop',
      m: makeTaxi(),
      status: 'En Route',
      kmh: 38,
      delayed: false,
      spd: 6.2,
      d: taxiLoop.T * 0.50, // 180° away from TAXI-22
      lp: { ...taxiLoop, v: 3.8 },
    },
  ];

  // Selection ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 3.8, 40),
    new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  S.add(ring);

  // Combine flights for tracking
  const allFlights: AirportFlight[] = [
    takeoffPlane,
    landingPlane,
    dockingPlane,
    cruisingPlane,
    ...buses,
    ...parkedPlanes,
    ...baggageTrains,
    followMe,
    ...taxis,
    ...gateGSE,
  ];

  // Airport Sim metrics
  const M: AirportMetrics = {
    flightsToday: 348,
    onTimePercent: 97.4,
    delayedCount: 9,
    airborneCount: 3,
    activeRunways: 2,
    fuelDispatchedKGal: 428.0,
    baggageTurnaroundMin: 13.8,
    gseVehiclesActive: 18,
    runwayThroughput: [24, 28, 32, 30, 34, 38, 36, 42, 40, 44, 46, 48, 44, 42, 45],
    departureDelayMin: [4, 6, 3, 2, 8, 5, 2, 1, 4, 3, 2, 5, 3, 2, 4],
    baggageTimeline: [15, 14, 16, 13, 14, 15, 12, 14, 13, 15, 14, 13, 14, 12, 14],
    airspaceLoad: [65, 72, 78, 82, 80, 85, 88, 92, 86, 84, 88, 90, 87, 85, 89],
  };

  return {
    renderer: R,
    scene: S,
    camera: cam,
    flights: allFlights,
    radars,
    beaconM,
    approachLights,
    runwayLights: [],
    strobes: [],
    ring,
    M,
    simT: 0,
    _takeoffPlane: takeoffPlane,
    _landingPlane: landingPlane,
    _dockingPlane: dockingPlane,
    _cruisingPlane: cruisingPlane,
    _buses: buses,
    _baggageTrains: baggageTrains,
    _followMe: followMe,
    _taxis: taxis,
    _dockingBridgeCab: dockingBridgeCabGroup,
  };
}
