import * as THREE from 'three';
import { at, smooth, poseOn, type SignalApproach } from './threeHelpers';
import type { SceneState, FleetVehicle, Drone, Ship, Forklift, BeltFork, StationVan } from './scene';

const SLA_EXTRA = 17;

function updSignals(sigAps: SignalApproach[], lamps: THREE.InstancedMesh[], LC: THREE.Color[][], t: number) {
  let ch = false;
  sigAps.forEach((ap, n) => {
    let st: number;
    if (ap.flash) st = Math.floor(t * 1.5) % 2 ? 3 : 4;
    else { const c = (t + ap.off) % 28; st = ap.ax === 0 ? (c < 10 ? 2 : c < 12 ? 1 : 0) : (c >= 14 && c < 24 ? 2 : c >= 24 && c < 26 ? 1 : 0); }
    if (st !== ap.state) {
      ap.state = st; ch = true;
      const on = st === 3 ? 1 : st === 4 ? -1 : st === 0 ? 0 : st === 1 ? 1 : 2;
      [0, 1, 2].forEach(k => lamps[k].setColorAt(n, LC[k][k === on ? 0 : 1]));
    }
  });
  if (ch) lamps.forEach(m => { m.instanceColor!.needsUpdate = true; });
}

function drive(state: SceneState & Record<string, unknown>, dt: number) {
  const groups = state._groups as Map<unknown, FleetVehicle[]>;
  groups.forEach((vs, lp: unknown) => {
    const typedLp = lp as { T: number; v: number; sig?: SignalApproach[] };
    const T = typedLp.T, vmax = typedLp.v * 1.6;
    vs.forEach(f => {
      let lim = vmax;
      if (typedLp.sig) for (const ap of typedLp.sig) {
        if (ap.state >= 2) continue;
        const ds = (((ap.d - f.d) % T) + T) % T;
        if (ds > T - 1.2 || ds > 22) continue;
        if (ap.state === 1 && ds < f.spd * f.spd / 12 + 0.6) continue;
        lim = Math.min(lim, Math.sqrt(Math.max(0, ds - 0.35) * 14));
      }
      let g = 1e9;
      for (const o of vs) { if (o === f) continue; const gg = (((o.d - f.d) % T) + T) % T; if (gg < g) g = gg; }
      if (g < 16) lim = Math.min(lim, Math.max(0, (g - 7.5) * 1.4));
      f.spd += Math.max(-9 * dt, Math.min(3.5 * dt, lim - f.spd)); if (f.spd < 0) f.spd = 0;
      f.d += f.spd * dt;
      const ln = Math.floor(f.d / T);
      if (f.ln === undefined) { f.ln = ln; f.t0 = state.simT; }
      else if (ln > f.ln) {
        f.ln = ln;
        const trip = state.simT - (f.t0 ?? 0), free = T / vmax;
        const p = f.p || 3; state.M.pD += p; if (f.delayed || trip - free > SLA_EXTRA) state.M.pL += p;
        f.t0 = state.simT;
      }
    });
  });
}

function canMerge(st: SceneState['stations'][0]) {
  const T = st.lp.T;
  return st.vans.every(o => {
    if (o.state !== 'loop') return true;
    const g = (((o.d + st.spd * st.tex - st.dm) % T) + T) % T;
    return g >= 22 && g <= T - 22;
  });
}

