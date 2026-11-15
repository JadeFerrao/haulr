import * as THREE from 'three';
import {
  buildColors, mat, bas, box, cyl, rnd, resetSeed, smooth,
  loopPts, at, type LoopPath
} from './threeHelpers';

export interface AirportFlight {
  id: string;
  type: 'airliner' | 'gse' | 'taxi' | 'car';
  subType: 'landing' | 'takeoff' | 'cruise' | 'parked' | 'docking' | 'tug' | 'fuel' | 'ladder' | 'baggage' | 'bus' | 'catering' | 'followme' | 'taxi' | 'car';
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
  _takeoffPlane?: AirportFlight;
  _landingPlane?: AirportFlight;
  _dockingPlane: AirportFlight;
  _cruisingPlane: AirportFlight;
  _buses: AirportFlight[];
  _baggageTrains: AirportFlight[];
  _cateringTrucks: AirportFlight[];
  _ladderTrucks: AirportFlight[];
  _followMe: AirportFlight;
  _taxis: AirportFlight[];
  _dockingBridgeCab?: THREE.Group;
  _carParkLiftGateArm?: THREE.Group;
  _enteringCar?: AirportFlight;
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

  // ── DUAL INDEPENDENT RUNWAYS (SPACED FAR FROM APRON VEHICLES) ───────────────
  // User Requirement 2: "keep them away from runway so colliding doesnt take place"
  // Runway 09L/27R (Takeoffs: EK-204 Eastbound, SQ-012 Westbound) at rwyZ = 106
  // Runway 09R (Arrivals / Landings - AF-402) at rwyZ = 145
  // Separated by 39 meters laterally, and 58+ meters south of all ground vehicles!
  const rwyLen = 380, rwyWid = 18;
  const RWYS = [
    { z: 106, name: '09L/27R' },
    { z: 145, name: '09R' },
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

  // Approach lighting towers leading to Runway 09L/27R (z = 106)
  for (let k = 1; k <= 8; k++) {
    const lx = -180 - k * 14;
    cyl(0.18, 0.18, 2 + k * 0.45, C.mast, lx, 1 + k * 0.22, 106, 8, S);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), appLightMat);
    lamp.position.set(lx, 2 + k * 0.45, 106);
    S.add(lamp);
    approachLights.push(lamp);
  }

  // Taxiways connecting Runway 09L/27R (z = 106) to Taxiway Alpha (z = 74)
  [-130, -65, 0, 65, 130].forEach(x => {
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(14, 32), taxiMat);
    tw.rotation.x = -Math.PI / 2;
    tw.position.set(x, 0.235, 90);
    tw.receiveShadow = true;
    S.add(tw);

    // Yellow taxi centerline
    const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 32), markYellow);
    yl.rotation.x = -Math.PI / 2;
    yl.position.set(x, 0.25, 90);
    S.add(yl);
  });

  // Dedicated Parallel Aircraft Taxiway Alpha at z = 74 (PLANES ONLY!)
  // Separated by 26+ meters from vehicle roads (z <= 48) — ZERO VEHICLE CONFLICT!
  const pTw = new THREE.Mesh(new THREE.PlaneGeometry(330, 14), taxiMat);
  pTw.rotation.x = -Math.PI / 2;
  pTw.position.set(0, 0.235, 74);
  pTw.receiveShadow = true;
  S.add(pTw);

  const pYl = new THREE.Mesh(new THREE.PlaneGeometry(330, 0.4), markYellow);
  pYl.rotation.x = -Math.PI / 2;
  pYl.position.set(0, 0.25, 74);
  S.add(pYl);

  // ── DEDICATED APRON VEHICLE ROADS (SPACED WELL AWAY FROM RUNWAYS) ────────────
  // User Requirement 2: "lot of space for these vehicles to roam keep them away from runway"
  // Road 1: Low-Floor Passenger Buses & Mobile GSE at z = 32 (z: 28.5 to 35.5)
  const serviceRoadMat = new THREE.MeshStandardMaterial({ color: dark ? 0x161d2a : 0x2b3446, roughness: 0.88 });
  const sRoad = new THREE.Mesh(new THREE.PlaneGeometry(280, 7.5), serviceRoadMat);
  sRoad.rotation.x = -Math.PI / 2;
  sRoad.position.set(10, 0.235, 32);
  sRoad.receiveShadow = true;
  S.add(sRoad);

  // White road boundary lines for Road 1
  [-3.6, 3.6].forEach(zOff => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(280, 0.25), markWhite);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(10, 0.245, 32 + zOff);
    S.add(edge);
  });

  // Road 2: Baggage Tractor Trains & Freight at z = 43 (z: 39.5 to 46.5)
  const sRoad2 = new THREE.Mesh(new THREE.PlaneGeometry(280, 7.5), serviceRoadMat);
  sRoad2.rotation.x = -Math.PI / 2;
  sRoad2.position.set(10, 0.235, 43);
  sRoad2.receiveShadow = true;
  S.add(sRoad2);

  [-3.6, 3.6].forEach(zOff => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(280, 0.25), markWhite);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(10, 0.245, 43 + zOff);
    S.add(edge);
  });

  // Dashed yellow centerlines along both Apron Service Roads
  for (let x = -125; x <= 145; x += 7) {
    const dash1 = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.25), markYellow);
    dash1.rotation.x = -Math.PI / 2;
    dash1.position.set(x, 0.246, 32);
    S.add(dash1);

    const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.25), markYellow);
    dash2.rotation.x = -Math.PI / 2;
    dash2.position.set(x, 0.246, 43);
    S.add(dash2);
  }

  // Red & White hatched safety boxes marking aircraft parking stands (z = -38 to 21)
  [
    { x: -55, z1: -24, z2: 6 },
    { x: 25, z1: -24, z2: 6 },
    { x: 105, z1: -24, z2: 6 }
  ].forEach(st => {
    [-15, 15].forEach(xOff => {
      const bdr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 44), markRed);
      bdr.rotation.x = -Math.PI / 2;
      bdr.position.set(st.x + xOff, 0.24, -9);
      S.add(bdr);
    });
    const frontBdr = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.3), markRed);
    frontBdr.rotation.x = -Math.PI / 2;
    frontBdr.position.set(st.x, 0.24, 22); // Stand safety boundary at z = 22
    S.add(frontBdr);
  });

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
    const x = -220 + rnd() * 440, z = -195 + rnd() * 350;
    // User Requirement 1: "remove trees from runway"
    // 100% CLEAR OF ENTIRE AIRFIELD, RUNWAYS, TAXIWAYS, AND APRON (z > 45)
    // Both Runway 09L/27R (z = 106) and Runway 09R (z = 145) are at z > 45, plus Taxiway Alpha (z = 74)
    if (z > 45) continue;
    // Clear of terminal complex, concourses, and apron stands
    if (x > -160 && x < 160 && z > -55) continue;
    // Clear of car park, taxi ranks, and entrance boulevard
    if (x > -95 && x < 95 && z > -180 && z < -45) continue;
    // Clear of ATC tower area (twX = -150, twZ = -75)
    if (x > -175 && x < -125 && z > -95 && z < -55) continue;
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

  // ── 3D HOARDING SIGN: "CAR PARK" ─────────────────────────────────────────────
  // User Requirement 2: "add a harding 'CAR PARK'"
  const carParkSignGroup = new THREE.Group();
  
  // Steel support pillars (two robust pylons)
  cyl(0.35, 0.35, 7.5, 0x223046, -56, 3.75, -174, 12, carParkSignGroup);
  cyl(0.35, 0.35, 7.5, 0x223046, -34, 3.75, -174, 12, carParkSignGroup);

  // Large billboard hoarding (28m wide, 4.6m high, white frame with deep navy face)
  box(28, 4.6, 0.7, 0x0a1e3f, -45, 6.8, -174, true, carParkSignGroup);
  box(28.6, 5.0, 0.5, 0xffffff, -45, 6.8, -174.2, false, carParkSignGroup);
  
  // Overhead floodlight armature
  box(26, 0.25, 0.8, 0x475569, -45, 9.3, -173.6, false, carParkSignGroup);

  // Blue Parking [P] badge on left
  box(3.2, 3.2, 0.4, 0x1d4ed8, -55.5, 6.8, -173.5, false, carParkSignGroup);
  box(3.4, 3.4, 0.2, 0xffffff, -55.5, 6.8, -173.7, false, carParkSignGroup);
  // 'P' letter inside badge
  box(0.42, 2.2, 0.3, 0xffffff, -56.2, 6.8, -173.2, false, carParkSignGroup);
  box(1.1, 0.38, 0.3, 0xffffff, -55.3, 7.7, -173.2, false, carParkSignGroup);
  box(1.1, 0.38, 0.3, 0xffffff, -55.3, 6.9, -173.2, false, carParkSignGroup);
  box(0.38, 1.1, 0.3, 0xffffff, -54.7, 7.3, -173.2, false, carParkSignGroup);

  // 3D Block Text: "CAR PARK"
  const addLetterBox = (w: number, h: number, lx: number, ly: number, col = 0xffffff) => {
    box(w, h, 0.4, col, lx, ly, -173.4, false, carParkSignGroup);
  };

  const drawLetter = (char: string, cx: number, cy: number) => {
    const col = 0xffffff;
    switch (char) {
      case 'C':
        addLetterBox(0.45, 2.4, cx - 0.8, cy, col);
        addLetterBox(1.7, 0.42, cx, cy + 0.99, col);
        addLetterBox(1.7, 0.42, cx, cy - 0.99, col);
        break;
      case 'A':
        addLetterBox(0.42, 2.4, cx - 0.7, cy, col);
        addLetterBox(0.42, 2.4, cx + 0.7, cy, col);
        addLetterBox(1.6, 0.42, cx, cy + 0.99, col);
        addLetterBox(1.3, 0.38, cx, cy, col);
        break;
      case 'R':
        addLetterBox(0.42, 2.4, cx - 0.7, cy, col);
        addLetterBox(1.3, 0.42, cx - 0.05, cy + 0.99, col);
        addLetterBox(1.3, 0.38, cx - 0.05, cy + 0.15, col);
        addLetterBox(0.42, 1.1, cx + 0.5, cy + 0.57, col);
        addLetterBox(0.45, 1.25, cx + 0.45, cy - 0.6, col);
        break;
      case 'P':
        addLetterBox(0.42, 2.4, cx - 0.7, cy, col);
        addLetterBox(1.3, 0.42, cx - 0.05, cy + 0.99, col);
        addLetterBox(1.3, 0.38, cx - 0.05, cy + 0.15, col);
        addLetterBox(0.42, 1.1, cx + 0.5, cy + 0.57, col);
        break;
      case 'K':
        addLetterBox(0.42, 2.4, cx - 0.7, cy, col);
        addLetterBox(0.45, 1.35, cx + 0.35, cy + 0.55, col);
        addLetterBox(0.45, 1.35, cx + 0.35, cy - 0.55, col);
        break;
    }
  };

  // Render "CAR"
  drawLetter('C', -50.8, 6.8);
  drawLetter('A', -47.8, 6.8);
  drawLetter('R', -44.8, 6.8);

  // Render "PARK"
  drawLetter('P', -40.6, 6.8);
  drawLetter('A', -37.6, 6.8);
  drawLetter('R', -34.6, 6.8);
  drawLetter('K', -31.6, 6.8);

  S.add(carParkSignGroup);

  // ── MOTORIZED LIFT GATE & CONTROL BOOTH ─────────────────────────────────────
  // User Requirement 2: "i need a proper lift gate - so cars stop then gate lift thrn cars enter into parking"
  // Concrete traffic median island
  box(1.2, 0.28, 4.8, 0xced4da, -47.6, 0.14, -171.5, false, S);
  
  // Toll / security attendant booth
  box(3.2, 2.8, 3.2, dark ? 0x1e293b : 0xe2e8f0, -50.2, 1.5, -171.5, true, S);
  box(3.4, 0.35, 3.4, 0x0f172a, -50.2, 3.05, -171.5, false, S); // roof
  box(2.8, 1.2, 3.24, C.glass, -50.2, 1.7, -171.5, false, S); // windows
  
  // Motorized barrier cabinet (yellow/orange pedestal)
  box(0.55, 1.35, 0.55, 0xf59e0b, -47.5, 0.8, -171.5, true, S);
  box(0.58, 0.15, 0.58, 0x1e293b, -47.5, 1.45, -171.5, false, S); // top cap
  cyl(0.12, 0.12, 0.18, 0xef4444, -47.5, 1.6, -171.5, 8, S); // status light
  
  // Ticket machine & NFC contactless reader kiosk
  box(0.4, 1.15, 0.35, 0x334155, -47.5, 0.7, -173.0, true, S);
  box(0.24, 0.16, 0.05, 0x10b981, -47.5, 0.9, -172.8, false, S); // green display

  // The Lift Arm Group (Pivot at x = -47.2, y = 1.15, z = -171.5)
  const carParkLiftGateArm = new THREE.Group();
  carParkLiftGateArm.position.set(-47.2, 1.15, -171.5);
  // Cylindrical pivot hub
  cyl(0.18, 0.18, 0.26, 0x1e293b, 0, 0, 0, 12, carParkLiftGateArm);
  // Striped reflective boom arm (spans across the lane in +X from x=0 to x=3.8m)
  for (let bi = 0; bi < 6; bi++) {
    const col = bi % 2 === 0 ? 0xef4444 : 0xffffff;
    box(0.6, 0.12, 0.06, col, 0.35 + bi * 0.6, 0, 0, false, carParkLiftGateArm);
  }
  // Soft rubber tip
  box(0.15, 0.14, 0.08, 0x111827, 3.85, 0, 0, false, carParkLiftGateArm);
  S.add(carParkLiftGateArm);

  // CAR PARK EXIT GATE (North exit at z = -128)
  box(3.2, 2.8, 3.2, dark ? 0x1e293b : 0xe2e8f0, -50.2, 1.5, -128, true, S);
  box(3.4, 0.35, 3.4, 0x0f172a, -50.2, 3.05, -128, false, S);
  box(0.55, 1.35, 0.55, 0x10b981, -47.5, 0.8, -128, true, S); // Green exit pedestal
  box(3.8, 0.12, 0.06, 0x10b981, -45.3, 1.15, -128, false, S); // Green open barrier arm

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

  // ── 2. EXPANDED AIRPORT TERMINAL COMPLEX ─────────────────────────────────────
  // Central Rotunda
  const terminalRadius = 22;
  cyl(terminalRadius, terminalRadius, 10.5, C.bld, 0, 5.25, -64, 32, S);
  cyl(terminalRadius + 2, terminalRadius + 2, 0.9, C.roof, 0, 10.8, -64, 32, S);
  const glassRing = new THREE.Mesh(
    new THREE.CylinderGeometry(terminalRadius + 0.1, terminalRadius + 0.1, 7.0, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  glassRing.position.set(0, 5.5, -64);
  S.add(glassRing);

  // Central connecting spine to concourses
  box(200, 9.4, 14, C.bld, 0, 4.7, -50, true, S);
  box(204, 0.8, 15, C.roof, 0, 9.8, -50, true, S);
  box(198, 6.0, 0.25, C.glass, 0, 4.5, -43, false, S);

  // ── 3 EXTENDED CONCOURSE PIERS: each is 18 wide × 68 deep (z = -50 to 18) ─────
  // Concourse A: x = -80 (walls at x=-89 and x=-71)
  // Concourse B: x =   0 (walls at x= -9 and x=  9)
  // Concourse C: x =  80 (walls at x= 71 and x= 89)
  // FIX (Req 1 & 5): Extended south to z = 18 so jetbridges at Gate A2, B2, C2 (z = 7.25)
  // attach seamlessly to the concourse walls! Zero gaps, zero floating bridges!
  // Concourse C planes park on outer EAST wall (x=89) at x=105 -> 100% clear of all buildings!
  const concourseDefs = [
    { cx: -80, walls: { inner: -89, outer: -71 } },
    { cx:   0, walls: { inner:  -9, outer:   9 } },
    { cx:  80, walls: { inner:  71, outer:  89 } },
  ];

  concourseDefs.forEach(c => {
    // Main concourse body extended to z = 18 (z from -50 to 18 -> depth 68, center -16)
    box(18, 5.8, 68, C.bld,  c.cx, 2.9, -16, true, S);
    box(19, 0.5, 69, C.roof, c.cx, 6.0, -16, true, S);
    // South apron-facing glass panoramic end wall
    box(16, 4.0, 0.25, C.glass, c.cx, 3.0, 18, false, S);
    // Side panoramic glass walls
    box(0.25, 4.0, 66, C.glass, c.cx + 9.1, 3.0, -16, false, S);
    box(0.25, 4.0, 66, C.glass, c.cx - 9.1, 3.0, -16, false, S);
  });

  // West Apron Hangar
  box(42, 12.0, 30, dark ? 0x18243b : 0xd8e3f2, -145, 6.0, -15, true, S);
  box(44, 0.6, 32, C.roof, -145, 12.3, -15, true, S);
  box(36, 9.2, 0.25, dark ? 0x0f1828 : 0x24324a, -145, 5.0, 0.1, false, S);

  // ── 3. GREY TRANSPARENT PASSENGER BOARDING BRIDGES ────────────────────────────
  // All jetbridges attach solidly to the concourse building walls at wallX
  // and reach aircraft door 1L at doorX (spanX = 9.8m)
  // Concourse A: wallX = -71 -> Gate A1 (z=-22.75) and Gate A2 (z=7.25)
  // Concourse B: wallX = 9   -> Gate B1 (z=-22.75) and Gate B2 (z=7.25)
  // Concourse C: wallX = 89  -> Gate C1 (z=-22.75) and Gate C2 (z=7.25)

  const glassBridgeMat = new THREE.MeshStandardMaterial({
    color: 0x94a6bc, transparent: true, opacity: 0.55,
    roughness: 0.12, metalness: 0.28, side: THREE.DoubleSide,
  });

  interface JetBridgeConfig {
    wallX: number; doorX: number; doorZ: number; gateName: string;
  }

  const jetBridges: JetBridgeConfig[] = [
    // Concourse A east wall x=-71, planes at x=-55 (z=-24 & z=6)
    { wallX: -71, doorX: -61.2, doorZ: -22.75, gateName: 'GATE A1' },
    { wallX: -71, doorX: -61.2, doorZ:   7.25, gateName: 'GATE A2' },
    // Concourse B east wall x=9, planes at x=25 (z=-24 & z=6)
    { wallX:   9, doorX:  18.8, doorZ: -22.75, gateName: 'GATE B1' },
    { wallX:   9, doorX:  18.8, doorZ:   7.25, gateName: 'GATE B2' },
    // Concourse C east wall x=89, planes at x=105 (z=-24 & z=6)
    // FIX: Planes park 16m EAST of wall -> completely outside building!
    { wallX:  89, doorX:  98.8, doorZ: -22.75, gateName: 'GATE C1' },
    { wallX:  89, doorX:  98.8, doorZ:   7.25, gateName: 'GATE C2' },
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

    if (jb.gateName === 'GATE C2') {
      dockingBridgeCabGroup = cabGroup;
    }
  });

  // ── AIR TRAFFIC CONTROL (ATC) TOWER (DISTANCED FROM AIRPORT BUILDINGS) ──────
  // User Requirement 3: "tower away from airport - distance it"
  // Moved from twX=-100, twZ=-46 (which clipped the terminal building!)
  // to twX = -150, twZ = -75 on its own dedicated stand-alone compound on the airfield perimeter!
  const twX = -150, twZ = -75;

  // Dedicated circular concrete foundation pad
  cyl(12, 12, 0.4, C.slab, twX, 0.2, twZ, 24, S);
  // Security perimeter curb around the tower base
  cyl(12.5, 12.5, 0.35, C.warn, twX, 0.3, twZ, 24, S);
  // ATC Ground Operations Annex building
  box(9.0, 3.2, 7.0, C.bld, twX + 7, 1.6, twZ, true, S);
  box(9.5, 0.4, 7.5, C.roof, twX + 7, 3.4, twZ, true, S);

  // Tower shaft & observation cab
  cyl(2.4, 3.6, 42, C.bld, twX, 21, twZ, 14, S);
  cyl(6.2, 4.4, 6.2, C.glass, twX, 43.5, twZ, 14, S);
  cyl(7.0, 7.0, 0.9, C.roof, twX, 47.0, twZ, 14, S);
  cyl(0.25, 0.25, 5.0, C.mast, twX, 50.0, twZ, 8, S);
  const radar = box(5.2, 0.45, 0.45, C.navy, twX, 52.8, twZ, true, S) as unknown as THREE.Mesh;
  const radars: THREE.Mesh[] = [radar];

  const beaconM = bas(0x2fe08a);
  const beaconSph = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 10), beaconM);
  beaconSph.position.set(twX, 53.8, twZ);
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
    // Low floor main body
    box(9.2, 2.3, 2.8, C.van, 0, 1.35, 0, true, g);
    // Panoramic wrap-around tinted passenger windows
    box(8.6, 1.0, 2.84, C.glass, 0, 1.65, 0, false, g);
    // Aerodynamic livery skirt stripe
    box(9.24, 0.4, 2.82, livery, 0, 0.6, 0, false, g);
    // Wide bi-fold passenger boarding doors with yellow safety edge strips (both sides)
    [-1.6, 1.6].forEach(dx => {
      // Left side doors
      box(1.7, 1.7, 0.08, dark ? 0x18243b : 0x364866, dx, 1.15, 1.42, false, g);
      box(0.08, 1.7, 0.1, 0xffcb2b, dx, 1.15, 1.43, false, g);
      // Right side doors
      box(1.7, 1.7, 0.08, dark ? 0x18243b : 0x364866, dx, 1.15, -1.42, false, g);
      box(0.08, 1.7, 0.1, 0xffcb2b, dx, 1.15, -1.43, false, g);
    });
    // Front windshield
    box(0.1, 1.2, 2.6, C.glass, 4.62, 1.65, 0, false, g);
    // Front LED digital destination display
    box(0.12, 0.35, 1.8, 0x111624, 4.63, 2.25, 0, false, g);
    box(0.14, 0.25, 1.6, 0xffaa00, 4.63, 2.25, 0, false, g);
    // Headlights & taillights
    box(0.08, 0.2, 0.4, 0xffffff, 4.63, 0.65, 1.0, false, g);
    box(0.08, 0.2, 0.4, 0xffffff, 4.63, 0.65, -1.0, false, g);
    box(0.08, 0.25, 0.35, 0xee2222, -4.63, 0.75, 1.0, false, g);
    box(0.08, 0.25, 0.35, 0xee2222, -4.63, 0.75, -1.0, false, g);
    // Roof-mounted dual HVAC air conditioning pods
    box(2.4, 0.32, 1.6, 0xd0dae8, -1.8, 2.68, 0, false, g);
    box(2.4, 0.32, 1.6, 0xd0dae8, 1.8, 2.68, 0, false, g);
    // Amber roof hazard strobe
    box(0.25, 0.18, 0.25, 0xffaa00, 0, 2.7, 0, false, g);

    // 4 Low-floor bus wheels
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 12);
    [[-2.8, 1.28], [2.8, 1.28], [-2.8, -1.28], [2.8, -1.28]].forEach(([x, z]) => {
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

  // Baggage Tractor hauling 3-Cart Luggage Train (tractor faces +Z, carts trail in -Z)
  // User Requirement 6: "Baggage tractors hauling 3-cart luggage trains"
  function makeBaggageTrain(): THREE.Group {
    const g = new THREE.Group();

    // ── TRACTOR (leads the train, faces +Z) ──
    box(2.2, 1.3, 2.8, C.warn, 0, 0.85, 0, true, g);
    box(1.8, 0.5, 0.15, 0x111624, 0, 0.5, 1.45, false, g);
    box(0.4, 0.4, 0.2, 0x333333, 0, 0.45, 1.5, false, g);
    box(2.0, 1.25, 1.4, dark ? 0x1c283f : 0x364868, 0, 1.85, 0.4, true, g);
    box(1.8, 0.8, 0.1, C.glass, 0, 1.95, 1.12, false, g);
    box(0.35, 0.25, 0.1, 0xffffff, 0.65, 0.95, 1.42, false, g);
    box(0.35, 0.25, 0.1, 0xffffff, -0.65, 0.95, 1.42, false, g);
    box(0.35, 0.25, 0.35, 0xffaa00, 0, 2.55, 0.4, false, g);

    const twg = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12);
    [[-0.9, 0.8], [0.9, 0.8], [-0.9, -0.8], [0.9, -0.8]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(twg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.38, wz);
      w.castShadow = true;
      g.add(w);
    });

    // ── EXACTLY 3 CARTS trailing in -Z direction ──
    const cartColors = [C.blue, dark ? 0x4fd1bd : 0x2fb5a2, C.navy, 0xd9381e, C.warn];
    const cartSpacing = 3.6;

    for (let c = 1; c <= 3; c++) {
      const cz = -(c * cartSpacing + 1.2);

      // Cart flat-bed platform
      box(2.3, 0.35, 2.6, 0x4a5d78, 0, 0.35, cz, true, g);
      // Luggage retention corner rails
      box(0.08, 0.6, 2.5, 0x8a9bb0, 1.12, 0.65, cz, false, g);
      box(0.08, 0.6, 2.5, 0x8a9bb0, -1.12, 0.65, cz, false, g);
      box(2.2, 0.6, 0.08, 0x8a9bb0, 0, 0.65, cz - 1.28, false, g);
      box(2.2, 0.6, 0.08, 0x8a9bb0, 0, 0.65, cz + 1.28, false, g);

      // Articulated tow hitch coupling from previous element
      box(0.16, 0.16, cartSpacing - 2.4, 0x222222, 0, 0.38, cz + (cartSpacing - 2.4) / 2 + 1.3, false, g);

      // Stacks of passenger suitcases / baggage
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const bColor = cartColors[(c * 2 + row + col) % cartColors.length];
          box(0.75, 0.52, 0.65, bColor, (col - 0.5) * 0.85, 0.72, cz - 0.5 + row * 0.75, true, g);
          if (row === 0) {
            box(0.65, 0.42, 0.55, cartColors[(c + col + 1) % cartColors.length],
              (col - 0.5) * 0.75, 1.15, cz - 0.2, false, g);
          }
        }
      }

      // 4 Cart wheels
      const cwg = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10);
      [[-0.9, 0.9], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(cwg, mat(0x11182c));
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.26, cz + wz);
        g.add(w);
      });
    }

    g.scale.setScalar(0.78);
    S.add(g);
    return g;
  }

  // Catering Truck with Scissor-Lift Box Body
  // User Requirement 6: "Catering trucks with scissor-lift box bodies"
  function makeCateringTruck(elevated = false, liveryColor = 0x2fb5a2): THREE.Group {
    const g = new THREE.Group();
    // Heavy commercial truck cab
    box(2.2, 1.8, 1.8, dark ? 0x1c283f : 0x364868, 2.5, 1.1, 0, true, g);
    box(0.1, 0.7, 1.6, C.glass, 3.62, 1.4, 0, false, g);
    box(0.15, 0.35, 1.7, 0x111624, 3.65, 0.45, 0, false, g);
    box(0.08, 0.2, 0.3, 0xffffff, 3.68, 0.5, 0.6, false, g);
    box(0.08, 0.2, 0.3, 0xffffff, 3.68, 0.5, -0.6, false, g);
    box(0.3, 0.2, 0.3, 0xffaa00, 2.5, 2.1, 0, false, g); // Amber beacon

    // Chassis frame
    box(7.5, 0.35, 1.6, 0x1b2440, 0.2, 0.45, 0, false, g);

    // Scissor lift height
    const liftY = elevated ? 3.4 : 1.35;

    // Scissor lift X-frame mechanism
    if (elevated) {
      // Tall expanded X-braces
      box(0.15, 2.2, 0.15, 0xd0dae8, -1.0, 1.8, 0.65, false, g).rotation.z = 0.55;
      box(0.15, 2.2, 0.15, 0xd0dae8, -1.0, 1.8, 0.65, false, g).rotation.z = -0.55;
      box(0.15, 2.2, 0.15, 0xd0dae8, -1.0, 1.8, -0.65, false, g).rotation.z = 0.55;
      box(0.15, 2.2, 0.15, 0xd0dae8, -1.0, 1.8, -0.65, false, g).rotation.z = -0.55;
      cyl(0.1, 0.1, 2.4, C.mast, -1.0, 1.8, 0, 8, g).rotation.z = 0.3;
      box(0.4, 0.15, 2.6, 0xffaa00, 0.2, 0.15, 0, false, g);
      box(0.4, 0.15, 2.6, 0xffaa00, -2.6, 0.15, 0, false, g);
    } else {
      // Folded compact scissor beams
      box(2.8, 0.18, 0.18, 0x8294aa, -1.0, 0.75, 0.6, false, g);
      box(2.8, 0.18, 0.18, 0x8294aa, -1.0, 0.75, -0.6, false, g);
    }

    // Insulated catering box body
    box(5.4, 2.2, 2.2, 0xf5f8fc, -1.1, liftY, 0, true, g);
    box(5.42, 0.45, 2.22, liveryColor, -1.1, liftY + 0.3, 0, false, g);
    box(0.08, 1.7, 1.8, 0xc0c8d4, -3.82, liftY, 0, false, g);
    // Forward transfer bridge extending over cab to aircraft galley door
    box(2.2, 0.22, 1.5, 0xced6e2, 2.0, liftY - 0.95, 0, false, g);
    box(2.2, 0.85, 0.06, 0xffffff, 2.0, liftY - 0.55, 0.72, false, g);
    box(2.2, 0.85, 0.06, 0xffffff, 2.0, liftY - 0.55, -0.72, false, g);
    box(0.12, 0.9, 1.5, 0x111624, 3.12, liftY - 0.55, 0, false, g);
    box(0.2, 0.15, 0.2, 0xffaa00, -3.7, liftY + 1.15, 1.0, false, g);
    box(0.2, 0.15, 0.2, 0xffaa00, -3.7, liftY + 1.15, -1.0, false, g);

    // 6 Wheels (2 front, 4 rear dual axles)
    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 12);
    [[2.4, 0.95], [-0.8, 0.95], [-2.4, 0.95], [2.4, -0.95], [-0.8, -0.95], [-2.4, -0.95]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.44, z);
      w.castShadow = true;
      g.add(w);
    });

    g.scale.setScalar(0.74);
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

  // Passenger Boarding Mobile Stairs / Ladder Truck
  // User Requirement 6: "Passenger boarding mobile stairs / ladder trucks"
  function makeLadderTruck(extended = true): THREE.Group {
    const g = new THREE.Group();
    box(3.4, 1.3, 2.0, C.warn, 0, 0.85, 0, true, g);
    box(1.3, 1.1, 1.8, dark ? 0x1c283f : 0x364868, 1.0, 1.65, 0, true, g);
    box(0.08, 0.75, 1.5, C.glass, 1.66, 1.7, 0, false, g);
    box(0.25, 0.18, 0.25, 0xffaa00, 1.0, 2.3, 0, false, g);
    
    const stairAngle = 0.55;
    const stairLen = 4.2;
    const stairGroup = new THREE.Group();
    box(stairLen, 0.25, 1.7, 0xced4da, 0, 0, 0, false, stairGroup);
    for (let s = 0; s < 6; s++) {
      const stepX = -1.6 + s * 0.62;
      box(0.35, 0.12, 1.5, 0x6c7a8c, stepX, 0.15, 0, false, stairGroup);
    }
    box(stairLen, 0.08, 0.08, 0xffffff, 0, 0.85, 0.85, false, stairGroup);
    box(stairLen, 0.08, 0.08, 0xffffff, 0, 0.85, -0.85, false, stairGroup);
    for (let p = -1.8; p <= 1.8; p += 0.9) {
      cyl(0.04, 0.04, 0.85, C.mast, p, 0.45, 0.85, 6, stairGroup);
      cyl(0.04, 0.04, 0.85, C.mast, p, 0.45, -0.85, 6, stairGroup);
    }

    if (extended) {
      stairGroup.rotation.z = stairAngle;
      stairGroup.position.set(-0.8, 2.3, 0);
      box(1.8, 0.2, 1.8, 0xadb5bd, -2.5, 3.4, 0, false, g);
      box(0.08, 1.1, 1.8, 0xffffff, -3.35, 3.95, 0, false, g);
      box(1.8, 1.1, 0.08, 0xffffff, -2.5, 3.95, 0.88, false, g);
      box(1.8, 1.1, 0.08, 0xffffff, -2.5, 3.95, -0.88, false, g);
      box(0.12, 0.25, 1.6, 0x111624, -3.42, 3.45, 0, false, g);
      cyl(0.12, 0.12, 2.2, C.mast, -0.5, 1.6, 0.75, 8, g);
      cyl(0.12, 0.12, 2.2, C.mast, -0.5, 1.6, -0.75, 8, g);
      box(0.4, 0.15, 2.5, 0xffaa00, -0.5, 0.15, 0, false, g);
    } else {
      stairGroup.rotation.z = 0.15;
      stairGroup.position.set(-0.6, 1.5, 0);
      box(1.8, 0.2, 1.8, 0xadb5bd, -2.2, 1.8, 0, false, g);
    }
    g.add(stairGroup);

    const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 12);
    [[-1.2, 0.95], [1.2, 0.95], [-1.2, -0.95], [1.2, -0.95]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wg, mat(0x11182c));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.44, z);
      w.castShadow = true;
      g.add(w);
    });
    
    g.scale.setScalar(0.74);
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
  // All planes are parked NOSE-FIRST facing West (-Math.PI/2) toward concourse piers
  // Door 1L aligns seamlessly with the extended jetbridge docking cabs!
  // Concourse A east wall: x = -71 -> planes at x = -55 (clearance 16m)
  // Concourse B east wall: x = 9   -> planes at x = 25  (clearance 16m)
  // Concourse C east wall: x = 89  -> planes at x = 105 (clearance 16m, 100% OUTSIDE building!)
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
      route: 'Gate C1 · Paris CDG (Inflight Catering & Baggage)',
      m: makeAirplane(C.blue, 1.0),
      status: 'Gate C1 Docked',
      kmh: 0,
      delayed: false,
      spd: 0,
      d: 0,
    },
  ];

  // PA-881 — Gate A1 (Concourse A outer east wall x=-71, plane at x=-55, z=-24)
  parkedPlanes[0].m.position.set(-55, 1.8, -24);
  parkedPlanes[0].m.rotation.y = -Math.PI / 2;

  // LH-318 — Gate A2 (Concourse A outer east wall x=-71, plane at x=-55, z=6)
  parkedPlanes[1].m.position.set(-55, 1.8, 6);
  parkedPlanes[1].m.rotation.y = -Math.PI / 2;

  // BA-109 — Gate B1 (Concourse B outer east wall x=9, plane at x=25, z=-24)
  parkedPlanes[2].m.position.set(25, 1.8, -24);
  parkedPlanes[2].m.rotation.y = -Math.PI / 2;

  // QR-502 — Gate B2 (Concourse B outer east wall x=9, plane at x=25, z=6)
  parkedPlanes[3].m.position.set(25, 1.8, 6);
  parkedPlanes[3].m.rotation.y = -Math.PI / 2;

  // AF-114 — Gate C1 (Concourse C outer east wall x=89, plane at x=105, z=-24)
  // FIX (Req 5): Positioned 16m EAST of Concourse C wall -> completely outside building!
  parkedPlanes[4].m.position.set(105, 1.8, -24);
  parkedPlanes[4].m.rotation.y = -Math.PI / 2;

  // Ground service equipment safely docked at stands
  // User Requirement 6: Mobile stairs / ladder trucks, catering trucks with scissor lifts, tugs, fuel
  const gateGSE: AirportFlight[] = [
    { id: 'TUG-01', type: 'gse', subType: 'tug', route: 'Gate A1 · Pushback Tug Attached to Nosegear', m: makePushbackTug(), status: 'Tug Connected', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'FUEL-02', type: 'gse', subType: 'fuel', route: 'Gate B2 · Underwing Hydrant Fuel Truck', m: makeFuelTruck(), status: 'Hydrant Active', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'LADD-01', type: 'gse', subType: 'ladder', route: 'Gate A1 · Passenger Boarding Mobile Stairs', m: makeLadderTruck(true), status: 'Stairs Extended', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'LADD-02', type: 'gse', subType: 'ladder', route: 'Gate B1 · Passenger Boarding Mobile Stairs', m: makeLadderTruck(true), status: 'At Aircraft Door', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'CAT-01', type: 'gse', subType: 'catering', route: 'Gate A2 · Inflight Catering Scissor-Lift Elevated', m: makeCateringTruck(true, 0xd9801a), status: 'Galley Servicing', kmh: 0, delayed: false, spd: 0, d: 0 },
    { id: 'CAT-02', type: 'gse', subType: 'catering', route: 'Gate C1 · Inflight Catering Scissor-Lift Elevated', m: makeCateringTruck(true, 0x2fb5a2), status: 'Galley Servicing', kmh: 0, delayed: false, spd: 0, d: 0 },
  ];
  
  // Position GSE vehicles next to assigned aircraft
  gateGSE[0].m.position.set(-55, 0, -38);  // Tug at A1 nose gear
  gateGSE[0].m.rotation.y = -Math.PI / 2;

  gateGSE[1].m.position.set(25, 0, -4);    // Fuel truck under B2 wing
  gateGSE[1].m.rotation.y = 0;

  gateGSE[2].m.position.set(-59, 0, -24);  // Ladder at A1 rear door
  gateGSE[2].m.rotation.y = Math.PI;

  gateGSE[3].m.position.set(21, 0, -24);   // Ladder at B1 rear door
  gateGSE[3].m.rotation.y = Math.PI;

  gateGSE[4].m.position.set(-50, 0, 4);    // Catering scissor truck at LH-318 right galley door
  gateGSE[4].m.rotation.y = 0;

  gateGSE[5].m.position.set(110, 0, -26);  // Catering scissor truck at AF-114 right galley door
  gateGSE[5].m.rotation.y = Math.PI;

  // ── 5. ACTIVE AIRPORT FLIGHTS ───────────────────────────────────────────────
  // Flight 1: Active Takeoff in Opposite Direction on 1st Runway (EK-204)
  // User Requirement 3: "you can add another plane on 1st runway just taking off in opp site direction"
  // Takes off Eastbound on Runway 09L (z = 106) with 45° steep angle climb, timed so zero runway conflicts with SQ-012!
  const takeoffPlane: AirportFlight = {
    id: 'EK-204',
    type: 'airliner',
    subType: 'takeoff',
    route: 'Rwy 09L → Dubai DXB (Opposite Direction 45° Takeoff Climb)',
    m: makeAirplane(0xd9381e, 1.05),
    status: 'Holding Short Rwy 09L',
    kmh: 0,
    delayed: false,
    spd: 45,
    d: 0,
    progress: 0,
    altitude: 1.8,
  };

  // Flight 2: Live Full-Circuit Flight (SQ-012)
  // Docks at Gate C2 (x = 105, z = 6) — 100% OUTSIDE building with connected jetbridge!
  const dockingPlane: AirportFlight = {
    id: 'SQ-012',
    type: 'airliner',
    subType: 'docking',
    route: 'Singapore SIN → Changi · Active Flight Circuit & Gate C2 Dock',
    m: makeAirplane(0x0e7c61, 1.0),
    status: 'Gate C2 · Pre-Flight & Boarding',
    kmh: 0,
    delayed: false,
    spd: 20,
    d: 0,
    progress: 0,
    altitude: 1.8,
  };

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

  // User Requirement 2: Car that stops at lift gate then enters car park
  const enteringCar: AirportFlight = {
    id: 'CAR-01',
    type: 'car',
    subType: 'car',
    route: 'Boulevard → Car Park Entrance (Gate Cleared)',
    m: makeRealisticCar('sedan', 0x1e40af),
    status: 'Approaching Gate',
    kmh: 24,
    delayed: false,
    spd: 15,
    d: 0,
    progress: 0,
    altitude: 0,
  };
  S.add(enteringCar.m);

  // ── 6. DEDICATED APRON VEHICLE LANES (SPACED FAR AWAY FROM RUNWAYS) ─────────
  // User Requirement 2: "lot of space for these vehicles to roam keep them away from runway"
  // Parked planes wings end at z = 20.5.
  // Bus Loop: z = 27 to 36 (centered at z = 31.5)
  // Baggage Loop: z = 39 to 47 (centered at z = 43)
  // All vehicles stay within z <= 47!
  // Taxiway Alpha is at z = 74, Runway 09L/27R is at z = 106, Runway 09R is at z = 145!
  // Distance from vehicles to Runway: 59 to 98 meters! ZERO COLLISION!
  const busLoop = loopPts(-105, 125, 27, 36, 5.0);

  // User Requirement 6: Low-floor airport passenger tarmac transfer buses
  // Spaced evenly around loop, equal base speed to prevent merging!
  const busColors = [C.blue, C.warn, dark ? 0x4fd1bd : 0x2fb5a2, C.navy, 0xd9381e, 0x8a2be2];
  const busRoutes = [
    'Tarmac Shuttle · Terminal A ↔ Remote Stands',
    'Tarmac Shuttle · Concourse B ↔ Gate C',
    'Apron Transfer · Gate C ↔ Arrivals Concourse',
    'Remote Stand Shuttle · Pier B ↔ Stand 15',
    'Crew Transport · Operations Base ↔ Gate A1',
    'International Arrivals · Immigration ↔ Terminal',
  ];

  const buses: AirportFlight[] = [0, 1, 2, 3, 4, 5].map(idx => ({
    id: `BUS-0${idx + 1}`,
    type: 'gse' as const,
    subType: 'bus' as const,
    route: busRoutes[idx],
    m: makeApronBus(busColors[idx]),
    status: 'Passenger Transfer',
    kmh: 30,
    delayed: false,
    spd: 4.8, // Uniform base speed to prevent merging
    d: (idx / 6) * busLoop.T, // Perfect equidistant distribution
    lp: { ...busLoop, v: 3.2 },
  }));

  // User Requirement 6: Baggage tractors hauling 3-cart luggage trains
  // Dedicated baggage route at z = 39 to 47, completely clear of runway and taxiways!
  const bagLoop = loopPts(-100, 120, 39, 47, 4.0);
  const baggageTrains: AirportFlight[] = [
    {
      id: 'BAG-01',
      type: 'gse',
      subType: 'baggage',
      route: 'Luggage Sorting Hall ↔ Flights Concourse A/B (3-Cart Train)',
      m: makeBaggageTrain(),
      status: 'Baggage Dispatch',
      kmh: 22,
      delayed: false,
      spd: 3.8,
      d: 0,
      lp: { ...bagLoop, v: 2.8 },
    },
    {
      id: 'BAG-04',
      type: 'gse',
      subType: 'baggage',
      route: 'Baggage Transfer Terminal ↔ Remote Stands (3-Cart Train)',
      m: makeBaggageTrain(),
      status: 'Transferring Bags',
      kmh: 22,
      delayed: false,
      spd: 3.8,
      d: bagLoop.T * 0.33,
      lp: { ...bagLoop, v: 2.8 },
    },
    {
      id: 'BAG-08',
      type: 'gse',
      subType: 'baggage',
      route: 'Cargo Sorting Terminal ↔ Flights Pier C (3-Cart Train)',
      m: makeBaggageTrain(),
      status: 'Baggage Dispatch',
      kmh: 22,
      delayed: false,
      spd: 3.8,
      d: bagLoop.T * 0.67,
      lp: { ...bagLoop, v: 2.8 },
    },
  ];

  // User Requirement 6: Active mobile Catering Truck with scissor-lift box body
  const cateringTrucks: AirportFlight[] = [
    {
      id: 'CAT-03',
      type: 'gse',
      subType: 'catering',
      route: 'Flight Catering Base ↔ Concourse B Stands (Scissor-Lift)',
      m: makeCateringTruck(false, 0x0e7c61),
      status: 'Catering En Route',
      kmh: 28,
      delayed: false,
      spd: 4.8,
      d: busLoop.T * 0.90,
      lp: { ...busLoop, v: 3.2 },
    },
  ];

  // User Requirement 6: Active mobile Passenger Boarding Mobile Stairs / Ladder Truck
  const ladderTrucks: AirportFlight[] = [
    {
      id: 'LADD-03',
      type: 'gse',
      subType: 'ladder',
      route: 'GSE Maintenance Depot ↔ Remote Stand Dispatch',
      m: makeLadderTruck(false),
      status: 'Stairs En Route',
      kmh: 26,
      delayed: false,
      spd: 4.8,
      d: busLoop.T * 0.45,
      lp: { ...busLoop, v: 3.2 },
    },
  ];

  // Lane 3: Runway Safety Perimeter Patrol Lane (z = 84 to 92)
  const followMeLoop = loopPts(-130, 130, 84, 92, 4.0);
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
      d: taxiLoop.T * 0.33,
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
      d: taxiLoop.T * 0.66,
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
    dockingPlane,
    takeoffPlane,
    cruisingPlane,
    enteringCar,
    ...buses,
    ...parkedPlanes,
    ...baggageTrains,
    ...cateringTrucks,
    ...ladderTrucks,
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
    gseVehiclesActive: 22,
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
    _dockingPlane: dockingPlane,
    _cruisingPlane: cruisingPlane,
    _buses: buses,
    _baggageTrains: baggageTrains,
    _cateringTrucks: cateringTrucks,
    _ladderTrucks: ladderTrucks,
    _followMe: followMe,
    _taxis: taxis,
    _dockingBridgeCab: dockingBridgeCabGroup,
    _carParkLiftGateArm: carParkLiftGateArm,
    _enteringCar: enteringCar,
  };
}
