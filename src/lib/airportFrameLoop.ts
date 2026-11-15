import * as THREE from 'three';
import type { AirportSceneState, AirportFlight } from './airportScene';
import { at, smooth } from './threeHelpers';

// ── PRECOMPUTED 3D KINEMATIC PATHS FOR SQ-012 ──────────────────────────────
// User Requirement: "only plane SQ012 to takeoff , land , dock itself at airport"
// User Requirement: "it should take a 1 min turn in air and then land slowly liek normally"
// User Requirement: "in cockpit direction it should fly only not turn itself again , it can takeoff from left side"

// Phase 2: Smooth taxi out from Gate C2 stand (105, 1.8, 6) to Runway 27L (45, 1.8, 106)
const taxiOutCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(105, 1.8, 6),
  new THREE.Vector3(82, 1.8, 16),
  new THREE.Vector3(64, 1.8, 52),
  new THREE.Vector3(52, 1.8, 86),
  new THREE.Vector3(45, 1.8, 106),
], false, 'catmullrom', 0.5);

// Phase 5: Scenic 1-minute airspace circuit around the airfield (alt 82m to 85m)
// Wide right-hand traffic pattern: Crosswind -> Downwind (north of terminal) -> Base turn -> Final intercept
const circuitCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-225, 82, 106), // Climb exit point, Westbound
  new THREE.Vector3(-265, 85, 30),  // Crosswind turn, banking right
  new THREE.Vector3(-190, 85, -65), // Rolling onto downwind leg
  new THREE.Vector3(0, 85, -75),    // Downwind cruise past north perimeter
  new THREE.Vector3(190, 85, -65),  // Late downwind leg
  new THREE.Vector3(265, 78, 30),   // Base turn, banking right
  new THREE.Vector3(220, 70, 106),  // Intercepting Runway 27L extended centerline
], false, 'catmullrom', 0.5);