export function runFrame(
  state: SceneState & Record<string, unknown>,
  clock: THREE.Clock,
  paused: boolean,
  calm: boolean,
  sel: number,
  view: HTMLElement,
  cam: THREE.OrthographicCamera,
  v3: THREE.Vector3,
  placed: [number, number][],
  onTagPos: (i: number, sx: number, sy: number, ok: boolean) => void,
) {
  const mult = calm ? 0.35 : 1;
  const dt = Math.min(clock.getDelta(), 0.05) * (paused ? 0 : mult);
  const now = performance.now() / 1000;
  state.simT += dt;

  updSignals(state.sigAps, state.lamps, state.LC, state.simT);
  drive(state, dt);

  const allV = state._allV as FleetVehicle[];
  const dd = state._dd as THREE.Object3D;

  allV.forEach(f => {
    const [x, z] = at(f.lp, f.d), [x2, z2] = at(f.lp, f.d + 0.8);
    f.m.position.set(x, 0, z); f.m.rotation.y = Math.atan2(-(z2 - z), x2 - x);
  });

  const w = view.clientWidth, h = view.clientHeight;
  placed.length = 0;
  [sel, ...state.fleet.map((_, i) => i).filter(i => i !== sel)].forEach(i => {
    const f = state.fleet[i], p = f.m.position;
    if (f.bar) f.bar.style.transform = 'scaleX(' + (((f.d % f.lp.T) + f.lp.T) % f.lp.T / f.lp.T) + ')';
    v3.set(p.x, 3.4, p.z).project(cam);
    const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
    let ok = sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20;
    if (ok) for (const q of placed) if (Math.abs(q[0] - sx) < 125 && Math.abs(q[1] - sy) < 30) { ok = false; break; }
    if (ok) placed.push([sx, sy]);
    onTagPos(i, sx, sy, ok);
  });

  const selPos = state.fleet[sel].m.position;
  state.ring.position.set(selPos.x, 0.12, selPos.z);
  state.ring.scale.setScalar(1 + Math.sin(now * 4) * 0.06);

  const yawOf = state._yawOf as (d: number) => number;
  state.ships.forEach((s: Ship, i) => {
    let yaw = yawOf(s.dir);
    if (s.docks) {
      if (s.state === 'in') { const rem = (s.berth! - s.p) * s.dir; s.p += s.dir * Math.max(0.6, Math.min(s.v, rem * 0.35)) * dt; if (rem < 0.3) { s.state = 'dock'; s.timer = 18 + i * 3; } }
      else if (s.state === 'dock') { s.timer -= dt; if (s.timer <= 0) { s.state = 'turn'; s.turn = 0; } }
      else if (s.state === 'turn') { s.turn = Math.min(1, s.turn + dt / 5); s.off = -20 * smooth(s.turn); yaw += Math.PI * smooth(s.turn); if (s.turn >= 1) s.state = 'out'; }
      else { yaw += Math.PI; s.p -= s.dir * Math.max(1.2, Math.min(s.v, Math.abs(s.p - (s.berth ?? 0)) * 0.3)) * dt; if (Math.abs(s.p) > 150) { s.p = s.start; s.state = 'in'; s.off = 0; } }
    } else { s.p += s.dir * s.v * dt; if (Math.abs(s.p) > 155) s.p = -s.dir * 155; }
    s.m.position.set(s.lane + s.off, -0.2 + Math.sin(now * 1.1 + i) * 0.08, s.p);
    s.m.rotation.set(Math.sin(now * 0.9 + i) * 0.015, yaw, 0);
  });

  const waves = state.waves as { x: number; z: number; s: number }[];
  for (let k = 0; k < waves.length; k++) {
    const q = waves[k]; q.z += q.s * dt; if (q.z > 130) q.z = -130;
    dd.position.set(q.x, 0.07, q.z); dd.rotation.y = Math.PI / 2; dd.updateMatrix();
    state.wm.setMatrixAt(k, dd.matrix);
  }
  state.wm.instanceMatrix.needsUpdate = true; dd.rotation.y = 0;

  state.drones.forEach((d: Drone, i) => {
    let spin = 1;
    if (d.state === 'park') {
      spin = 0.2; d.dwell -= dt;
      d.m.position.set(d.pad.x, d.pad.y + 0.55 + Math.sin(now * 2 + i) * 0.02, d.pad.z);
      d.m.rotation.set(0, d.yaw, 0);
      if (d.dwell <= 0) {
        if (d.want === undefined) d.want = state.simT;
        const free = state.padList.filter(p => !p.owner && p.node !== d.pad.node);
        const q = free.length ? free[Math.floor(Math.random() * free.length)] : null;
        const near = q && state.drones.some((o: Drone) => o !== d && o.state === 'fly' && (Math.hypot(o.m.position.x - d.pad.x, o.m.position.z - d.pad.z) < 6 || Math.hypot(o.m.position.x - q.x, o.m.position.z - q.z) < 6));
        if (q && !near) {
          q.owner = d; d.to = q; d.t = 0; d.state = 'fly'; d.t0 = d.want; d.late = state.simT - d.want > 2.4; d.want = undefined;
          d.yaw = Math.atan2(-(q.z - d.pad.z), q.x - d.pad.x);
        } else d.dwell = 0.8;
      }
    } else {
      const A = d.pad, B = d.to!, dist = Math.hypot(B.x - A.x, B.z - A.z) || 1;
      d.t = Math.min(1, d.t + d.v * dt / (dist + d.cruise * 2));
      const t = d.t, e = smooth(Math.max(0, Math.min(1, (t - 0.12) / 0.76))), pr = Math.min(smooth(Math.min(1, t / 0.18)), smooth(Math.min(1, (1 - t) / 0.18)));
      d.m.position.set(A.x + (B.x - A.x) * e, A.y + (B.y - A.y) * e + 0.55 + d.cruise * pr, A.z + (B.z - A.z) * e);
      d.m.rotation.set(0, d.yaw, Math.sin(Math.PI * e) * -0.1);
      if (t > 0.2 && A.owner === d) A.owner = null;
      if (t >= 1) {
        d.pad = B; d.to = null; d.state = 'park'; d.dwell = 2.5 + Math.random() * 4;
        state.M.dD++; if (d.late) state.M.dL++;
        state.M.fl.push({ dur: state.simT - (d.t0 ?? 0), late: d.late ?? false });
        if (state.M.fl.length > 24) state.M.fl.shift();
      }
    }
    d.m.userData.rs.forEach((r: THREE.Mesh, k: number) => { r.rotation.y += spin * (k % 2 ? 1 : -1) * 0.9; });
  });

  state.stations.forEach(st => {
    const T = st.lp.T;
    st.vans.forEach((v: StationVan) => {
      if (v.state === 'park') {
        v.timer -= dt; v.m.position.set(v.bay!.x, 0, st.cz + 0.9); v.m.rotation.y = Math.PI / 2;
        if (v.timer <= 0 && !st.lock && canMerge(st)) { st.lock = v; v.state = 'exit'; v.s = 0; v.path = v.bay!.exit; v.bay!.van = null; v.bay!.busy = false; }
      } else if (v.state === 'exit' || v.state === 'enter') {
        const p = v.path!;
        let sp: number;
        if (v.state === 'exit') sp = v.s < p.revEnd ? 1.5 : Math.min(st.spd, 2.2 + 0.6 * (v.s - p.revEnd));
        else sp = Math.max(1.3, Math.min(st.spd, (p.T - v.s) * 0.7));
        v.s += sp * dt;
        if (v.s >= p.T) {
          if (v.state === 'exit') { v.state = 'loop'; v.d = st.dm; v.lap = 0; }
          else { v.state = 'park'; v.bay!.van = v; v.bay!.res = null; v.bay!.busy = true; v.timer = 18 + Math.random() * 18; v.m.position.set(v.bay!.x, 0, st.cz + 0.9); v.m.rotation.y = Math.PI / 2; }
          st.lock = null;
        } else { const q = poseOn(p, v.s); v.m.position.set(q[0], 0, q[1]); v.m.rotation.y = q[2]; }
      } else {
        v.d += st.spd * dt; v.lap += dt;
        const q = at(st.lp, v.d), q2 = at(st.lp, v.d + 0.8);
        v.m.position.set(q[0], 0, q[1]); v.m.rotation.y = Math.atan2(-(q2[1] - q[1]), q2[0] - q[0]);
        if (v.lap > 14 && !st.lock) for (const b of st.bays) {
          if (b.van || b.res) continue;
          const ah = (((b.de - v.d) % T) + T) % T;
          if (ah < st.spd * dt + 0.1) { st.lock = v; v.bay = b; b.res = v; v.state = 'enter'; v.path = b.enter; v.s = 0; break; }
        }
      }
    });
  });

  state.forklifts.forEach((f: Forklift) => {
    if (f.ph === 'fwd' || f.ph === 'rev') {
      f.x += (f.ph === 'fwd' ? 1 : -1) * f.fs * 1.7 * dt;
      const pr = (f.x - f.xa) * f.fs, len = (f.xb - f.xa) * f.fs;
      if (f.ph === 'fwd' && pr >= len) { f.x = f.xb; f.ph = 'act'; f.t = 0; f.next = 'rev'; }
      else if (f.ph === 'rev' && pr <= 0) { f.x = f.xa; f.ph = 'act'; f.t = 0; f.next = 'fwd'; }
    } else {
      f.t += dt; const t = f.t;
      if (t < 1) f.fy = 0.7 - 0.58 * smooth(t);
      else if (t < 1.7) { f.fy = 0.12; if (f.carry) { f.carry = false; f.px = f.x + f.fs * 1.55; } }
      else if (t < 2.7) { f.carry = true; f.fy = 0.12 + 0.58 * smooth(t - 1.7); }
      else { f.fy = 0.7; f.ph = f.next; }
    }
    f.m.position.set(f.x, 0, f.z); f.m.rotation.y = f.fs > 0 ? 0 : Math.PI; f.fk.position.y = f.fy;
    if (f.carry) f.crate.position.set(f.x + f.fs * 1.55, f.fy + 0.45, f.z);
    else f.crate.position.set(f.px, 0.57, f.z);
  });

  const BV = state._BV as number;
  state.beltTex.offset.y += BV * dt;
  state.WH.forEach(w => { w.u = Math.max(0.5, w.u - (w.u - 0.5) * 0.0045 * dt); });

  const spawnItem = state._spawnItem as (x: number, z: number, zEnd: number, wh: number) => void;
  state.belts.forEach(b => {
    if (b.kind === 'f') return;
    b.timer -= dt;
    if (b.timer <= 0 && ((state.simT + b.ph) % 34) < 26) { spawnItem(b.x, b.z0 - 0.8, b.zEnd, b.wh); b.timer = 2.3 + Math.random() * 0.7; }
  });

  state.bforks.forEach((f: BeltFork) => {
    if (f.ph === 'fwd' || f.ph === 'rev') {
      f.z += (f.ph === 'fwd' ? 1 : -1) * 1.7 * dt;
      if (f.ph === 'fwd' && f.z >= f.zd) { f.z = f.zd; f.ph = 'drop'; f.t = 0; }
      else if (f.ph === 'rev' && f.z <= f.zp) { f.z = f.zp; f.ph = 'pick'; f.t = 0; }
      if (f.ph === 'rev' && f.z < f.zd - 2.5) f.crate.visible = true;
    } else {
      f.t += dt; const t = f.t;
      if (f.ph === 'pick') {
        if (t < 1) f.fy = 0.7 - 0.58 * smooth(t);
        else if (t < 1.7) { f.fy = 0.12; f.carry = true; }
        else if (t < 2.7) f.fy = 0.12 + 0.58 * smooth(t - 1.7);
        else { f.fy = 0.7; f.ph = 'fwd'; }
      } else {
        if (t < 1) f.fy = 0.7 - 0.14 * smooth(t);
        else if (t < 1.7) { f.fy = 0.56; if (f.carry) { f.carry = false; f.crate.visible = false; spawnItem(f.cx, f.z + 1.55, f.zEnd, f.wh); } }
        else if (t < 2.7) f.fy = 0.56 + 0.14 * smooth(t - 1.7);
        else { f.fy = 0.7; f.ph = 'rev'; }
      }
    }
    f.m.position.set(f.cx, 0, f.z); f.m.rotation.y = -Math.PI / 2; f.fk.position.y = f.fy;
    if (f.carry) f.crate.position.set(f.cx, f.fy + 0.45, f.z + 1.55);
    else f.crate.position.set(f.cx, 0.57, f.zp + 1.55);
  });

  state.items.forEach((it, k) => {
    if (it.on) {
      it.z += BV * dt;
      if (it.z > it.zEnd) {
        it.on = false;
        const w = state.WH[it.wh]; if (w) w.u = Math.min(0.97, w.u + 0.0018 * w.g);
        state.M.rt++;
        const ok = Math.random() > 0.012; if (!ok) state.M.re++;
        state.M.win.push(ok ? 1 : 0); if (state.M.win.length > 300) state.M.win.shift();
      }
    }
    dd.position.set(it.x, it.on ? 1.01 : -20, it.z); dd.updateMatrix();
    state.itemM.setMatrixAt(k, dd.matrix);
  });
  state.itemM.instanceMatrix.needsUpdate = true;

  state.trolleys.forEach(t => { t.g.position.x = t.x0 + Math.sin(now * t.sp + t.ph) * t.amp; });
  state.radars.forEach(r => { r.rotation.y = now * 1.5; });
  state.beaconM.color.setHex(Math.floor(now * 1.6) % 2 ? 0xff5a36 : 0x7a2a1c);
  state.chargers.forEach(c => {
    if (c.busy) c.im.color.setHSL(0.4, 0.85, 0.4 + 0.2 * Math.sin(now * 3 + c.ph));
    else c.im.color.setHex(0x4d7bff);
  });
}

