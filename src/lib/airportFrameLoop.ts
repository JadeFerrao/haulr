import * as THREE from 'three';
import type { AirportSceneState } from './airportScene';
import { at, smooth } from './threeHelpers';

export function runAirportFrame(
  state: AirportSceneState,
  clock: THREE.Clock,
  paused: boolean,
  calm: boolean,
  sel: number,
  view: HTMLElement,
  cam: THREE.OrthographicCamera,
  v3: THREE.Vector3,
  placed: [number, number][],
  onTagPos: (i: number, sx: number, sy: number, ok: boolean) => void
) {
  const mult = calm ? 0.35 : 1;
  const dt = Math.min(clock.getDelta(), 0.05) * (paused ? 0 : mult);
  const now = performance.now() / 1000;
  state.simT += dt;

  // ── 1. TAKEOFF AIRPLANE (EK-204) - DRAMATIC 45° STEEP CLIMB OUT ──────────────
  // User Requirement 2: "planes taking off should have 45 degree angle while taking off!!"
  const tp = state._takeoffPlane;
  tp.progress = ((tp.progress ?? 0) + dt * 0.046) % 1;
  const p2 = tp.progress;

  const rwyZ_09L = 82;
  const qEast = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

  if (p2 < 0.26) {
    // Phase 1: High-power ground roll along Runway 09L
    const t = p2 / 0.26;
    const x = -150 + t * 130; // -150 to -20
    tp.m.position.set(x, 1.8, rwyZ_09L);
    tp.m.quaternion.copy(qEast);
    tp.status = 'Takeoff Roll (Rwy 09L)';
    tp.kmh = Math.round(110 + t * 190); // accelerates to 300 km/h
  } else if (p2 < 0.62) {
    // Phase 2: ROTATE & 45° STEEP ANGLE CLIMB UPWARD!!!
    // FIX: Pitch angle must be POSITIVE for nose-up climb!
    const t = (p2 - 0.26) / 0.36;
    const dist = t * 125;
    const x = -20 + dist;
    const climbY = 1.8 + dist; // dy = dx -> exactly 45° flight path!
    // Rotate nose UPWARD (positive pitch angle)
    const pitchAngle = smooth(t) * (Math.PI / 4); // 0 to +45 degrees (UPWARD!)
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitchAngle); // Negative for upward pitch in Three.js
    tp.m.position.set(x, climbY, rwyZ_09L);
    tp.m.quaternion.copy(qEast).multiply(qPitch);
    tp.status = '45° Steep Climb (FL030)';
    tp.kmh = Math.round(300 + t * 90);
  } else if (p2 < 0.86) {
    // Phase 3: Transitioning to flight level cruise with gentle banking
    const t = (p2 - 0.62) / 0.24;
    const x = 105 + t * 85;
    const climbY = 126.8 + t * 25;
    const bankAngle = -0.16 * Math.sin(t * Math.PI);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.22);
    const qBank = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankAngle);
    tp.m.position.set(x, climbY, rwyZ_09L - t * 30);
    tp.m.quaternion.copy(qEast).multiply(qPitch).multiply(qBank);
    tp.status = 'En Route Climb (FL090)';
    tp.kmh = 430;
  } else {
    // Phase 4: Repositioning overhead
    const t = (p2 - 0.86) / 0.14;
    tp.m.position.set(-240 + t * 90, 110, rwyZ_09L);
    tp.m.quaternion.copy(qEast);
    tp.status = 'Holding Short Rwy 09L';
    tp.kmh = 90;
  }

  // ── 2. LANDING AIRPLANE (AF-402) - INDEPENDENT RUNWAY 09R ────────────────────
  // User Requirement 7: "no plane should come close to ech other !!"
  // Landing on Runway 09R (z = 120), separated 38m laterally from 09L!
  const lp = state._landingPlane;
  lp.progress = ((lp.progress ?? 0.5) + dt * 0.040) % 1;
  const p1 = lp.progress;
  const rwyZ_09R = 120;

  if (p1 < 0.36) {
    // Phase 1: 3-degree ILS Final Approach to Rwy 09R
    const t = p1 / 0.36;
    const x = -250 + t * 160; // -250 to -90
    const y = 62 * (1 - smooth(t)) + 1.8;
    const qAppPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.05);
    lp.m.position.set(x, y, rwyZ_09R);
    lp.m.quaternion.copy(qEast).multiply(qAppPitch);
    lp.status = 'Final Approach (ILS Rwy 09R)';
    lp.kmh = Math.round(250 - t * 30);
  } else if (p1 < 0.65) {
    // Phase 2: Touchdown and reverse thrust rollout
    const t = (p1 - 0.36) / 0.29;
    const x = -90 + t * 145; // -90 to +55
    lp.m.position.set(x, 1.8, rwyZ_09R);
    lp.m.quaternion.copy(qEast);
    lp.status = 'Touchdown · Reverse Thrust';
    lp.kmh = Math.round(220 - t * 160);
  } else if (p1 < 0.85) {
    // Phase 3: Smoothly vacates Rwy 09R via rapid-exit taxiway
    const t = (p1 - 0.65) / 0.2;
    const x = 55 + Math.sin(t * Math.PI * 0.5) * 8;
    const z = rwyZ_09R - t * 45; // 120 down to 75
    lp.m.position.set(x, 1.8, z);
    const qTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + t * 0.9);
    lp.m.quaternion.copy(qTurn);
    lp.status = 'Vacated Rwy 09R via Taxiway E';
    lp.kmh = 38;
  } else {
    // Phase 4: Taxiing to apron stand — use z=68 (well north of SQ-012 on z=55)
    const t = (p1 - 0.85) / 0.15;
    const x = 63 - t * 50;
    lp.m.position.set(x, 1.8, 68);
    const qTaxi = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    lp.m.quaternion.copy(qTaxi);
    lp.status = 'Taxiing to Apron Stand';
    lp.kmh = 22;
  }

  // ── 3. COMPLETE GATE PARKING CYCLE (SQ-012) ──────────────────────────────────
  // Docks at Gate C2 (east side of Concourse C, x=90, z=-24)
  // Planes park PARALLEL to wall, nose east. SQ-012 taxies FROM WEST, turns south,
  // drives east into parking slot. NO REVERSING — head first the whole way.
  // Gate C2 (not modelled as static, so SQ-012 uses a fresh slot):
  //   plane parks at x=88, z=-24, rotation.y=-PI/2 (nose east)
  //   door at (88+6.2, -24+1.25) = (94.2, -22.75)
  const dp = state._dockingPlane;
  dp.progress = ((dp.progress ?? 0) + dt * 0.020) % 1;
  const pDock = dp.progress;

  // heading east = rotation.y = -PI/2  (nose points +X)
  const qNoseEast = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), -Math.PI/2);
  // heading south = rotation.y = PI (nose points -Z)  — used while taxying from runway
  const qNoseSouth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI);
  // heading west = rotation.y = PI/2
  const qNoseWest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2);

  if (pDock < 0.18) {
    // Phase 1: Arrive from west on taxiway z=55 (clear of AF-402 zone z=75), heading east
    const t = pDock / 0.18;
    dp.m.position.set(-90 + t * 170, 1.8, 55);
    dp.m.quaternion.copy(qEast);
    dp.status = 'Taxiing via Taxiway Alpha';
    dp.kmh = 24;
  } else if (pDock < 0.26) {
    // Phase 2: Turn south toward gate row (z=55 → z=24)
    const t = (pDock - 0.18) / 0.08;
    const angle = Math.PI/2 - smooth(t) * Math.PI; // east (PI/2) → south (PI+PI/2 = -PI/2... )
    // simpler: interpolate from qEast to qNoseSouth
    dp.m.quaternion.slerpQuaternions(qEast, qNoseSouth, smooth(t));
    dp.m.position.set(80, 1.8, 55 - smooth(t) * 31);
    dp.status = 'Turning South to Gate Row';
    dp.kmh = 14;
  } else if (pDock < 0.34) {
    // Phase 3: Head south along gate lead-in line (nose leads, head first)
    const t = (pDock - 0.26) / 0.08;
    dp.m.position.set(88, 1.8, 24 - smooth(t) * 48); // 24 → -24
    dp.m.quaternion.copy(qNoseSouth);
    dp.status = 'Taxiing to Gate Stand';
    dp.kmh = 12;
  } else if (pDock < 0.42) {
    // Phase 4: Turn nose to face east — park parallel (head-first into slot)
    const t = (pDock - 0.34) / 0.08;
    dp.m.quaternion.slerpQuaternions(qNoseSouth, qNoseEast, smooth(t));
    dp.m.position.set(88, 1.8, -24);
    dp.status = 'Aligning to Gate C2';
    dp.kmh = 6;
  } else if (pDock < 0.60) {
    // Phase 5: PARKED at Gate C2 — engines off, services
    dp.m.position.set(88, 1.8, -24);
    dp.m.quaternion.copy(qNoseEast);
    dp.status = 'Gate C2 · Boarding & Refueling';
    dp.kmh = 0;
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(94.2, 2.7, -22.75);
    }
  } else if (pDock < 0.68) {
    // Phase 6: PUSHBACK — tug pushes plane BACKWARD (nose still east, plane rolls west)
    // This is the only time plane moves opposite to nose direction — tug-driven
    const t = (pDock - 0.60) / 0.08;
    dp.m.position.set(88 - smooth(t) * 20, 1.8, -24); // pushed west 20m
    dp.m.quaternion.copy(qNoseEast);
    dp.status = 'Tug Pushback · Clearing Gate';
    dp.kmh = Math.round(smooth(t) * 8);
  } else if (pDock < 0.76) {
    // Phase 7: Turn nose to face west (ready to taxi to runway)
    const t = (pDock - 0.68) / 0.08;
    dp.m.quaternion.slerpQuaternions(qNoseEast, qNoseWest, smooth(t));
    dp.m.position.set(68, 1.8, -24 + smooth(t) * 10);
    dp.status = 'Turning to Taxiway';
    dp.kmh = 12;
  } else if (pDock < 0.90) {
    // Phase 8: Taxi west to runway on z=55 taxiway (head first, nose leads west)
    const t = (pDock - 0.76) / 0.14;
    dp.m.position.set(68 - smooth(t) * 158, 1.8, 55);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Taxiing to Runway 09L';
    dp.kmh = 22;
  } else {
    // Phase 9: Hold short runway, wait for clear
    dp.m.position.set(-90, 1.8, 55);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Holding Short Runway';
    dp.kmh = 0;
  }

  // ── 4. CRUISING / SKY HOLDING AIRPLANE (UA-920) ──────────────────────────────
  const cp = state._cruisingPlane;
  cp.progress = ((cp.progress ?? 0) + dt * 0.024) % 1;
  const p3 = cp.progress;

  const orbitAngle = p3 * Math.PI * 2;
  const rx = 175, rz = 95;
  const posX = Math.cos(orbitAngle) * rx;
  const posZ = Math.sin(orbitAngle) * rz;
  const altY = 85 + Math.sin(orbitAngle * 2) * 3;

  const vx = -Math.sin(orbitAngle) * rx;
  const vz = Math.cos(orbitAngle) * rz;
  const headingYaw = Math.atan2(vx, vz);
  const bankRoll = -0.16;

  cp.m.position.set(posX, altY, posZ);
  const qSkyYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingYaw);
  const qSkyRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankRoll);
  cp.m.quaternion.copy(qSkyYaw).multiply(qSkyRoll);
  cp.status = 'Airspace Holding (FL085)';
  cp.kmh = 530;

  // ── 5. PASSENGER BUSES (DEDICATED OUTER CORRIDOR Z = 36 to 46) ───────────────
  // User Requirement 4 & 6: Dedicated non-overlapping lanes, zero vehicle hits
  state._buses.forEach(bus => {
    if (!bus.lp) return;
    bus.d = (bus.d + bus.spd * dt) % bus.lp.T;
    const [x, z] = at(bus.lp, bus.d);
    const [x2, z2] = at(bus.lp, bus.d + 0.6);
    bus.m.position.set(x, 0, z);
    bus.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  });

  // ── 6. BAGGAGE TRAINS (DEDICATED INNER ROAD Z = 12 to 20) ────────────────────
  state._baggageTrains.forEach(v => {
    if (!v.lp) return;
    v.d = (v.d + v.spd * dt) % v.lp.T;
    const [x, z] = at(v.lp, v.d);
    const [x2, z2] = at(v.lp, v.d + 0.6);
    v.m.position.set(x, 0, z);
    v.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  });

  // ── 7. FOLLOW-ME SAFETY TRUCK (RUNWAY PATROL Z = 62 to 70) ───────────────────
  const flw = state._followMe;
  if (flw && flw.lp) {
    flw.d = (flw.d + flw.spd * dt) % flw.lp.T;
    const [x, z] = at(flw.lp, flw.d);
    const [x2, z2] = at(flw.lp, flw.d + 0.6);
    flw.m.position.set(x, 0, z);
    flw.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  }

  // ── 8. CITY TAXIS (TERMINAL FRONTAGE ROAD Z = -94 to -104) ───────────────────
  state._taxis.forEach(t => {
    if (!t.lp) return;
    t.d = (t.d + t.spd * dt) % t.lp.T;
    const [x, z] = at(t.lp, t.d);
    const [x2, z2] = at(t.lp, t.d + 0.6);
    t.m.position.set(x, 0, z);
    t.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  });

  // ── 9. RADAR, TOWER BEACON & APPROACH RUNWAY LIGHTS ─────────────────────────
  state.radars.forEach(r => {
    r.rotation.y = now * 1.8;
  });

  const beaconOn = Math.floor(now * 1.6) % 2 === 0;
  state.beaconM.color.setHex(beaconOn ? 0x2fe08a : 0xffffff);

  const nApp = state.approachLights.length;
  const strobeIdx = Math.floor((now * 9) % (nApp + 3));
  state.approachLights.forEach((light, i) => {
    const isLit = i === strobeIdx;
    (light.material as THREE.MeshBasicMaterial).color.setHex(isLit ? 0xffffff : 0x5a6d8c);
    light.scale.setScalar(isLit ? 1.6 : 1.0);
  });

  // ── 10. SELECTION RING & SCREEN TAG PROJECTIONS ─────────────────────────────
  const w = view.clientWidth, h = view.clientHeight;
  placed.length = 0;

  const validSel = Math.max(0, Math.min(sel, state.flights.length - 1));
  const selPos = state.flights[validSel].m.position;
  state.ring.position.set(selPos.x, Math.max(0.12, selPos.y - 1.6), selPos.z);
  state.ring.scale.setScalar(1 + Math.sin(now * 4) * 0.08);

  [validSel, ...state.flights.map((_, i) => i).filter(i => i !== validSel)].forEach(i => {
    const f = state.flights[i];
    const p = f.m.position;

    v3.set(p.x, p.y + 3.8, p.z).project(cam);
    const sx = (v3.x * 0.5 + 0.5) * w;
    const sy = (-v3.y * 0.5 + 0.5) * h;

    let ok = sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20;
    if (ok) {
      for (const q of placed) {
        if (Math.abs(q[0] - sx) < 125 && Math.abs(q[1] - sy) < 30) {
          ok = false;
          break;
        }
      }
    }
    if (ok) placed.push([sx, sy]);
    onTagPos(i, sx, sy, ok);
  });
}
