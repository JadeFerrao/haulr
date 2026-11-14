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

  // ── PROMINENT "AIRPORT" 3D HOARDING SIGNS ON BOTH SIDES ─────────────────────
  // Requirement 5: "AIRPORT hoarding on both sides! - fix"
  
  // Function to create one complete AIRPORT sign
  const createAirportSign = () => {
    const signGroup = new THREE.Group();
    
    // Large hoarding board structure (white background)
    box(50, 8.0, 1.2, 0xffffff, 0, 0, 0, true, signGroup);
    // Frame border
    box(52, 8.5, 0.8, 0x2a2a2a, 0, 0, -0.5, true, signGroup);
    
    // Create actual 3D "AIRPORT" text using box geometry
    const createLetter = (shape: string, x: number) => {
      const letterGroup = new THREE.Group();
      
      switch(shape) {
        case 'A':
          box(1.2, 5.5, 0.8, 0xff0000, x - 1.5, 0, 0.7, true, letterGroup);
          box(1.2, 5.5, 0.8, 0xff0000, x + 1.5, 0, 0.7, true, letterGroup);
          box(3.0, 1.0, 0.8, 0xff0000, x, 2.25, 0.7, false, letterGroup);
          box(2.4, 0.9, 0.8, 0xff0000, x, 0, 0.7, false, letterGroup);
          break;
        case 'I':
          box(1.2, 5.5, 0.8, 0xff0000, x, 0, 0.7, true, letterGroup);
          break;
        case 'R':
          box(1.2, 5.5, 0.8, 0xff0000, x - 1.2, 0, 0.7, true, letterGroup);
          box(2.4, 1.0, 0.8, 0xff0000, x, 2.25, 0.7, false, letterGroup);
          box(2.4, 1.0, 0.8, 0xff0000, x, 0.5, 0.7, false, letterGroup);
          box(1.8, 3.0, 0.8, 0xff0000, x + 0.9, -1.25, 0.7, true, letterGroup);
          break;
        case 'P':
          box(1.2, 5.5, 0.8, 0xff0000, x - 1.2, 0, 0.7, true, letterGroup);
          box(2.4, 1.0, 0.8, 0xff0000, x, 2.25, 0.7, false, letterGroup);
          box(2.4, 1.0, 0.8, 0xff0000, x, 0.5, 0.7, false, letterGroup);
          box(1.2, 2.0, 0.8, 0xff0000, x + 1.2, 1.4, 0.7, true, letterGroup);
          break;
        case 'O':
          box(1.2, 5.5, 0.8, 0xff0000, x - 1.5, 0, 0.7, true, letterGroup);
          box(1.2, 5.5, 0.8, 0xff0000, x + 1.5, 0, 0.7, true, letterGroup);
          box(3.0, 1.0, 0.8, 0xff0000, x, 2.25, 0.7, false, letterGroup);
          box(3.0, 1.0, 0.8, 0xff0000, x, -2.25, 0.7, false, letterGroup);
          break;
        case 'T':
          box(5.0, 1.0, 0.8, 0xff0000, x, 2.25, 0.7, false, letterGroup);
          box(1.2, 5.5, 0.8, 0xff0000, x, 0, 0.7, true, letterGroup);
          break;
      }
      return letterGroup;
    };
    
    // Position letters: A I R P O R T
    const letters = [
      { char: 'A', x: -18 },
      { char: 'I', x: -12 },
      { char: 'R', x: -6 },
      { char: 'P', x: 0 },
      { char: 'O', x: 6 },
      { char: 'R', x: 12 },
      { char: 'T', x: 18 }
    ];
    
    letters.forEach(({ char, x }) => {
      const letter = createLetter(char, x);
      signGroup.add(letter);
    });
    
    return signGroup;
  };
  
  // SIGN 1: Runway-facing side (faces South toward runways)
  const sign1 = createAirportSign();
  sign1.position.set(0, 18, -64);
  sign1.rotation.y = 0; // Face South (toward runways)
  S.add(sign1);
  
  // SIGN 2: Landside/Arrivals facing side (faces North toward parking/taxis)
  const sign2 = createAirportSign();
  sign2.position.set(0, 18, -64);
  sign2.rotation.y = Math.PI; // Face North (toward car park/taxis)
  S.add(sign2);

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

  // ── 1. SEPARATE TAXI ZONE & CAR PARK WITH ENTRY/EXIT GATES ───────────────────
  // Requirement 2: "i need a separate taxi section for taxis & separate for car park, 
  // add a gate to show cars entering car park and going out"
  
  // ─── A. CAR PARK ZONE (West Side: z = -130 to -170, x = -75 to -15) ─────────
  const carParkBase = new THREE.Mesh(
    new THREE.PlaneGeometry(62, 42),
    new THREE.MeshStandardMaterial({ color: dark ? 0x131a28 : 0x3d4a60, roughness: 0.88 })
  );
  carParkBase.rotation.x = -Math.PI / 2;
  carParkBase.position.set(-45, 0.16, -150);
  carParkBase.receiveShadow = true;
  S.add(carParkBase);

  // Car park perimeter barriers
  box(63, 0.35, 0.35, C.mast, -45, 0.25, -128.5, false, S);
  box(63, 0.35, 0.35, C.mast, -45, 0.25, -171.5, false, S);
  box(0.35, 0.35, 43, C.mast, -76.2, 0.25, -150, false, S);
  box(0.35, 0.35, 43, C.mast, -13.8, 0.25, -150, false, S);

  // CAR PARK ENTRY GATE (South entrance at z = -172)
  box(6.5, 2.8, 0.4, 0xe8850c, -45, 1.6, -172, true, S); // Orange gate booth
  box(0.25, 0.35, 0.35, 0xff3030, -48.5, 0.4, -172, false, S); // Red barrier arm (lowered)
  box(0.25, 0.35, 0.35, 0xff3030, -41.5, 0.4, -172, false, S);
  const entrySign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x2fb5a2 })
  );
  entrySign.rotation.y = Math.PI;
  entrySign.position.set(-45, 3.8, -172.5);
  S.add(entrySign);

  // CAR PARK EXIT GATE (North exit at z = -128)
  box(6.5, 2.8, 0.4, 0xe8850c, -45, 1.6, -128, true, S);
  box(0.25, 0.35, 0.35, 0x2fb5a2, -48.5, 0.4, -128, false, S); // Green barrier (open)
  box(0.25, 0.35, 0.35, 0x2fb5a2, -41.5, 0.4, -128, false, S);
  const exitSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xff8c00 })
  );
  exitSign.position.set(-45, 3.8, -127.5);
  S.add(exitSign);

  // Overhead parking lot lighting
  [-58, -45, -32].forEach(lx => {
    cyl(0.22, 0.22, 8.5, C.mast, lx, 4.3, -150, 8, S);
    box(3.2, 0.28, 0.6, 0xffffff, lx, 8.6, -150, false, S);
    cyl(0.65, 0.65, 0.7, 0xadb5bd, lx, 0.45, -150, 8, S);
  });

  // Parking stalls with wheel stops and painted divider lines
  const carParkRows = [
    { stallZ: -162, aisleZ: -156, bumperZ: -164.2, faceNorth: false },
    { stallZ: -150, aisleZ: -156, bumperZ: -147.8, faceNorth: true },
    { stallZ: -144, aisleZ: -138, bumperZ: -146.2, faceNorth: false },
    { stallZ: -132, aisleZ: -138, bumperZ: -129.8, faceNorth: true },
  ];

  carParkRows.forEach(row => {
    for (let x = -70; x <= -20; x += 3.4) {
      // White parking stall divider lines
      const pLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 5.2), markWhite);
      pLine.rotation.x = -Math.PI / 2;
      pLine.position.set(x, 0.20, row.stallZ);
      S.add(pLine);
      // Concrete wheel-stop curb
      box(2.0, 0.16, 0.32, 0xced4da, x + 1.7, 0.22, row.bumperZ, false, S);
    }
  });

  // Directional road arrows on drive aisles
  [-58, -45, -32].forEach(ax => {
    [-156, -138].forEach(az => {
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), markWhite);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(ax, 0.19, az);
      S.add(arrow);
    });
  });

  // ─── B. TAXI ZONE (East Side: z = -130 to -170, x = 15 to 75) ───────────────
  const taxiZoneBase = new THREE.Mesh(
    new THREE.PlaneGeometry(62, 42),
    new THREE.MeshStandardMaterial({ color: dark ? 0x1a2233 : 0x445268, roughness: 0.85 })
  );
  taxiZoneBase.rotation.x = -Math.PI / 2;
  taxiZoneBase.position.set(45, 0.16, -150);
  taxiZoneBase.receiveShadow = true;
  S.add(taxiZoneBase);

  // Taxi zone perimeter curbs
  box(63, 0.35, 0.35, C.warn, 45, 0.25, -128.5, false, S); // Yellow curb
  box(63, 0.35, 0.35, C.warn, 45, 0.25, -171.5, false, S);
  box(0.35, 0.35, 43, C.warn, 13.8, 0.25, -150, false, S);
  box(0.35, 0.35, 43, C.warn, 76.2, 0.25, -150, false, S);

  // Taxi queue shelters with canopies
  [35, 45, 55].forEach(tx => {
    box(7.5, 3.2, 3.2, dark ? 0x1e2d42 : 0x4a5d7a, tx, 1.8, -150, true, S);
    box(8.0, 0.35, 3.6, 0xffcb2b, tx, 3.6, -150, false, S); // Yellow roof
  });

  // Taxi zone signage
  const taxiSign = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xffcb2b })
  );
  taxiSign.position.set(45, 5.5, -128);
  S.add(taxiSign);

  // Builder for realistic detailed cars
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

  // Park 100+ cars inside marked stalls in CAR PARK zone only
  // Cars face drive aisle (perpendicular parking)
  carParkRows.forEach(row => {
    for (let x = -68.3; x <= -21.7; x += 3.4) {
      if (rnd() > 0.87) continue; // realistic empty spaces
      const cType = carTypes[Math.floor(rnd() * carTypes.length)];
      const cHex = carColors[Math.floor(rnd() * carColors.length)];
      const car = makeRealisticCar(cType, cHex);
      const zOffset = (rnd() - 0.5) * 0.3;
      car.position.set(x, 0, row.stallZ + zOffset);
      car.rotation.y = row.faceNorth ? Math.PI / 2 : -Math.PI / 2;
      S.add(car);
    }
  });

  // ── 2. EXPANDED CIRCULAR AIRPORT TERMINAL COMPLEX ────────────────────────────
  // User Requirement 3 & 5: "make the main airport circular or something, unique and big"
  // Central Departure/Arrival Rotunda (iconic circular design)
  const terminalRadius = 22;
  cyl(terminalRadius, terminalRadius, 10.5, C.bld, 0, 5.25, -64, 32, S);
  cyl(terminalRadius + 2, terminalRadius + 2, 0.9, C.roof, 0, 10.8, -64, 32, S);
  
  // Panoramic glass curtain wall wrapping the circular terminal
  const glassRing = new THREE.Mesh(
    new THREE.CylinderGeometry(terminalRadius + 0.1, terminalRadius + 0.1, 7.0, 32, 1, true),
    new THREE.MeshStandardMaterial({ 
      color: C.glass, 
      transparent: true, 
      opacity: 0.35, 
      side: THREE.DoubleSide 
    })
  );
  glassRing.position.set(0, 5.5, -64);
  S.add(glassRing);
  
  // Rectangular wing extensions connecting to concourses
  box(150, 9.4, 12, C.bld, 0, 4.7, -50, true, S);
  box(154, 0.8, 14, C.roof, 0, 9.8, -50, true, S);
  box(148, 6.0, 0.25, C.glass, 0, 4.5, -43.8, false, S);

  // 3 Concourse Piers (Concourse A, B, C extending into apron)
  // WIDER piers so planes dock against the face at z = -2 (front wall)
  const concourses = [-65, 0, 65];
  concourses.forEach(px => {
    box(22, 5.8, 50, C.bld, px, 2.9, -27, true, S);
    box(23, 0.5, 51, C.roof, px, 6.0, -27, true, S);
    // Glass walls
    box(0.25, 4.0, 48, C.glass, px + 11.05, 3.0, -27, false, S);
    box(0.25, 4.0, 48, C.glass, px - 11.05, 3.0, -27, false, S);
    // Apron-facing glass front wall
    box(20, 4.0, 0.25, C.glass, px, 3.0, -2, false, S);
  });

  // West Apron Hangar & Freight Logistics Hub
  box(42, 12.0, 30, dark ? 0x18243b : 0xd8e3f2, -125, 6.0, -15, true, S);
  box(44, 0.6, 32, C.roof, -125, 12.3, -15, true, S);
  box(36, 9.2, 0.25, dark ? 0x0f1828 : 0x24324a, -125, 5.0, 0.1, false, S);

  // ── 3. GREY TRANSPARENT PASSENGER BOARDING BRIDGES (AEROBRIDGES) ────────────
  // ── 3. GREY TRANSPARENT PASSENGER BOARDING BRIDGES (AEROBRIDGES) ────────────
  // REFERENCE: Planes park PARALLEL to concourse SIDE walls, nose pointing east/west (±X).
  // Jetbridge extends from concourse SIDE WALL in the X direction to plane door.
  //
  // Plane local: nose=+Z, door1L at (x=-1.25, z=+6.2)
  // Parked nose-east (rotation.y = -PI/2):
  //   door1L world = plane_pos + rotate((-1.25,0,6.2), -PI/2) = plane_pos + (6.2, 0, 1.25)
  //   → door at (planeX+6.2,  planeZ+1.25)
  //
  // Gate layout (all planes at z = -16 to -20, apron zone):
  //   Concourse A east wall (x=-54): planes nose east at x=-40, z=-24 & z=-8
  //   Concourse B east wall (x= 11): planes nose east at x= 23, z=-24 & z=-8
  //   Concourse C west wall (x= 54): plane  nose west at x= 68, z=-16

  const glassBridgeMat = new THREE.MeshStandardMaterial({
    color: 0x94a6bc,
    transparent: true,
    opacity: 0.55,
    roughness: 0.12,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });

  interface JetBridgeConfig {
    wallX: number;    // concourse side wall X
    doorX: number;    // plane door X (bridge endpoint)
    doorZ: number;    // plane door Z (and bridge Z centreline)
    gateName: string;
  }

  const jetBridges: JetBridgeConfig[] = [
    // Concourse A east wall (x=-54), planes nose-east at x=-40, z=-26 and z=4
    // Door at planeX - 6.2 = -46.2, planeZ + 1.25
    { wallX: -54, doorX: -46.2, doorZ: -24.75, gateName: 'GATE A1' },
    { wallX: -54, doorX: -46.2, doorZ:   5.25, gateName: 'GATE A2' },
    // Concourse B east wall (x=11), planes nose-east at x=23, z=-26 and z=4
    // Door at planeX - 6.2 = 16.8, planeZ + 1.25
    { wallX: 11,  doorX:  16.8, doorZ: -24.75, gateName: 'GATE B1' },
    { wallX: 11,  doorX:  16.8, doorZ:   5.25, gateName: 'GATE B2' },
    // Concourse C west wall (x=54), plane nose-west (rot +PI/2) at x=68, z=-11
    // For nose-west: local +Z → world +X, door local(-1.25,0,6.2) → world(+6.2, 0, -1.25) relative
    // Door world = (68+6.2, -11-1.25) = (74.2, -12.25)
    { wallX: 54,  doorX:  74.2, doorZ: -12.25, gateName: 'GATE C1' },
  ];

  let dockingBridgeCabGroup: THREE.Group | undefined;

  jetBridges.forEach(jb => {
    const spanX = Math.abs(jb.doorX - jb.wallX);
    const midX  = (jb.wallX + jb.doorX) / 2;
    const bz    = jb.doorZ;
    const dir   = jb.doorX > jb.wallX ? 1 : -1; // bridge goes east (+1) or west (-1)

    // 1. Yellow tarmac guide line (runs Z, marks parking spot)
    const leadIn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 22), markYellow);
    leadIn.rotation.x = -Math.PI / 2;
    leadIn.position.set(jb.doorX, 0.24, bz + 11);
    S.add(leadIn);

    const stopBar = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.4), markYellow);
    stopBar.rotation.x = -Math.PI / 2;
    stopBar.position.set(jb.doorX, 0.25, bz);
    S.add(stopBar);

    // 2. Gate rotunda pedestal on concourse side wall
    cyl(1.2, 1.2, 4.0, C.navy, jb.wallX, 2.0, bz, 12, S);
    box(0.2, 0.8, 1.8, 0x111c2e, jb.wallX - dir * 0.5, 3.4, bz, false, S);

    // 3. Glass walkway bridge (runs in X direction)
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.22, 2.0), mat(0x2b384c));
    floorMesh.position.set(midX, 1.6, bz);
    floorMesh.castShadow = true;
    S.add(floorMesh);

    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.22, 2.1), mat(0x48566d));
    roofMesh.position.set(midX, 3.8, bz);
    S.add(roofMesh);

    // Glass side walls (face north/south, run in X)
    const gWall1 = new THREE.Mesh(new THREE.BoxGeometry(spanX, 2.0, 0.08), glassBridgeMat);
    gWall1.position.set(midX, 2.7, bz + 1.0);
    S.add(gWall1);
    const gWall2 = new THREE.Mesh(new THREE.BoxGeometry(spanX, 2.0, 0.08), glassBridgeMat);
    gWall2.position.set(midX, 2.7, bz - 1.0);
    S.add(gWall2);

    // Vertical mullions
    for (let xOff = 0; xOff <= spanX; xOff += 2.4) {
      const mx = jb.wallX + dir * xOff;
      cyl(0.08, 0.08, 2.0, C.mast, mx, 2.7, bz + 1.0, 6, S);
      cyl(0.08, 0.08, 2.0, C.mast, mx, 2.7, bz - 1.0, 6, S);
    }

    // 4. Ground support column at door end
    cyl(0.18, 0.18, 1.5, C.mast, jb.doorX, 0.8, bz, 8, S);

    // 5. Docking cab (bellows face plane in X direction)
    const cabGroup = new THREE.Group();
    box(2.2, 2.3, 2.2, 0x263345, 0, 0, 0, true, cabGroup);
    box(0.3, 2.1, 1.9, 0x11141a, dir * 1.15, 0, 0, false, cabGroup);
    cabGroup.position.set(jb.doorX, 2.7, bz);
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

  // Baggage Tractor + 4 trailing carts (tractor faces +Z, carts trail in -Z)
  // FIX: Carts BEHIND the tractor like a real train — tractor leads, carts follow
  function makeBaggageTrain(): THREE.Group {
    const g = new THREE.Group();

    // ── TRACTOR (leads the train) ──
    // Body
    box(2.2, 1.4, 3.0, C.warn, 0, 0.9, 0, true, g);
    // Cab
    box(2.0, 1.2, 1.4, dark ? 0x1c283f : 0x364868, 0, 1.9, 0.6, true, g);
    // Windshield
    box(1.8, 0.8, 0.1, C.glass, 0, 2.0, 1.32, false, g);
    // Headlights
    box(0.4, 0.3, 0.1, 0xffffff, 0.6, 1.1, 1.52, false, g);
    box(0.4, 0.3, 0.1, 0xffffff, -0.6, 1.1, 1.52, false, g);
    // Amber flashing light on roof
    box(0.4, 0.25, 0.4, 0xffaa00, 0, 2.6, 0.5, false, g);
    // Tractor wheels (rotation.x = PI/2 so they roll forward)
    const twg = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12);
    [[-0.9, 0.9], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(twg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.38, wz);
      w.castShadow = true;
      g.add(w);
    });

    // ── 4 CARTS trailing BEHIND (-Z direction) ──
    const cartColors = [C.blue, dark ? 0x4fd1bd : 0x2fb5a2, C.navy, C.warn];
    const cartSpacing = 3.5; // gap between front of one cart and front of next

    for (let c = 1; c <= 4; c++) {
      const cz = -(c * cartSpacing + 1.5); // behind tractor rear

      // Cart flat-bed platform
      box(2.4, 0.35, 2.8, 0x5a6d8c, 0, 0.35, cz, true, g);

      // Coupling rod from previous element to this cart
      box(0.14, 0.14, cartSpacing - 2.6, 0x888888, 0, 0.42, cz + (cartSpacing - 2.6) / 2 + 1.4, false, g);

      // Luggage items on the cart (2 rows of 2 bags each)
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          box(0.75, 0.55, 0.65, cartColors[(c + row + col) % 4],
            (col - 0.5) * 0.85, 0.75, cz - 0.55 + row * 0.75, true, g);
        }
      }

      // Cart wheels
      const cwg = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10);
      [[-0.9, 1.0], [0.9, 1.0], [-0.9, -1.0], [0.9, -1.0]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(cwg, mat(0x11182c));
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.28, cz + wz);
        g.add(w);
      });
    }

    g.scale.setScalar(0.78);
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

  // Passenger Boarding Stairs / Ladder Truck
  function makeLadderTruck(): THREE.Group {
    const g = new THREE.Group();
    // Truck chassis
    box(3.2, 1.4, 2.0, C.warn, 0, 0.9, 0, true, g);
    box(1.2, 1.1, 1.8, dark ? 0x1c283f : 0x364868, 0.8, 1.75, 0, true, g);
    box(0.08, 0.75, 1.5, C.glass, 1.52, 1.8, 0, false, g);
    
    // Extendable stairs platform (elevated)
    box(2.5, 0.3, 1.8, 0xced4da, -1.0, 2.8, 0, false, g);
    // Stairs steps
    for (let s = 0; s < 5; s++) {
      const sz = -0.7 + s * 0.35;
      box(2.3, 0.12, 0.28, 0x8a95a1, -1.0, 2.9 - s * 0.22, sz, false, g);
    }
    // Handrails
    box(0.08, 1.4, 1.9, 0xffffff, -2.15, 3.2, 0, false, g);
    box(0.08, 1.4, 1.9, 0xffffff, 0.15, 3.2, 0, false, g);
    
    // Support columns
    cyl(0.12, 0.12, 2.0, C.mast, -1.0, 1.8, 0.8, 8, g);
    cyl(0.12, 0.12, 2.0, C.mast, -1.0, 1.8, -0.8, 8, g);
    
    // Wheels
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 12);
    [[-1.2, 0.95], [1.2, 0.95], [-1.2, -0.95], [1.2, -0.95]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.44, z);
      w.castShadow = true;
      g.add(w);
    });
    
    g.scale.setScalar(0.72);
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
  // User Requirement 7: "planes enter to park head 1st not tail reverse (they are not cars)"
  // All planes are parked NOSE/HEAD-FIRST facing the terminal building (North orientation)
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

  // Position parked planes PARALLEL to concourse SIDE walls, nose east/west (±X)
  // This matches the reference image exactly.
  //
  // Concourse A east wall at x=-54:
  //   Planes nose east (rotation.y=-PI/2) at x=-40, door=(x+6.2, z+1.25)
  //   Gate A1: planePos=(-40,-24) → door=(-33.8,-22.75) ✓
  //   Gate A2: planePos=(-40, -8) → door=(-33.8, -6.75) ✓
  //
  // Concourse B east wall at x=11:
  //   Planes at x=23 → door=(29.2, z+1.25)
  //   Gate B1: planePos=(23,-24) → door=(29.2,-22.75) ✓
  //   Gate B2: planePos=(23, -8) → door=(29.2, -6.75) ✓
  //
  // Concourse C west wall at x=54:
  //   Plane nose west (rotation.y=+PI/2) at x=68 → door=(68-6.2, z-1.25)=(61.8,-17.25) ✓

  // PA-881 — Gate A1 (Concourse A, nose east) — 30 unit Z spacing
  parkedPlanes[0].m.position.set(-40, 1.8, -26);
  parkedPlanes[0].m.rotation.y = -Math.PI / 2;

  // LH-318 — Gate A2 (Concourse A, nose east) — 30 units further north
  parkedPlanes[1].m.position.set(-40, 1.8, 4);
  parkedPlanes[1].m.rotation.y = -Math.PI / 2;

  // BA-109 — Gate B1 (Concourse B, nose east) — 30 unit Z spacing
  parkedPlanes[2].m.position.set(23, 1.8, -26);
  parkedPlanes[2].m.rotation.y = -Math.PI / 2;

  // QR-502 — Gate B2 (Concourse B, nose east)
  parkedPlanes[3].m.position.set(23, 1.8, 4);
  parkedPlanes[3].m.rotation.y = -Math.PI / 2;

  // AF-114 — Gate C1 (Concourse C, nose west)
  parkedPlanes[4].m.position.set(68, 1.8, -11);
  parkedPlanes[4].m.rotation.y = Math.PI / 2;

  // Ground service equipment safely docked at stands
  const gateGSE: AirportFlight[] = [
    { id: 'TUG-01', type: 'gse', subType: 'tug', route: 'Gate A1 · Pushback Tug Attached to Nosegear', m: makePushbackTug(), status: 'Tug Connected', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'FUEL-02', type: 'gse', subType: 'fuel', route: 'Gate B2 · Underwing Hydrant Fuel Truck', m: makeFuelTruck(), status: 'Hydrant Active', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'LADD-01', type: 'gse', subType: 'ladder', route: 'Gate A2 · Passenger Boarding Stairs', m: makeLadderTruck(), status: 'Stairs Extended', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'LADD-02', type: 'gse', subType: 'ladder', route: 'Gate C2 · Passenger Disembarkation', m: makeLadderTruck(), status: 'At Aircraft Door', kmh: 0, delayed: false, spd: 0, d: 0 },
  ];
  
  // Position GSE vehicles next to their assigned aircraft (updated positions)
  gateGSE[0].m.position.set(-40, 0, -38);  // Tug at A1 nose gear (nose faces west → nose tip at x=-40-11=-51)
  gateGSE[0].m.rotation.y = -Math.PI / 2;

  gateGSE[1].m.position.set(23, 0, -4);    // Fuel truck under B2 wing
  gateGSE[1].m.rotation.y = 0;

  gateGSE[2].m.position.set(-44, 0, 4);    // Ladder at A2 door
  gateGSE[2].m.rotation.y = -Math.PI / 2;

  gateGSE[3].m.position.set(72, 0, -11);   // Ladder at C1 door
  gateGSE[3].m.rotation.y = Math.PI / 2;

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
  // UPDATED: Now docks at Gate C2 (x=100, z=-30)
  const dockingPlane: AirportFlight = {
    id: 'SQ-012',
    type: 'airliner',
    subType: 'docking',
    route: 'Singapore SIN → Taxiing & Docking at Gate C2',
    m: makeAirplane(0x0e7c61, 1.0),
    status: 'Taxiing to Gate C2',
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

  // ── 6. COMPLETELY SEPARATE VEHICLE LANES ────────────────────────────────────
  // Buses: outer service road z=8 to z=28 (apron, south of terminal)
  // Baggage: inner service road z=48 to z=62 (between apron and taxiway at z=82)
  // These two zones have a 20-unit gap — zero overlap possible.
  const busLoop = loopPts(-85, 85, 8, 28, 5.0);
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
      d: busLoop.T * 0.125, // evenly spaced
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
      d: busLoop.T * 0.25, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-04',
      type: 'gse',
      subType: 'bus',
      route: 'Remote Stand Shuttle · Pier B ↔ Stand 15',
      m: makeApronBus(C.navy),
      status: 'En Route',
      kmh: 34,
      delayed: false,
      spd: 5.4,
      d: busLoop.T * 0.375, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-05',
      type: 'gse',
      subType: 'bus',
      route: 'Crew Transport · Operations Base ↔ Gate A1',
      m: makeApronBus(0xd9381e),
      status: 'Crew Transfer',
      kmh: 29,
      delayed: false,
      spd: 4.9,
      d: busLoop.T * 0.50, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-06',
      type: 'gse',
      subType: 'bus',
      route: 'International Arrivals · Immigration ↔ Terminal',
      m: makeApronBus(0x8a2be2),
      status: 'Passenger Disembark',
      kmh: 31,
      delayed: false,
      spd: 5.1,
      d: busLoop.T * 0.625, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-07',
      type: 'gse',
      subType: 'bus',
      route: 'Hangar Transfer · Maintenance Bay ↔ Apron',
      m: makeApronBus(0x0e7c61),
      status: 'Service Active',
      kmh: 27,
      delayed: false,
      spd: 4.7,
      d: busLoop.T * 0.75, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
    {
      id: 'BUS-08',
      type: 'gse',
      subType: 'bus',
      route: 'VIP Lounge · Private Terminal ↔ Gate C2',
      m: makeApronBus(0xd9801a),
      status: 'VIP Transport',
      kmh: 26,
      delayed: false,
      spd: 4.6,
      d: busLoop.T * 0.875, // evenly spaced
      lp: { ...busLoop, v: 3.2 },
    },
  ];

  // FIX 2: Baggage loop on completely separate road: z=48 to z=62 (clear of bus z=8-28)
  const bagLoop = loopPts(-75, 75, 48, 62, 4.0);
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

  // Lane 4: Landside Terminal Taxi Stand & Access Road
  // FIX: Taxis must be VISIBLE at taxi stand zone (z = -130 to -170, x = 15 to 75)
  const taxiLoop = loopPts(15, 75, -160, -135, 4.5);
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
      d: taxiLoop.T * 0.33, // 1/3 around loop
      lp: { ...taxiLoop, v: 3.8 },
    },
    {
      id: 'TAXI-91',
      type: 'taxi',
      subType: 'taxi',
      route: 'Taxi Queue · Waiting for Passenger',
      m: makeTaxi(),
      status: 'Queued',
      kmh: 28,
      delayed: false,
      spd: 5.5,
      d: taxiLoop.T * 0.66, // 2/3 around loop
      lp: { ...taxiLoop, v: 3.8 },
    },
  ];

  // Add stationary taxis parked at taxi stand shelters
  const stationaryTaxis: AirportFlight[] = [];
  [35, 45, 55].forEach((tx, idx) => {
    const taxiParked: AirportFlight = {
      id: `TAXI-${100 + idx}`,
      type: 'taxi',
      subType: 'taxi',
      route: 'Taxi Stand · Awaiting Passenger',
      m: makeTaxi(),
      status: 'At Stand',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    };
    taxiParked.m.position.set(tx, 0, -150);
    taxiParked.m.rotation.y = Math.PI / 2;
    stationaryTaxis.push(taxiParked);
  });

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
    ...stationaryTaxis,
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
