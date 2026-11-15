import * as THREE from 'three';
import type { AirportSceneState, AirportFlight } from './airportScene';
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
  // User Requirement 1: "when planes are docking/parking - buses should stop let planes pass"
  // User Requirement 5: "i can still see planes inside the building!! - fix!!!"
  // Docks at Gate C2 (x = 105, z = 6) — 100% OUTSIDE Concourse C (which is x=71 to 89)!
  // Planes park NOSE-WEST (-Math.PI/2) into stand, door 1L connects to Gate C2 jetbridge!
  const dp = state._dockingPlane;
  dp.progress = ((dp.progress ?? 0) + dt * 0.018) % 1;
  const pDock = dp.progress;

  const qNoseEast = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const qNoseNorth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const qNoseWest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const qNoseSouth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);

  if (pDock < 0.20) {
    // Phase 1: Arrive from west along Taxiway Alpha (z = 58, heading East)
    const t = pDock / 0.20;
    const x = -60 + t * 165;
    dp.m.position.set(x, 1.8, 58);
    dp.m.quaternion.copy(qNoseEast);
    dp.status = 'Taxiing via Taxiway Alpha';
    dp.kmh = 24;
  } else if (pDock < 0.30) {
    // Phase 2: Turn north to Gate C2 lead-in line at x = 105 (z: 58 -> 24)
    // Crosses across apron service road (z=40). Vehicles yield and stop 15-20m away!
    const t = (pDock - 0.20) / 0.10;
    dp.m.quaternion.slerpQuaternions(qNoseEast, qNoseNorth, smooth(t));
    dp.m.position.set(105, 1.8, 58 - smooth(t) * 34);
    dp.status = 'Turning North to Gate C2';
    dp.kmh = 14;
  } else if (pDock < 0.40) {
    // Phase 3: Approach Gate C2 along lead-in line, align head-first facing West into stand
    const t = (pDock - 0.30) / 0.10;
    dp.m.quaternion.slerpQuaternions(qNoseNorth, qNoseWest, smooth(t));
    dp.m.position.set(105, 1.8, 24 - smooth(t) * 18);
    dp.status = 'Aligning to Gate C2 Stand';
    dp.kmh = 10;
  } else if (pDock < 0.62) {
    // Phase 4: PARKED at Gate C2 — engines shut down, jetbridge cab connected, servicing active
    dp.m.position.set(105, 1.8, 6);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Gate C2 · Docked & Boarding';
    dp.kmh = 0;
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(98.8, 2.7, 7.25);
    }
  } else if (pDock < 0.72) {
    // Phase 5: PUSHBACK — Tug pushes aircraft backward (South, z: 6 -> 36)
    const t = (pDock - 0.62) / 0.10;
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(95.0, 2.7, 7.25); // retracted
    }
    dp.m.position.set(105, 1.8, 6 + smooth(t) * 30);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Tug Pushback · Clearing Stand';
    dp.kmh = Math.round(smooth(t) * 8);
  } else if (pDock < 0.82) {
    // Phase 6: Turn towards taxiway heading West (z: 36 -> 58)
    const t = (pDock - 0.72) / 0.10;
    dp.m.quaternion.copy(qNoseWest);
    dp.m.position.set(105 - smooth(t) * 15, 1.8, 36 + smooth(t) * 22);
    dp.status = 'Starting Taxi to Rwy 09L';
    dp.kmh = 12;
  } else if (pDock < 0.94) {
    // Phase 7: Taxi west along Taxiway Alpha (x: 90 -> -70 at z = 58)
    const t = (pDock - 0.82) / 0.12;
    dp.m.position.set(90 - t * 160, 1.8, 58);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Taxiing to Runway 09L';
    dp.kmh = 22;
  } else {
    // Phase 8: Hold short Runway 09L
    dp.m.position.set(-70, 1.8, 58);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Holding Short Runway 09L';
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

  // ── 5. AIRCRAFT YIELDING & HEADWAY SAFETY CONTROLLER ─────────────────────────
  // User Requirement 1: "when planes are docking/parking - buses should stop let planes pass
  // and then move later , same with other vehicles as well (atleast at 10-15m away it should stop)"
  const movingPlanes = [state._dockingPlane, state._takeoffPlane, state._landingPlane];

  const shouldYieldToAircraft = (vPos: THREE.Vector3): boolean => {
    for (const plane of movingPlanes) {
      const pPos = plane.m.position;
      // Only ground planes moving or in taxi/pushback
      if (pPos.y < 5 && plane.kmh > 0) {
        const dist = Math.hypot(vPos.x - pPos.x, vPos.z - pPos.z);
        // User requested: "atleast at 10-15m away it should stop" -> 20m buffer gives safe 15-20m halt!
        if (dist < 21) {
          return true;
        }
      }
    }
    return false;
  };

  // User Requirement 3: "buses being merged - ui fix"
  // Car-following headway distance controller: ensures vehicles maintain safe distance
  // and never catch up to or merge into each other!
  const getHeadwayFactor = (v: AirportFlight, group: AirportFlight[]): number => {
    if (!v.lp) return 1.0;
    let minAhead = 999;
    for (const other of group) {
      if (other === v) continue;
      let diff = other.d - v.d;
      while (diff < 0) diff += v.lp.T;
      if (diff < minAhead) {
        minAhead = diff;
      }
    }
    // Hard stop if vehicle ahead is closer than 13m
    if (minAhead < 13) return 0;
    // Smooth deceleration if within 22m
    if (minAhead < 22) return (minAhead - 13) / 9;
    return 1.0;
  };

  // ── 6. LOW-FLOOR PASSENGER BUSES & MOBILE SERVICE GSE ───────────────────────
  // Road is at z = 34 to 46 (separated by 15m+ from aircraft wings at z=20.5 -> Req 2 fixed!)
  const serviceVehicles = [
    ...state._buses,
    ...(state._cateringTrucks ?? []),
    ...(state._ladderTrucks ?? [])
  ];

  serviceVehicles.forEach(veh => {
    if (!veh.lp) return;
    const [currX, currZ] = at(veh.lp, veh.d);
    const vPos = new THREE.Vector3(currX, 0, currZ);

    const yieldStop = shouldYieldToAircraft(vPos);
    const headway = getHeadwayFactor(veh, serviceVehicles);
    const speedMult = yieldStop ? 0 : headway;

    if (speedMult <= 0.05) {
      veh.kmh = 0;
      veh.status = yieldStop ? 'Holding for Aircraft' : 'Traffic Spacing';
    } else {
      veh.kmh = Math.round((veh.spd ?? 4.8) * 6.2 * speedMult);
      veh.status = veh.subType === 'catering' ? 'Catering En Route' :
                   veh.subType === 'ladder' ? 'Stairs En Route' :
                   'Passenger Transfer';
      veh.d = (veh.d + (veh.spd ?? 4.8) * speedMult * dt) % veh.lp.T;
    }

    const [x, z] = at(veh.lp, veh.d);
    const [x2, z2] = at(veh.lp, veh.d + 0.6);
    veh.m.position.set(x, 0, z);
    veh.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  });

  // ── 7. BAGGAGE TRACTORS HAULING 3-CART LUGGAGE TRAINS ────────────────────────
  // User Requirement 4: "the carts are moviing in reverse!!! - fix"
  // User Requirement 6: "Baggage tractors hauling 3-cart luggage trains"
  // In Three.js: Model native forward direction is +Z. Tangent vector is (x2 - x, z2 - z).
  // Math.atan2(dx, dz) rotates the tractor +Z nose to lead FORWARD along travel direction!
  // No reversing! The tractor leads forward and the 3 carts follow behind!
  state._baggageTrains.forEach(train => {
    if (!train.lp) return;
    const [currX, currZ] = at(train.lp, train.d);
    const vPos = new THREE.Vector3(currX, 0, currZ);

    const yieldStop = shouldYieldToAircraft(vPos);
    const headway = getHeadwayFactor(train, state._baggageTrains);
    const speedMult = yieldStop ? 0 : headway;

    if (speedMult <= 0.05) {
      train.kmh = 0;
      train.status = yieldStop ? 'Holding for Aircraft' : 'Traffic Spacing';
    } else {
      train.kmh = Math.round((train.spd ?? 3.8) * 5.8 * speedMult);
      train.status = 'Baggage Dispatch';
      train.d = (train.d + (train.spd ?? 3.8) * speedMult * dt) % train.lp.T;
    }

    const [x, z] = at(train.lp, train.d);
    const [x2, z2] = at(train.lp, train.d + 0.6);
    train.m.position.set(x, 0, z);
    // FIX (Req 4): Correct forward heading angle — tractor leads, 3 carts follow!
    train.m.rotation.y = Math.atan2(x2 - x, z2 - z);
  });

  // ── 8. FOLLOW-ME SAFETY TRUCK (RUNWAY PATROL Z = 64 to 72) ───────────────────
  const flw = state._followMe;
  if (flw && flw.lp) {
    flw.d = (flw.d + flw.spd * dt) % flw.lp.T;
    const [x, z] = at(flw.lp, flw.d);
    const [x2, z2] = at(flw.lp, flw.d + 0.6);
    flw.m.position.set(x, 0, z);
    flw.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  }

  // ── 9. CITY TAXIS (TERMINAL FRONTAGE ROAD Z = -160 to -135) ──────────────────
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