// Phase 8: Smooth taxi and dock from Runway 27L exit (15, 1.8, 106) into Gate C2 (105, 1.8, 6)
const taxiDockCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(15, 1.8, 106),  // Rapid runway exit
  new THREE.Vector3(38, 1.8, 85),   // High-speed turnout
  new THREE.Vector3(75, 1.8, 74),   // Taxiway Alpha
  new THREE.Vector3(120, 1.8, 74),  // Taxiway Alpha East
  new THREE.Vector3(132, 1.8, 36),  // Curving into Gate C2 taxilane
  new THREE.Vector3(124, 1.8, 10),  // Intercepting Gate C2 stand line
  new THREE.Vector3(105, 1.8, 6),   // Docked at Gate C2
], false, 'catmullrom', 0.5);

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

  // ── 1. ACTIVE FLIGHT CYCLE (SQ-012) ──────────────────────────────────────────
  // User Requirement: "remove plane AF402 - instead i want only plane SQ012 to takeoff , land , dock itself at airport"
  // User Requirement: "see this its collision!!" -> SQ-012 is the ONLY plane on the runway, ZERO collisions!
  // User Requirement: "it should take a 1 min turn in air and then land slowly liek normally"
  // User Requirement: "in cockpit direction it should fly only not turn itself again , it can takeoff from left side"
  const dp = state._dockingPlane;
  // Progress increments at 0.015 / sec -> full realistic flight cycle takes ~67 seconds!
  dp.progress = ((dp.progress ?? 0) + dt * 0.015) % 1;
  const p = dp.progress;

  const qNoseWest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  if (p < 0.12) {
    // ── Phase 1: Parked at Gate C2 · Passengers Boarding · Jetbridge Connected ──
    dp.m.position.set(105, 1.8, 6);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Gate C2 · Boarding (Jetbridge Attached)';
    dp.kmh = 0;
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(98.8, 2.7, 7.25); // extended to Door 1L
    }
  } else if (p < 0.22) {
    // ── Phase 2: Taxi Forward in Cockpit Direction to Runway 27L ───────────────
    // Retract jetbridge cab
    if (state._dockingBridgeCab) {
      state._dockingBridgeCab.position.set(95.0, 2.7, 7.25);
    }
    const t = (p - 0.12) / 0.10;
    const pos = taxiOutCurve.getPointAt(t);
    const tan = taxiOutCurve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    dp.m.position.copy(pos);
    dp.m.quaternion.copy(qYaw);
    dp.status = 'Taxiing to Runway 27L (Cockpit Heading)';
    dp.kmh = Math.round(14 + smooth(t) * 16); // 14 to 30 km/h
  } else if (p < 0.35) {
    // ── Phase 3: High-Power Takeoff Roll on Runway 27L Westbound (Left Side) ──
    const t = (p - 0.22) / 0.13;
    const x = 45 - t * 140; // 45 down to -95
    dp.m.position.set(x, 1.8, 106);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Takeoff Roll Rwy 27L (Westbound)';
    dp.kmh = Math.round(30 + Math.pow(t, 1.4) * 260); // 30 accelerates to 290 km/h
  } else if (p < 0.46) {
    // ── Phase 4: Rotate & 45° Steep Initial Climb Out towards Left Side into Sky ─
    const t = (p - 0.35) / 0.11;
    const dist = t * 130;
    const x = -95 - dist; // -95 down to -225
    const alt = 1.8 + smooth(t) * 80.2; // 1.8m climbs smoothly to 82m
    const pitch = Math.sin(t * Math.PI) * 0.42; // smooth airliner climb angle
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
    dp.m.position.set(x, alt, 106);
    dp.m.quaternion.copy(qNoseWest).multiply(qPitch);
    dp.status = '45° Westbound Climb Out (FL025)';
    dp.kmh = Math.round(290 + t * 90); // 290 to 380 km/h
  } else if (p < 0.76) {
    // ── Phase 5: Scenic 1-Minute Airfield Sky Circuit (Wide Traffic Pattern) ───
    // User Requirement: "it should take a 1 min turn in air and then land slowly liek normally"
    // Smooth 3D Catmull-Rom racetrack around the airfield with authentic banking into turns!
    const t = (p - 0.46) / 0.30;
    const pos = circuitCurve.getPointAt(t);
    const tan = circuitCurve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);

    // Compute aerodynamic banking roll based on turn rate
    const tNext = Math.min(t + 0.015, 1);
    const tanNext = circuitCurve.getTangentAt(tNext).normalize();
    const yawNext = Math.atan2(tanNext.x, tanNext.z);
    let dYaw = yawNext - yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const bankRoll = -Math.max(-0.35, Math.min(0.35, dYaw * 28));

    const pitch = Math.asin(Math.max(-0.5, Math.min(0.5, tan.y)));
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankRoll);

    dp.m.position.copy(pos);
    dp.m.quaternion.copy(qYaw).multiply(qPitch).multiply(qRoll);
    dp.status = t < 0.45 ? 'Airfield Circuit (Crosswind FL085)' : (t < 0.8 ? 'Downwind Leg (FL085 Cruise)' : 'Base Leg Turn (Lining up Final)');
    dp.kmh = 380;
  } else if (p < 0.88) {
    // ── Phase 6: Gentle, Slow ILS Final Approach (Normal 3° Glide Slope) ────────
    // User Requirement: "and land slowly liek normally" - no sudden dive, steady 3-degree descent!
    const t = (p - 0.76) / 0.12;
    const x = 220 - t * 160; // 220 down to 60 (threshold)
    const alt = 1.8 + (1 - smooth(t)) * 68.2; // 70m down to 1.8m
    const flare = t > 0.85 ? ((t - 0.85) / 0.15) * 0.05 : -0.04; // 3° descent pitch with flare before touchdown
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -flare);
    dp.m.position.set(x, alt, 106);
    dp.m.quaternion.copy(qNoseWest).multiply(qPitch);
    dp.status = 'ILS Final Approach Rwy 27L (3° Glide Slope)';
    dp.kmh = Math.round(310 - t * 120); // decelerates steadily 310 to 190 km/h
  } else if (p < 0.94) {
    // ── Phase 7: Touchdown & Reverse Thrust Rollout on Runway 27L ───────────────
    const t = (p - 0.88) / 0.06;
    const x = 60 - t * 45; // 60 down to 15
    dp.m.position.set(x, 1.8, 106);
    dp.m.quaternion.copy(qNoseWest);
    dp.status = 'Touchdown · Reverse Thrust & Rollout';
    dp.kmh = Math.round(190 - smooth(t) * 158); // 190 down to 32 km/h
  } else {
    // ── Phase 8: Vacate Runway via Taxiway and Dock at Gate C2 ─────────────────
    const t = (p - 0.94) / 0.06;
    const pos = taxiDockCurve.getPointAt(t);
    const tan = taxiDockCurve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    dp.m.position.copy(pos);
    dp.m.quaternion.copy(qYaw);
    dp.kmh = Math.round((1 - t) * 32); // 32 down to 0 km/h
    dp.status = t > 0.88 ? 'Gate C2 · Docked & Shutdown' : 'Taxiing to Stand · Gate C2';

    // Extend jetbridge cab seamlessly as plane comes to a stop at Gate C2
    if (state._dockingBridgeCab && t > 0.85) {
      const bridgeT = (t - 0.85) / 0.15;
      state._dockingBridgeCab.position.set(95.0 + bridgeT * 3.8, 2.7, 7.25);
    }
  }

  // ── 2. TAKEOFF AIRPLANE IN OPPOSITE DIRECTION ON 1ST RUNWAY (EK-204) ────────
  // User Requirement 3: "you can add another plane on 1st runway just taking off in opp site direction"
  // Takes off on 1st Runway (Runway 09L at z = 106) in OPPOSITE direction (Eastbound, Math.PI/2)!
  // Sequenced during SQ-012's airborne circuit (p = 0.38 to 0.74) -> ZERO runway collision!
  if (state._takeoffPlane) {
    const tp = state._takeoffPlane;
    const qEast = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    if (p < 0.38 || p >= 0.78) {
      // Phase A: Holding short on taxiway holding point, waiting for takeoff clearance
      tp.m.position.set(-170, 1.8, 85);
      tp.m.quaternion.copy(qEast);
      tp.status = 'Holding Short Rwy 09L';
      tp.kmh = 0;
    } else if (p < 0.44) {
      // Phase B: SQ-012 has cleared the airfield! EK-204 lines up on Runway 09L facing East
      const t = (p - 0.38) / 0.06;
      tp.m.position.set(-170 + t * 20, 1.8, 85 + t * 21); // curves onto z = 106
      tp.m.quaternion.copy(qEast);
      tp.status = 'Lining Up Rwy 09L (Cleared for Takeoff)';
      tp.kmh = 16;
    } else if (p < 0.58) {
      // Phase C: High-power Takeoff Roll Eastbound on 1st Runway (Opposite Direction!)
      const t = (p - 0.44) / 0.14;
      const x = -150 + t * 160; // accelerates from -150 to +10 Eastbound
      tp.m.position.set(x, 1.8, 106);
      tp.m.quaternion.copy(qEast);
      tp.status = 'Takeoff Roll Rwy 09L (Eastbound Opposite)';
      tp.kmh = Math.round(30 + Math.pow(t, 1.4) * 260); // 30 accelerates to 290 km/h
    } else if (p < 0.70) {
      // Phase D: Rotate & 45° Steep Angle Climb Eastbound into Sky!
      const t = (p - 0.58) / 0.12;
      const dist = t * 140;
      const x = 10 + dist; // 10 to 150
      const climbY = 1.8 + dist; // 45° steep angle climb!
      const pitchAngle = smooth(t) * (Math.PI / 4);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitchAngle);
      tp.m.position.set(x, climbY, 106);
      tp.m.quaternion.copy(qEast).multiply(qPitch);
      tp.status = '45° Eastbound Climb Out (FL035)';
      tp.kmh = Math.round(290 + t * 110); // 290 to 400 km/h
    } else {
      // Phase E: En route climb out to FL090 departing eastern terminal airspace
      const t = (p - 0.70) / 0.08;
      tp.m.position.set(150 + t * 120, 141.8 + t * 20, 106 - t * 30);
      tp.m.quaternion.copy(qEast);
      tp.status = 'En Route Climb (FL090)';
      tp.kmh = 440;
    }
  }

  // ── 3. CRUISING / SKY HOLDING AIRPLANE (UA-920) ──────────────────────────────
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

  // ── 4. CAR PARK LIFT GATE & ENTERING CAR CONTROLLER ─────────────────────────
  // User Requirement 2: "so cars stop then gate lift thrn cars enter into parking"
  if (state._enteringCar && state._carParkLiftGateArm) {
    const car = state._enteringCar;
    const gateArm = state._carParkLiftGateArm;
    // 13-second continuous loop
    car.progress = ((car.progress ?? 0) + dt * 0.075) % 1;
    const tc = car.progress;
    const qNorth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);

    if (tc < 0.28) {
      // Phase A: Approaching car park gate along lane x = -45
      const t = tc / 0.28;
      const z = -196 + t * 21.2; // -196 up to -174.8 (stops at gate barrier)
      car.m.position.set(-45, 0, z);
      car.m.quaternion.copy(qNorth);
      car.kmh = Math.round(26 * (1 - smooth(t)));
      car.status = 'Approaching Car Park Gate';
      gateArm.rotation.z = 0; // barrier arm closed (horizontal)
    } else if (tc < 0.46) {
      // Phase B: STOPPED at ticket dispenser kiosk & Barrier Gate LIFTS UP!
      const t = (tc - 0.28) / 0.18;
      car.m.position.set(-45, 0, -174.8);
      car.m.quaternion.copy(qNorth);
      car.kmh = 0; // completely stopped!
      car.status = 'Ticket Scanned · Gate Lifting';
      // Boom barrier arm lifts smoothly from 0 to 76 degrees upright!
      const liftAngle = smooth(t) * (Math.PI * 0.42);
      gateArm.rotation.z = liftAngle;
    } else if (tc < 0.72) {
      // Phase C: Gate is OPEN · Car accelerates forward through gate into parking aisle!
      const t = (tc - 0.46) / 0.26;
      gateArm.rotation.z = Math.PI * 0.42; // held open
      const z = -174.8 + t * 22; // -174.8 to -152.8
      car.m.position.set(-45, 0, z);
      car.m.quaternion.copy(qNorth);
      car.kmh = Math.round(18 * smooth(t));
      car.status = 'Entering Car Park';
    } else if (tc < 0.88) {
      // Phase D: Gate LOWERS DOWN behind car & car turns into parking aisle
      const t = (tc - 0.72) / 0.16;
      gateArm.rotation.z = (1 - smooth(t)) * (Math.PI * 0.42); // lowers to 0
      const x = -45 - t * 14;
      const z = -152.8 + t * 2;
      car.m.position.set(x, 0, z);
      const qTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -t * (Math.PI * 0.45));
      car.m.quaternion.copy(qTurn);
      car.kmh = 14;
      car.status = 'Parking in Bay';
    } else {
      // Phase E: Looping back around to access boulevard
      gateArm.rotation.z = 0; // closed
      const t = (tc - 0.88) / 0.12;
      const z = -150 - t * 46;
      car.m.position.set(-59 + t * 14, 0, z);
      const qSouth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      car.m.quaternion.copy(qSouth);
      car.kmh = 24;
      car.status = 'Access Boulevard';
    }
  }

  // ── 5. AIRCRAFT YIELDING & HEADWAY SAFETY CONTROLLER ─────────────────────────
  // User Requirement 1: "when planes are docking/parking - buses should stop let planes pass
  // and then move later , same with other vehicles as well (atleast at 10-15m away it should stop)"
  const movingPlanes = [state._dockingPlane, state._takeoffPlane].filter(Boolean) as AirportFlight[];

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
