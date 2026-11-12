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
    // Phase 2: ROTATE & 45° STEEP ANGLE CLIMB
    // Trajectory is exactly 45 degrees: dy = dx
    const t = (p2 - 0.26) / 0.36;
    const dist = t * 125;
    const x = -20 + dist;
    const climbY = 1.8 + dist; // dy = dx -> exactly 45° flight path!
    // Smoothly rotate nose up to 45 degrees (Math.PI / 4 = 0.7854 rad)
    const pitchAngle = Math.min(Math.PI / 4, 0.25 + smooth(t) * (Math.PI / 4 - 0.25));
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchAngle);
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
    // Phase 4: Taxiing towards apron stands
    const t = (p1 - 0.85) / 0.15;
    const x = 63 - t * 40;
    const z = 75 - t * 30;
    lp.m.position.set(x, 1.8, z);
    const qTaxi = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 - 0.4);
    lp.m.quaternion.copy(qTaxi);
    lp.status = 'Taxiing to Apron Stand';
    lp.kmh = 24;
  }

  // ── 3. LIVE DOCKING AIRPLANE (SQ-012) ─────────────────────────────────────────
  // User Requirement 6: "show planes docking or parking at airport !!"
  // Gate C1 stand: x = 84, z = -38.2. Door 1L at x = 82.75, z = -32.0.
  const dp = state._dockingPlane;
  dp.progress = ((dp.progress ?? 0) + dt * 0.032) % 1;
  const pDock = dp.progress;

  if (pDock < 0.35) {
    // Phase 1: Taxiing on parallel taxiway towards Gate C1
    const t = pDock / 0.35;
    const x = 10 + t * 74; // 10 to 84
    dp.m.position.set(x, 1.8, 43);
    dp.m.quaternion.copy(qEast); // facing East
    dp.status = 'Taxiing via Taxiway Alpha';
    dp.kmh = Math.round(24 - t * 8);
  } else if (pDock < 0.50) {
    // Phase 2: Turning 90° left onto yellow Gate C1 lead-in line
    const t = (pDock - 0.35) / 0.15;
    const angle = Math.PI / 2 + t * (Math.PI / 2); // turns from East to North
    const turnX = 84 - (1 - Math.sin(t * Math.PI * 0.5)) * 6;
    const turnZ = 43 - t * 24;
    dp.m.position.set(turnX, 1.8, turnZ);
    const qTurnNorth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    dp.m.quaternion.copy(qTurnNorth);
    dp.status = 'Turning into Gate C1 Stand';
    dp.kmh = 12;
  } else if (pDock < 0.72) {
    // Phase 3: Straight-in docking along Gate C1 centerline
    const t = (pDock - 0.50) / 0.22;
    const z = 19 - smooth(t) * 57.2; // 19 down to -38.2
    dp.m.position.set(84, 1.8, z);
    // Orient facing North (towards terminal)
    const qNorth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    dp.m.quaternion.copy(qNorth);
    const remainingMeters = Math.max(0, Math.round((1 - t) * 14));
    dp.status = remainingMeters > 0 ? `VDGS Docking Guidance (${remainingMeters}m)` : 'VDGS: STOP';
    dp.kmh = Math.round((1 - t) * 12);
  } else if (pDock < 0.94) {
    // Phase 4: DOCKED AT GATE C1 (Engines Off, Jet Bridge Connected)
    dp.m.position.set(84, 1.8, -38.2);
    dp.m.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0));
    dp.status = 'Gate C1 Docked · Jet Bridge Connected';
    dp.kmh = 0;

    // Jet bridge cab seals snugly against Door 1L
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(82.75, 2.7, -32.0);
    }
  } else {
    // Phase 5: Pushback clearance & turnaround
    const t = (pDock - 0.94) / 0.06;
    dp.m.position.set(84, 1.8, -38.2 + t * 20);
    dp.status = 'Gate C1 Pushback Approved';
    dp.kmh = 6;
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
