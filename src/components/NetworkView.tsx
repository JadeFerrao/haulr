'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  buildScene,
  setActiveSceneState,
  setActiveAirportSceneState,
  setActiveF1SceneState,
  setActiveNetworkMode,
  type SceneState,
} from '@/lib/scene';
import { buildAirportScene, type AirportSceneState, type AirportFlight } from '@/lib/airportScene';
import { buildF1Scene, type F1SceneState, type F1TimingItem } from '@/lib/f1Scene';
import { runFrame } from '@/lib/frameLoop';
import { runAirportFrame } from '@/lib/airportFrameLoop';
import ShipmentList, { type BaseTrackableItem } from './ShipmentList';

const fmt = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export default function NetworkView() {
  const [mode, setMode] = useState<'logistics' | 'airport' | 'f1'>('logistics');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLElement>(null);

  // Scene state refs
  const logStateRef = useRef<(SceneState & Record<string, unknown>) | null>(null);
  const airStateRef = useRef<AirportSceneState | null>(null);
  const f1StateRef = useRef<F1SceneState | null>(null);

  const selRef = useRef(0);
  const pausedRef = useRef(false);
  const clockRef = useRef<THREE.Clock | null>(null);
  const rafRef = useRef<number>(0);
  const [paused, setPaused] = useState(false);
  const [fleetItems, setFleetItems] = useState<BaseTrackableItem[]>([]);
  const [f1Timing, setF1Timing] = useState<F1TimingItem[]>([]);
  const [fstate, setFstate] = useState<{ msg: string; status: 'red' | 'green' | '' }>({ msg: '', status: '' });
  const [sel, setSel] = useState(0);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'flights' | 'gse' | 'bus' | 'taxi'>('all');
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const camStateRef = useRef({ az: 0.78, el: 0.62, zoom: 66 });
  const tagEls = useRef<HTMLButtonElement[]>([]);
  const calm = useRef(false);

  useEffect(() => {
    calm.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const updateCopyFade = useCallback(() => {
    if (!copyRef.current) return;
    const zoom = camStateRef.current.zoom;
    // When zoom >= 64, header is 100% visible.
    // As you zoom into the 3D scene (zoom <= 38), it smoothly fades to 0 to prevent visual collision.
    const minZ = 38, maxZ = 64;
    const opacity = Math.max(0, Math.min(1, (zoom - minZ) / (maxZ - minZ)));
    copyRef.current.style.opacity = String(opacity);
    copyRef.current.style.transform = `translateY(${(1 - opacity) * -16}px)`;
    copyRef.current.style.pointerEvents = opacity > 0.05 ? 'auto' : 'none';
  }, []);

  const placeCam = useCallback(() => {
    const isF1 = mode === 'f1';
    const isAirport = mode === 'airport';
    const cam = isF1
      ? (f1StateRef.current?.camera as THREE.OrthographicCamera)
      : isAirport
      ? (airStateRef.current?.camera as THREE.OrthographicCamera)
      : (logStateRef.current?.camera as THREE.OrthographicCamera);
    if (!cam) return;

    const { az, el, zoom } = camStateRef.current;
    const d = 120;
    const view = viewRef.current!;
    const w = view.clientWidth, h = view.clientHeight, a = w / h;
    cam.left = -zoom * a; cam.right = zoom * a; cam.top = zoom; cam.bottom = -zoom;
    cam.updateProjectionMatrix();

    const narrow = w < 900;
    const tgt = isF1
      ? new THREE.Vector3(30, 0, -15)
      : isAirport
      ? new THREE.Vector3(narrow ? -5 : 0, 0, narrow ? 15 : 10)
      : new THREE.Vector3(narrow ? -24 : -38, 0, narrow ? -4 : -8);

    cam.position.set(
      tgt.x + d * Math.cos(el) * Math.cos(az),
      d * Math.sin(el),
      tgt.z + d * Math.cos(el) * Math.sin(az)
    );
    cam.lookAt(tgt);
  }, [mode]);

  const handleZoomStep = useCallback((factor: number) => {
    camStateRef.current.zoom = Math.max(18, Math.min(190, camStateRef.current.zoom * (1 + factor)));
    if (viewRef.current) {
      const w = viewRef.current.clientWidth, h = viewRef.current.clientHeight;
      if (mode === 'f1' && f1StateRef.current) {
        f1StateRef.current.renderer.setSize(w, h, false);
      } else if (mode === 'airport' && airStateRef.current) {
        airStateRef.current.renderer.setSize(w, h, false);
      } else if (logStateRef.current) {
        logStateRef.current.renderer.setSize(w, h, false);
      }
      placeCam();
      updateCopyFade();
    }
  }, [mode, placeCam, updateCopyFade]);

  // Main Scene Lifecycle (switches cleanly between logistics, airport and F1)
  useEffect(() => {
    if (!canvasRef.current || !tagsRef.current || !viewRef.current) return;
    const canvas = canvasRef.current;
    const view = viewRef.current;
    const tagsContainer = tagsRef.current;

    // Reset tags container & refs
    tagsContainer.innerHTML = '';
    tagEls.current = [];
    selRef.current = 0;
    setSel(0);

    let textTimer: NodeJS.Timeout;
    const clock = new THREE.Clock();
    clockRef.current = clock;
    const v3 = new THREE.Vector3();

    if (mode === 'logistics') {
      camStateRef.current = { az: 0.78, el: 0.62, zoom: 66 };
      const state = buildScene(canvas) as SceneState & Record<string, unknown>;
      logStateRef.current = state;
      airStateRef.current = null;
      f1StateRef.current = null;
      setActiveSceneState(state);
      setActiveAirportSceneState(null);
      setActiveF1SceneState(null);
      setActiveNetworkMode('logistics');

      state.fleet.forEach((f, i) => {
        const tag = document.createElement('button');
        tag.className = 'tag' + (i === 0 ? ' sel' : '');
        tag.textContent = f.id;
        tag.addEventListener('click', () => {
          selRef.current = i;
          setSel(i);
          tagEls.current.forEach((t, j) => t?.classList.toggle('sel', j === i));
        });
        tagsContainer.appendChild(tag);
        tagEls.current[i] = tag;
        f.tag = tag;
      });

      setFleetItems([...state.fleet]);

      const sizeIt = () => {
        const w = view.clientWidth, h = view.clientHeight;
        state.renderer.setSize(w, h, false);
        placeCam();
        updateCopyFade();
      };
      const ro = new ResizeObserver(sizeIt);
      ro.observe(view);
      sizeIt();

      const onTagPos = (i: number, sx: number, sy: number, ok: boolean) => {
        const tag = tagEls.current[i]; if (!tag) return;
        tag.style.opacity = ok ? '1' : '0';
        tag.style.pointerEvents = ok ? 'auto' : 'none';
        tag.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      };

      const placed: [number, number][] = [];
      const frame = () => {
        rafRef.current = requestAnimationFrame(frame);
        runFrame(state, clock, pausedRef.current, calm.current, selRef.current, view, state.camera, v3, placed, onTagPos);
        placeCam();
        state.renderer.render(state.scene, state.camera);
      };
      frame();

      textTimer = setInterval(() => {
        state.fleet.forEach(f => {
          const p = ((f.d % f.lp.T) + f.lp.T) % f.lp.T / f.lp.T;
          f.kmh = Math.round((f.spd || 0) * 7.5);
          const loading = p < 0.06, stopped = (f.spd || 0) < 0.2;
          const status = f.delayed ? 'Delayed' : stopped ? 'At signal' : loading ? 'Loading' : 'In transit';
          const cls = f.delayed || stopped ? 'warn' : loading ? 'ok' : 'go';
          if (f.st) { f.st.textContent = status; f.st.className = 'st ' + cls; }
          if (f.tag) f.tag.textContent = f.id + ' · ' + f.kmh + ' km/h';
          if (f.eta) f.eta.textContent = 'ETA ' + fmt((1 - p) * f.lp.T / f.lp.v * 1.5);
        });
        setFleetItems(fs => [...fs]);
      }, 400);

      return () => {
        cancelAnimationFrame(rafRef.current);
        clearInterval(textTimer);
        ro.disconnect();
        tagEls.current.forEach(t => t.remove());
        setActiveSceneState(null);
        state.renderer.dispose();
      };
    } else if (mode === 'f1') {
      // ── F1 CIRCUIT MODE ──
      const narrow = view.clientWidth < 900;
      camStateRef.current = { az: 0.5, el: 0.62, zoom: narrow ? 150 : 110 };
      const f1State = buildF1Scene(canvas);
      f1StateRef.current = f1State;
      logStateRef.current = null;
      airStateRef.current = null;
      setActiveSceneState(null);
      setActiveAirportSceneState(null);
      setActiveF1SceneState(f1State);
      setActiveNetworkMode('f1');

      f1State.cars.forEach((c, i) => {
        const tag = document.createElement('button');
        tag.className = 'tag' + (i === 0 ? ' sel' : '');
        tag.textContent = `P${i + 1} · ${c.tm[2]}`;
        tag.addEventListener('click', () => {
          selRef.current = i;
          setSel(i);
          f1State.select(i);
          tagEls.current.forEach((t, j) => t?.classList.toggle('sel', j === i));
        });
        tagsContainer.appendChild(tag);
        tagEls.current[i] = tag;
        c.tag = tag;
      });

      const sizeIt = () => {
        const w = view.clientWidth, h = view.clientHeight;
        f1State.renderer.setSize(w, h, false);
        placeCam();
        updateCopyFade();
      };
      const ro = new ResizeObserver(sizeIt);
      ro.observe(view);
      sizeIt();

      const onTagPos = (i: number, sx: number, sy: number, ok: boolean) => {
        const tag = tagEls.current[i];
        if (!tag) return;
        tag.style.opacity = ok ? '1' : '0';
        tag.style.pointerEvents = ok ? 'auto' : 'none';
        tag.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      };

      const frame = () => {
        rafRef.current = requestAnimationFrame(frame);
        const mult = calm.current ? 0.35 : 1;
        const dt = Math.min(clock.getDelta(), 0.05) * (pausedRef.current ? 0 : mult);
        const now = performance.now() / 1000;

        f1State.step(dt, now);
        placeCam();
        f1State.renderer.render(f1State.scene, f1State.camera);

        const w = view.clientWidth, h = view.clientHeight;
        const placedPositions: [number, number][] = [];
        const currSel = selRef.current;
        const orderIdxs = [currSel].concat(f1State.cars.map((_, i) => i).filter(i => i !== currSel));

        orderIdxs.forEach(i => {
          const c = f1State.cars[i];
          const p = c.g.position;
          v3.set(p.x, 3, p.z).project(f1State.camera);
          const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
          let ok = sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20;
          if (ok) {
            for (const q of placedPositions) {
              if (Math.abs(q[0] - sx) < 100 && Math.abs(q[1] - sy) < 28) {
                ok = false;
                break;
              }
            }
          }
          if (ok) placedPositions.push([sx, sy]);
          onTagPos(i, sx, sy, ok);
        });
      };
      frame();

      const updateTiming = () => {
        const order = f1State.timing();
        const TS = 3.9;
        const phase = f1State.getPhase();
        const timingItems: F1TimingItem[] = order.map((c, p) => {
          const ah = p ? order[p - 1] : null;
          const gap = ah ? ((ah.lap * f1State.TL + ah.s) - (c.lap * f1State.TL + c.s)) / 28 * TS : 0;
          const st = (phase === 'grid' || phase === 'lights')
            ? 'Grid'
            : c.finPos !== undefined
            ? 'FIN'
            : c.mode === 'pit'
            ? (c.pstate === 'stop' ? 'STOP' : 'PIT')
            : '';
          const gapText = p ? (st || '+' + gap.toFixed(1)) : (st || 'Leader');
          const compInfo = [
            { n: 'S', c: '#ff4b4b' },
            { n: 'M', c: '#ffd23c' },
            { n: 'H', c: '#f4f6ff' },
          ][c.comp] ?? { n: 'M', c: '#ffd23c' };

          if (c.tag) {
            c.tag.textContent = `P${p + 1} · ${c.tm[2]}`;
          }

          return {
            carIndex: c.i,
            code: c.tm[2],
            team: c.tm[0],
            teamColor: '#' + c.tm[1].toString(16).padStart(6, '0'),
            pos: p + 1,
            gap: gapText,
            tyre: compInfo.n,
            tyreColor: compInfo.c,
          };
        });

        setF1Timing(timingItems);
        setFstate(f1State.getFstate());
      };

      updateTiming();
      textTimer = setInterval(updateTiming, 400);

      return () => {
        cancelAnimationFrame(rafRef.current);
        clearInterval(textTimer);
        ro.disconnect();
        tagEls.current.forEach(t => t.remove());
        setActiveF1SceneState(null);
        f1State.renderer.dispose();
      };
    } else {
      // ── AIRPORT MODE ──
      camStateRef.current = { az: 0.85, el: 0.65, zoom: 76 };
      const airState = buildAirportScene(canvas);
      airStateRef.current = airState;
      logStateRef.current = null;
      f1StateRef.current = null;
      setActiveSceneState(null);
      setActiveAirportSceneState(airState);
      setActiveF1SceneState(null);
      setActiveNetworkMode('airport');

      airState.flights.forEach((f: AirportFlight, i: number) => {
        const tag = document.createElement('button');
        tag.className = 'tag' + (f.type === 'airliner' ? ' tag-airliner' : ' tag-gse') + (i === 0 ? ' sel' : '');
        tag.textContent = f.id;
        tag.addEventListener('click', () => {
          selRef.current = i;
          setSel(i);
          tagEls.current.forEach((t, j) => t?.classList.toggle('sel', j === i));
        });
        tagsContainer.appendChild(tag);
        tagEls.current[i] = tag;
        f.tag = tag;
      });

      setFleetItems([...airState.flights]);

      const getFilteredFlights = () => {
        if (filterMode === 'all') return airState.flights;
        if (filterMode === 'flights') return airState.flights.filter(f => f.type === 'airliner');
        if (filterMode === 'gse') return airState.flights.filter(f =>
          f.subType === 'fuel' || f.subType === 'baggage' || f.subType === 'tug' ||
          f.subType === 'ladder' || f.subType === 'catering' || f.subType === 'followme'
        );
        if (filterMode === 'bus') return airState.flights.filter(f => f.subType === 'bus');
        if (filterMode === 'taxi') return airState.flights.filter(f => f.type === 'taxi');
        return airState.flights;
      };

      const sizeIt = () => {
        const w = view.clientWidth, h = view.clientHeight;
        airState.renderer.setSize(w, h, false);
        placeCam();
        updateCopyFade();
      };
      const ro = new ResizeObserver(sizeIt);
      ro.observe(view);
      sizeIt();

      const onTagPos = (i: number, sx: number, sy: number, ok: boolean) => {
        const tag = tagEls.current[i]; if (!tag) return;
        tag.style.opacity = ok ? '1' : '0';
        tag.style.pointerEvents = ok ? 'auto' : 'none';
        tag.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      };

      const placed: [number, number][] = [];
      const frame = () => {
        rafRef.current = requestAnimationFrame(frame);
        runAirportFrame(airState, clock, pausedRef.current, calm.current, selRef.current, view, airState.camera, v3, placed, onTagPos);
        placeCam();
        airState.renderer.render(airState.scene, airState.camera);
      };
      frame();

      textTimer = setInterval(() => {
        airState.flights.forEach(f => {
          if (f.tag) f.tag.textContent = `${f.id} · ${f.kmh} km/h`;
          if (f.st) {
            f.st.textContent = f.status;
            f.st.className = `st ${f.delayed ? 'warn' : f.kmh > 40 ? 'go' : 'ok'}`;
          }
          if (f.eta) {
            if (f.subType === 'landing') f.eta.textContent = 'On Final';
            else if (f.subType === 'takeoff') f.eta.textContent = 'Departing';
            else if (f.subType === 'cruise') f.eta.textContent = 'En Route';
            else if (f.subType === 'parked') f.eta.textContent = 'Gate Stand';
            else if (f.subType === 'docking') f.eta.textContent = 'Gate C2 Dock';
            else if (f.subType === 'catering') f.eta.textContent = 'Inflight Catering';
            else if (f.subType === 'ladder') f.eta.textContent = 'Boarding Stairs';
            else if (f.subType === 'baggage') f.eta.textContent = 'Luggage Train';
            else if (f.subType === 'bus') f.eta.textContent = 'Tarmac Transfer';
            else f.eta.textContent = 'Apron GSE';
          }
          if (f.bar) {
            const prog = f.progress ?? ((f.d && f.lp) ? ((f.d % f.lp.T) / f.lp.T) : 0.65);
            f.bar.style.transform = `scaleX(${Math.max(0.08, Math.min(1, prog))})`;
          }
        });

        const filteredList = getFilteredFlights();
        setFleetItems([...filteredList]);
      }, 400);

      return () => {
        cancelAnimationFrame(rafRef.current);
        clearInterval(textTimer);
        ro.disconnect();
        tagEls.current.forEach(t => t.remove());
        setActiveAirportSceneState(null);
        airState.renderer.dispose();
      };
    }
  }, [mode, placeCam, updateCopyFade, filterMode]);

  // Pointer & Wheel Interaction
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest('.tag')) return;
      dragRef.current = { x: e.clientX, y: e.clientY };
      view.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const cs = camStateRef.current;
      cs.az = cs.az - (e.clientX - dragRef.current.x) * 0.005;
      cs.el = Math.max(0.25, Math.min(1.35, cs.el + (e.clientY - dragRef.current.y) * 0.003));
      dragRef.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = () => { dragRef.current = null; };

    const onWheel = (e: WheelEvent) => {
      const rect = view.getBoundingClientRect();
      const nearBottom = e.clientY > rect.bottom - 75;
      if (e.deltaY > 0 && (nearBottom || camStateRef.current.zoom >= 135)) {
        return; // Allow natural page scroll down to dashboard
      }
      e.preventDefault();
      camStateRef.current.zoom = Math.max(18, Math.min(190, camStateRef.current.zoom * (1 + e.deltaY * 0.001)));
      placeCam();
      updateCopyFade();
    };

    view.addEventListener('pointerdown', onDown);
    view.addEventListener('pointermove', onMove);
    view.addEventListener('pointerup', onUp);
    view.addEventListener('pointercancel', onUp);
    view.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      view.removeEventListener('pointerdown', onDown);
      view.removeEventListener('pointermove', onMove);
      view.removeEventListener('pointerup', onUp);
      view.removeEventListener('pointercancel', onUp);
      view.removeEventListener('wheel', onWheel);
    };
  }, [placeCam, updateCopyFade]);

  const handleSelect = useCallback((i: number) => {
    selRef.current = i;
    setSel(i);
    if (mode === 'f1' && f1StateRef.current) {
      f1StateRef.current.select(i);
    }
    tagEls.current.forEach((t, j) => t?.classList.toggle('sel', j === i));
  }, [mode]);

  const handlePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(p => !p);
  };

  const scrollToDashboard = () => {
    document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="net" aria-label="3D animated network view">
      {/* ── TOP CENTER TOGGLE [ Logistics | Airport | F1 ] ── */}
      <div className="mode-toggle-wrap">
        <div className="mode-toggle" role="radiogroup" aria-label="Network View Mode">
          <button
            type="button"
            className={`mode-btn ${mode === 'logistics' ? 'active' : ''}`}
            onClick={() => setMode('logistics')}
            role="radio"
            aria-checked={mode === 'logistics'}
          >
            <span className="mode-dot logistics-dot" />
            Logistics
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'airport' ? 'active' : ''}`}
            onClick={() => setMode('airport')}
            role="radio"
            aria-checked={mode === 'airport'}
          >
            <span className="mode-dot airport-dot" />
            Airport
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'f1' ? 'active' : ''}`}
            onClick={() => setMode('f1')}
            role="radio"
            aria-checked={mode === 'f1'}
          >
            <span className="mode-dot f1-dot" />
            F1
          </button>
        </div>
      </div>

      <div className="view" id="view" ref={viewRef}>
        <canvas ref={canvasRef} id="c" aria-label="3D interactive network simulation" />
        <div id="tags" ref={tagsRef} />
      </div>

      <header className="copy" ref={copyRef}>
        {mode === 'logistics' ? (
          <>
            <h1>Your whole network, seen from above.</h1>
            <p>Every truck, dock and parcel updates in real time. Drag to rotate, scroll to zoom, select a truck to follow it.</p>
          </>
        ) : mode === 'airport' ? (
          <>
            <h1>International Airport Hub, seen from above.</h1>
            <p>Airplanes taking off & landing, jetways, pushback tugs, baggage trains, fuel tankers and taxis in real time.</p>
          </>
        ) : (
          <>
            <h1>Race day, seen from above.</h1>
            <p>Ten cars, a live pit lane and the paddock. Drag to rotate, scroll to zoom, select a driver to follow.</p>
          </>
        )}
      </header>

      {/* ── LIVE FEED FILTER BAR (AIRPORT MODE ONLY) ── */}
      {mode === 'airport' && (
        <div className="live-feed-filters">
          <button
            type="button"
            className={`filter-chip ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-chip ${filterMode === 'flights' ? 'active' : ''}`}
            onClick={() => setFilterMode('flights')}
          >
            ✈️ Flights
          </button>
          <button
            type="button"
            className={`filter-chip ${filterMode === 'gse' ? 'active' : ''}`}
            onClick={() => setFilterMode('gse')}
          >
            🚧 Airport Service
          </button>
          <button
            type="button"
            className={`filter-chip ${filterMode === 'bus' ? 'active' : ''}`}
            onClick={() => setFilterMode('bus')}
          >
            🚌 Passenger Bus
          </button>
          <button
            type="button"
            className={`filter-chip ${filterMode === 'taxi' ? 'active' : ''}`}
            onClick={() => setFilterMode('taxi')}
          >
            🚕 Taxi
          </button>
        </div>
      )}

      <ShipmentList
        items={fleetItems}
        sel={sel}
        onSelect={handleSelect}
        collapsed={listCollapsed}
        onToggle={() => setListCollapsed(c => !c)}
        title={mode === 'logistics' ? 'Live shipments' : mode === 'airport' ? 'Live flights & GSE' : 'Live timing'}
        isF1={mode === 'f1'}
        fstate={fstate}
        f1Items={f1Timing}
      />

      {/* Floating indicator button to reveal the performance dashboard below */}
      <button
        type="button"
        className="dash-indicator"
        onClick={scrollToDashboard}
        aria-label="Scroll down to performance dashboard"
      >
        <span className="dash-indicator-label">
          {mode === 'logistics'
            ? 'Performance Dashboard'
            : mode === 'airport'
            ? 'Airport Operations Dashboard'
            : 'Race Control Dashboard'}
        </span>
        <span className="dash-indicator-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <div className="net-controls">
        <span className="hint">Drag · scroll or ±</span>
        <div className="zoom-ctrls" role="group" aria-label="Camera zoom">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => handleZoomStep(-0.25)}
            title="Zoom in (+)"
            aria-label="Zoom into scene"
          >
            +
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={() => handleZoomStep(0.25)}
            title="Zoom out (−)"
            aria-label="Zoom out of scene"
          >
            −
          </button>
        </div>
        <button type="button" className="btn" onClick={handlePause} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </section>
  );
}
