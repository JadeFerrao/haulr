'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getActiveSceneState,
  getActiveAirportSceneState,
  getActiveF1SceneState,
  getActiveNetworkMode,
  type SimMetrics,
} from '@/lib/scene';
import type { AirportSceneState } from '@/lib/airportScene';
import type { F1SceneState } from '@/lib/f1Scene';
import {
  drawStackBars,
  drawFlightBars,
  drawLines,
  drawWhBars,
  drawGapBars,
  drawLapBars,
  drawTyreBars,
  cssv,
} from '@/lib/charts';

const nf = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtT = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
};

export default function DashboardCards() {
  const [currentMode, setCurrentMode] = useState<'logistics' | 'airport' | 'f1'>('logistics');

  const c1 = useRef<HTMLCanvasElement>(null);
  const c2 = useRef<HTMLCanvasElement>(null);
  const c3 = useRef<HTMLCanvasElement>(null);
  const c4 = useRef<HTMLCanvasElement>(null);
  const c5 = useRef<HTMLCanvasElement>(null);

  // Logistics / Airport display refs
  const pdRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLSpanElement>(null);
  const plRef = useRef<HTMLSpanElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const dlRef = useRef<HTMLSpanElement>(null);
  const dtRef = useRef<HTMLSpanElement>(null);
  const skRef = useRef<HTMLDivElement>(null);
  const sdRef = useRef<HTMLSpanElement>(null);
  const sp2Ref = useRef<HTMLSpanElement>(null);
  const sxRef = useRef<HTMLSpanElement>(null);
  const waRef = useRef<HTMLDivElement>(null);
  const wuRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<HTMLSpanElement>(null);

  // F1 display refs
  const fLapRef = useRef<HTMLDivElement>(null);
  const fPctRef = useRef<HTMLSpanElement>(null);
  const fFlagRef = useRef<HTMLSpanElement>(null);
  const fBestRef = useRef<HTMLDivElement>(null);
  const fBdrvRef = useRef<HTMLSpanElement>(null);
  const fBlapRef = useRef<HTMLSpanElement>(null);
  const fPitsRef = useRef<HTMLDivElement>(null);
  const fPavgRef = useRef<HTMLSpanElement>(null);
  const fPbestRef = useRef<HTMLSpanElement>(null);
  const fTrkRef = useRef<HTMLDivElement>(null);
  const fAirRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Shared metric state for logistics
    const M: SimMetrics = {
      pD: 18240, pL: 306, dD: 1940, dL: 37,
      fl: Array.from({ length: 24 }, () => ({ dur: 8 + Math.random() * 6, late: Math.random() < 0.05 })),
      rt: 9640, re: 118,
      win: Array.from({ length: 300 }, () => (Math.random() > 0.012 ? 1 : 0)),
      kwh: 14.2, peak: 2480,
      pr: [], pl: [], sol: [], dem: [], acc: [],
    };

    let lastPD = M.pD, lastPL = M.pL;

    function dashTick() {
      const mode = getActiveNetworkMode();
      setCurrentMode(mode);

      if (mode === 'f1') {
        const f1 = getActiveF1SceneState<F1SceneState>();
        if (!f1) return;

        const order = f1.timing();
        const lead = order[0];
        const lapN = Math.max(1, Math.min(10, lead.lap));
        const phase = f1.getPhase();
        const flagText = f1.cop.mode === 'lap'
          ? 'Safety car'
          : phase === 'grid'
          ? 'On the grid'
          : phase === 'lights'
          ? 'Start lights'
          : phase === 'race'
          ? 'Green flag'
          : phase === 'finish'
          ? 'Chequered flag'
          : 'Race over';

        if (fLapRef.current) fLapRef.current.textContent = `Lap ${lapN} / 10`;
        if (fPctRef.current) fPctRef.current.textContent = `${Math.round(Math.max(0, Math.min(10, lead.lap - 1)) / 10 * 100)}% complete`;
        if (fFlagRef.current) fFlagRef.current.textContent = flagText;

        const b = f1.ST.best;
        if (fBestRef.current) fBestRef.current.textContent = b.t < 1e8 ? fmtT(b.t * 3.9) : '—';
        if (fBdrvRef.current) fBdrvRef.current.textContent = b.t < 1e8 ? `${b.drv} · ${b.team}` : 'No timed laps yet';
        if (fBlapRef.current) fBlapRef.current.textContent = b.t < 1e8 ? `Lap ${b.lap}` : '';

        const avg = f1.ST.stops.length ? f1.ST.stops.reduce((s, v) => s + v, 0) / f1.ST.stops.length : 0;
        const bestS = f1.ST.stops.length ? Math.min(...f1.ST.stops) : 0;
        if (fPitsRef.current) fPitsRef.current.textContent = String(f1.ST.stopN);
        if (fPavgRef.current) fPavgRef.current.textContent = f1.ST.stops.length ? `avg ${avg.toFixed(1)} s` : 'avg —';
        if (fPbestRef.current) fPbestRef.current.textContent = f1.ST.stops.length ? `best ${bestS.toFixed(1)} s` : '';

        const rt = f1.getRt();
        if (fTrkRef.current) fTrkRef.current.textContent = `${Math.round(44 + Math.sin(rt / 40) * 1.5)}°C`;
        if (fAirRef.current) fAirRef.current.textContent = `Air ${Math.round(31 + Math.sin(rt / 55))}°C · wind ${Math.round(9 + Math.sin(rt / 17) * 3)} km/h`;

        if (c1.current) {
          const list = order.map((c, p) => ({
            g: p ? ((lead.lap * f1.TL + lead.s) - (c.lap * f1.TL + c.s)) / 28 * 3.9 : 0,
            col: c.tm[1],
            code: c.tm[2],
          }));
          drawGapBars(c1.current, list);
        }
        if (c2.current) {
          drawLapBars(c2.current, f1.ST.laps, b.t);
        }
        if (c3.current) {
          drawFlightBars(c3.current, f1.ST.stops.map(d => ({ dur: d, late: d >= 3 })));
        }
        if (c4.current) {
          drawTyreBars(c4.current, f1.cars);
        }
      } else if (mode === 'airport') {
        const air = getActiveAirportSceneState<AirportSceneState>();
        const simT = air?.simT ?? 0;
        const flights = air?.flights ?? [];
        const airborne = flights.filter(f => f.subType === 'landing' || f.subType === 'takeoff' || f.subType === 'cruise').length;

        const flightsToday = 342 + Math.floor(simT * 0.4);
        const delayed = 11;
        const onTime = ((1 - delayed / flightsToday) * 100).toFixed(1);
        const fuel = (418.5 + simT * 0.12).toFixed(1);

        if (pdRef.current) pdRef.current.textContent = nf(flightsToday);
        if (potRef.current) potRef.current.textContent = `${onTime}% on time`;
        if (plRef.current) plRef.current.textContent = `${delayed} delayed`;

        if (ddRef.current) ddRef.current.textContent = `${airborne} active`;
        if (dotRef.current) dotRef.current.textContent = 'Rwy 09L active';
        if (dlRef.current) dlRef.current.textContent = '2 parallel taxiways';
        if (dtRef.current) dtRef.current.textContent = '4 gates docked · 8 GSE';

        if (skRef.current) skRef.current.textContent = `${fuel} kGal`;
        if (sdRef.current) sdRef.current.textContent = 'Jet-A1 Fueling';
        if (sp2Ref.current) sp2Ref.current.textContent = 'Peak 46 kGal/hr';
        if (sxRef.current) sxRef.current.textContent = '12 hydrants active';

        if (waRef.current) waRef.current.textContent = '14.2 min';
        if (wuRef.current) wuRef.current.textContent = '98.4%';
        if (wsRef.current) wsRef.current.textContent = '16 GSE units (tugs, catering, fuel, buses)';

        // Draw airport charts
        if (c1.current) {
          const pr = [24, 26, 28, 32, 30, 34, 38, 36, 40, 42, 45, 48, 44, 46, 48];
          const pl = [1, 2, 0, 1, 3, 2, 1, 0, 2, 1, 1, 2, 1, 0, 1];
          drawStackBars(c1.current, pr, pl, cssv('--blue'), cssv('--amber'));
        }
        if (c2.current) {
          const fl = Array.from({ length: 20 }, (_, i) => ({
            dur: 10 + Math.sin(i * 0.6) * 4 + Math.random() * 2,
            late: i === 7 || i === 14,
          }));
          drawFlightBars(c2.current, fl);
        }
        if (c3.current) {
          const sol = Array.from({ length: 24 }, (_, i) => 38 + Math.sin(i * 0.4) * 8);
          const dem = Array.from({ length: 24 }, (_, i) => 34 + Math.cos(i * 0.3) * 6);
          drawLines(c3.current, [{ d: sol, c: cssv('--amber'), fill: true }, { d: dem, c: cssv('--blue'), dash: [6, 5] }], 0);
        }
        if (c5.current) {
          const acc = Array.from({ length: 24 }, (_, i) => 97 + Math.sin(i * 0.5) * 1.5);
          drawLines(c5.current, [{ d: acc, c: cssv('--ok'), fill: true }]);
        }
        if (c4.current) {
          const gates = [
            { u: 0.88 }, { u: 0.72 }, { u: 0.94 }, { u: 0.65 },
            { u: 0.82 }, { u: 0.91 }, { u: 0.76 }, { u: 0.85 }
          ];
          drawWhBars(c4.current, gates);
        }
      } else {
        // Logistics Mode
        const state = getActiveSceneState();
        const simT = (state?.simT as number) ?? 0;
        const chargers = (state?.chargers as { busy: boolean }[]) ?? [];
        const WH = (state?.WH as { u: number }[]) ?? [];
        const drones = (state?.drones as { state: string }[]) ?? [];
        const pvN = (state?.pvN as number) ?? 0;

        const solarNow = () =>
          pvN * 21 * Math.max(0.3, 0.88 + 0.07 * Math.sin(simT / 11) + 0.04 * Math.sin(simT / 3.7 + 1) - 0.38 * Math.pow(Math.max(0, Math.sin(simT / 7.3)), 8)) * 0.95;
        const demandNow = () =>
          1450 + chargers.filter(c => c.busy).length * 22 + 90 * Math.sin(simT / 6);

        const kw = solarNow(), dem = demandNow();
        M.kwh += kw / 60000;
        M.peak = Math.max(M.peak, kw);

        const dd = M.pD - lastPD, dl = M.pL - lastPL;
        lastPD = M.pD; lastPL = M.pL;
        M.pr.push((dd - dl) * 60); M.pl.push(dl * 60);
        M.sol.push(kw); M.dem.push(dem);
        const acc = (M.win.reduce((s, v) => s + v, 0) / M.win.length) * 100;
        M.acc.push(acc);
        [M.pr, M.pl, M.sol, M.dem, M.acc].forEach(a => { while (a.length > 30) a.shift(); });
        while (M.pr.length < 30) {
          M.pr.unshift(M.pr[0] ?? 0); M.pl.unshift(M.pl[0] ?? 0);
          M.sol.unshift(M.sol[0] ?? 0); M.dem.unshift(M.dem[0] ?? 0);
          M.acc.unshift(M.acc[0] ?? 0);
        }

        const avg = M.fl.reduce((s, f) => s + f.dur, 0) / (M.fl.length || 1);
        const util = (WH.reduce((s, w) => s + w.u, 0) / (WH.length || 1)) * 100;

        if (pdRef.current) pdRef.current.textContent = nf(M.pD);
        if (potRef.current) potRef.current.textContent = ((1 - M.pL / M.pD) * 100).toFixed(1) + '% on time';
        if (plRef.current) plRef.current.textContent = nf(M.pL) + ' delayed';

        if (ddRef.current) ddRef.current.textContent = nf(M.dD);
        if (dotRef.current) dotRef.current.textContent = ((1 - M.dL / M.dD) * 100).toFixed(1) + '% on time';
        if (dlRef.current) dlRef.current.textContent = nf(M.dL) + ' delayed';
        if (dtRef.current) dtRef.current.textContent = drones.filter(d => d.state === 'fly').length + ' of ' + drones.length + ' airborne · avg ' + avg.toFixed(0) + ' s';

        if (skRef.current) skRef.current.textContent = nf(kw) + ' kW';
        if (sdRef.current) sdRef.current.textContent = M.kwh.toFixed(1) + ' MWh today';
        if (sp2Ref.current) sp2Ref.current.textContent = 'Peak ' + nf(M.peak) + ' kW';
        if (sxRef.current) sxRef.current.textContent = (kw >= dem ? 'Exporting ' : 'Importing ') + nf(Math.abs(kw - dem)) + ' kW';

        if (waRef.current) waRef.current.textContent = acc.toFixed(1) + '%';
        if (wuRef.current) wuRef.current.textContent = Math.round(util) + '%';
        if (wsRef.current) wsRef.current.textContent = nf(M.rt - M.re) + ' of ' + nf(M.rt) + ' scans matched';

        if (c1.current) drawStackBars(c1.current, M.pr, M.pl, cssv('--teal'), cssv('--amber'));
        if (c2.current) drawFlightBars(c2.current, M.fl);
        if (c3.current) drawLines(c3.current, [{ d: M.sol, c: cssv('--amber'), fill: true }, { d: M.dem, c: cssv('--blue'), dash: [6, 5] }], 0);
        if (c5.current) drawLines(c5.current, [{ d: M.acc, c: cssv('--ok'), fill: true }]);
        if (c4.current) drawWhBars(c4.current, WH);
      }
    }

    dashTick();
    const timer = setInterval(dashTick, 1000);
    return () => clearInterval(timer);
  }, []);

  const isAirport = currentMode === 'airport';
  const isF1 = currentMode === 'f1';

  if (isF1) {
    return (
      <div className="cards">
        <article className="card">
          <header>
            <i className="dot" style={{ background: 'var(--teal)' }} />
            Race progress
          </header>
          <div className="big" ref={fLapRef}>
            Lap 1 / 10
          </div>
          <div className="sub">
            <span ref={fPctRef}>0% complete</span>
            <span className="ok" ref={fFlagRef}>
              Green flag
            </span>
          </div>
          <canvas ref={c1} role="img" aria-label="Gap to the leader by position" />
          <footer>Gap to leader in seconds, by position</footer>
        </article>

        <article className="card">
          <header>
            <i className="dot" style={{ background: 'var(--blue)' }} />
            Fastest lap
          </header>
          <div className="big" ref={fBestRef}>
            —
          </div>
          <div className="sub">
            <span ref={fBdrvRef}>No timed laps yet</span>
            <span ref={fBlapRef} />
          </div>
          <canvas ref={c2} role="img" aria-label="Recent lap times" />
          <footer>Recent racing laps · green = fastest</footer>
        </article>

        <article className="card">
          <header>
            <i className="dot" style={{ background: 'var(--amber)' }} />
            Pit stops
          </header>
          <div className="big" ref={fPitsRef}>
            0
          </div>
          <div className="sub">
            <span ref={fPavgRef}>avg —</span>
            <span className="ok" ref={fPbestRef} />
          </div>
          <canvas ref={c3} role="img" aria-label="Recent pit stop times" />
          <footer>Recent stop times · amber = 3.0 s or slower</footer>
        </article>

        <article className="card">
          <header>
            <i className="dot" style={{ background: 'var(--ok)' }} />
            Track conditions
          </header>
          <div className="big" ref={fTrkRef}>
            44°C
          </div>
          <div className="sub">
            <span ref={fAirRef}>Air 31°C</span>
          </div>
          <canvas ref={c4} role="img" aria-label="Tyre compounds in use" />
          <footer>Tyre compounds currently in use</footer>
        </article>
      </div>
    );
  }

  return (
    <div className="cards">
      {/* Card 1 */}
      <article className="card">
        <header>
          <i className="dot" style={{ background: isAirport ? 'var(--blue)' : 'var(--teal)' }} />
          {isAirport ? 'Flight movements today' : 'Parcels delivered today'}
        </header>
        <div className="big" ref={pdRef}>
          {isAirport ? '342' : '18,240'}
        </div>
        <div className="sub">
          <span className="ok" ref={potRef}>
            {isAirport ? '96.8% on time' : '98.3% on time'}
          </span>
          <span className="warn" ref={plRef}>
            {isAirport ? '11 delayed' : '306 delayed'}
          </span>
        </div>
        <canvas ref={c1} role="img" aria-label="Hourly throughput and delay distribution" />
        <footer>{isAirport ? 'Flight movements per hour · amber = delayed' : 'Parcels per minute · amber = delayed'}</footer>
      </article>

      {/* Card 2 */}
      <article className="card">
        <header>
          <i className="dot" style={{ background: isAirport ? 'var(--teal)' : 'var(--blue)' }} />
          {isAirport ? 'Active airspace & apron' : 'Drone deliveries today'}
        </header>
        <div className="big" ref={ddRef}>
          {isAirport ? '3 active' : '1,940'}
        </div>
        <div className="sub">
          <span className="ok" ref={dotRef}>
            {isAirport ? 'Rwy 09L active' : '98.1% on time'}
          </span>
          <span className="warn" ref={dlRef}>
            {isAirport ? '2 parallel taxiways' : '37 delayed'}
          </span>
          <span ref={dtRef}>{isAirport ? '4 gates docked · 8 GSE' : '0 of 18 airborne'}</span>
        </div>
        <canvas ref={c2} role="img" aria-label="Flight turnaround profile" />
        <footer>{isAirport ? 'Approach & departure interval timeline' : 'Last 24 deliveries · amber = waited for clearance'}</footer>
      </article>

      {/* Card 3 */}
      <article className="card">
        <header>
          <i className="dot" style={{ background: 'var(--amber)' }} />
          {isAirport ? 'Aviation fuel dispatched' : 'Solar output'}
        </header>
        <div className="big" ref={skRef}>
          {isAirport ? '418.5 kGal' : '2,600 kW'}
        </div>
        <div className="sub">
          <span ref={sdRef}>{isAirport ? 'Jet-A1 Fueling' : '14.2 MWh today'}</span>
          <span ref={sp2Ref}>{isAirport ? 'Peak 46 kGal/hr' : 'Peak 2,480 kW'}</span>
          <span className="ok" ref={sxRef}>
            {isAirport ? '12 hydrants active' : 'Exporting'}
          </span>
        </div>
        <canvas ref={c3} role="img" aria-label="Fuel dispatch curve" />
        <footer>{isAirport ? 'Hourly fuel burn (amber) vs scheduled hydrant flow (blue)' : 'Solar output (amber) vs site demand (blue, dashed)'}</footer>
      </article>

      {/* Card 4 */}
      <article className="card">
        <header>
          <i className="dot" style={{ background: 'var(--ok)' }} />
          {isAirport ? 'Turnaround & ground services (GSE)' : 'Warehouse performance'}
        </header>
        <div className="two">
          <div>
            <span className="lbl">{isAirport ? 'Baggage turnaround' : 'Receiving accuracy'}</span>
            <div className="big" ref={waRef}>
              {isAirport ? '14.2 min' : '98.8%'}
            </div>
          </div>
          <div>
            <span className="lbl">{isAirport ? 'Gate efficiency' : 'Space utilisation'}</span>
            <div className="big" ref={wuRef}>
              {isAirport ? '98.4%' : '74%'}
            </div>
          </div>
        </div>
        <div className="sub">
          <span ref={wsRef}>
            {isAirport ? '16 GSE units (tugs, catering, fuel, buses)' : '9,522 of 9,640 scans matched'}
          </span>
        </div>
        <canvas ref={c5} className="sm" role="img" aria-label="Turnaround accuracy" />
        <canvas ref={c4} role="img" aria-label="Gate occupancy by terminal" />
        <footer>{isAirport ? 'Gate occupancy by concourse · amber = 90% or more' : 'Utilisation by warehouse · amber = 90% or more'}</footer>
      </article>
    </div>
  );
}
