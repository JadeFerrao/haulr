// ── canvas chart helpers ──────────────────────────────────────────────────────

export function cssv(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fit(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  const d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (!w || !h) return null;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d')!;
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  return [g, r.width, r.height] as [CanvasRenderingContext2D, number, number];
}

function grid(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  g.strokeStyle = cssv('--line');
  g.lineWidth = 1;
  for (let k = 0; k <= n; k++) {
    const y = Math.round(4 + (h - 8) * k / n) + 0.5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

interface Series { d: number[]; c: string; fill?: boolean; dash?: number[] }

export function drawLines(c: HTMLCanvasElement, series: Series[], min?: number) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  grid(g, w, h, 3);
  const all = ([] as number[]).concat(...series.map(s => s.d));
  const mx = Math.max(...all) * 1.08;
  const mn = min === undefined ? Math.min(...all) * 0.95 : min;
  series.forEach(s => {
    const n = s.d.length;
    const X = (i: number) => (i / (n - 1)) * w;
    const Y = (v: number) => h - 6 - (v - mn) / ((mx - mn) || 1) * (h - 14);
    g.beginPath();
    s.d.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
    if (s.fill) {
      g.save(); g.lineTo(w, h); g.lineTo(0, h); g.closePath();
      g.globalAlpha = 0.16; g.fillStyle = s.c; g.fill(); g.restore();
      g.beginPath();
      s.d.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
    }
    g.strokeStyle = s.c; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.setLineDash(s.dash || []); g.stroke(); g.setLineDash([]);
  });
}

export function drawStackBars(c: HTMLCanvasElement, a: number[], b: number[], ca: string, cb: string) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  grid(g, w, h, 3);
  const n = a.length;
  const mx = Math.max(...a.map((v, i) => v + b[i])) * 1.1;
  const bw = w / n;
  a.forEach((v, i) => {
    const ha = v / mx * (h - 8), hb = b[i] / mx * (h - 8);
    const x = i * bw + bw * 0.16, ww = bw * 0.68;
    g.fillStyle = ca; rr(g, x, h - ha, ww, ha, 3); g.fill();
    if (hb > 1) { g.fillStyle = cb; rr(g, x, h - ha - hb, ww, hb, 2); g.fill(); }
  });
}

export function drawFlightBars(c: HTMLCanvasElement, fl: { dur: number; late: boolean }[]) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  grid(g, w, h, 3);
  const mx = Math.max(...fl.map(f => f.dur)) * 1.12;
  const bw = w / fl.length;
  fl.forEach((f, i) => {
    const hh = f.dur / mx * (h - 8);
    g.fillStyle = f.late ? cssv('--amber') : cssv('--blue');
    rr(g, i * bw + bw * 0.16, h - hh, bw * 0.68, hh, 3); g.fill();
  });
}

export function drawWhBars(c: HTMLCanvasElement, WH: { u: number }[]) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  const n = WH.length, bw = w / n;
  g.font = '600 11px Bricolage Grotesque,system-ui,sans-serif';
  g.textAlign = 'center';
  WH.forEach((u, i) => {
    const hh = (u.u - 0.4) / 0.6 * (h - 34);
    const x = i * bw + bw * 0.18, ww = bw * 0.64;
    g.fillStyle = cssv('--line'); rr(g, x, 16, ww, h - 34, 4); g.fill();
    g.fillStyle = u.u >= 0.9 ? cssv('--amber') : cssv('--teal');
    rr(g, x, h - 18 - hh, ww, hh, 4); g.fill();
    g.fillStyle = cssv('--ink'); g.fillText(Math.round(u.u * 100) + '%', x + ww / 2, h - 22 - hh);
    g.fillStyle = cssv('--mute'); g.fillText('W' + (i + 1), x + ww / 2, h - 4);
  });
}

export function drawGapBars(c: HTMLCanvasElement, list: { g: number; col: number; code: string }[]) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  grid(g, w, h, 3);
  const mx = Math.max(1, ...list.map(l => l.g)) * 1.15;
  const bw = w / list.length;
  g.font = '600 10px Bricolage Grotesque,system-ui,sans-serif';
  g.textAlign = 'center';
  list.forEach((l, i) => {
    const hh = Math.max(3, (l.g / mx) * (h - 26));
    const x = i * bw + bw * 0.16, ww = bw * 0.68;
    g.fillStyle = '#' + l.col.toString(16).padStart(6, '0');
    rr(g, x, h - 16 - hh, ww, hh, 3);
    g.fill();
    g.fillStyle = cssv('--mute');
    g.fillText(l.code, x + ww / 2, h - 3);
  });
}

export function drawLapBars(c: HTMLCanvasElement, laps: { t: number; c: number }[], best: number) {
  const q = fit(c); if (!q || !laps.length) return;
  const [g, w, h] = q;
  grid(g, w, h, 3);
  const mn = Math.min(...laps.map(l => l.t)) * 0.97;
  const mx = Math.max(...laps.map(l => l.t)) * 1.02;
  const bw = w / 24;
  laps.forEach((l, i) => {
    const hh = Math.max(4, ((l.t - mn) / ((mx - mn) || 1)) * (h - 14));
    const x = (24 - laps.length + i) * bw + bw * 0.16;
    g.fillStyle = l.t === best ? cssv('--ok') : cssv('--blue');
    rr(g, x, h - hh, bw * 0.68, hh, 3);
    g.fill();
  });
}

export function drawTyreBars(c: HTMLCanvasElement, cars: { comp: number }[]) {
  const q = fit(c); if (!q) return;
  const [g, w, h] = q;
  const cnt = [0, 0, 0];
  cars.forEach(k => cnt[k.comp]++);
  const COMP = [
    { n: 'Soft', c: '#ff4b4b' },
    { n: 'Medium', c: '#ffd23c' },
    { n: 'Hard', c: '#f4f6ff' },
  ];
  g.font = '700 12px Bricolage Grotesque,system-ui,sans-serif';
  g.textAlign = 'center';
  COMP.forEach((cp, i) => {
    const bw = w / 3, x = i * bw + bw * 0.2, ww = bw * 0.6;
    const hh = Math.max(4, (cnt[i] / 10) * (h - 40));
    g.fillStyle = cp.c;
    rr(g, x, h - 22 - hh, ww, hh, 4);
    g.fill();
    g.fillStyle = cssv('--ink');
    g.fillText(String(cnt[i]), x + ww / 2, h - 26 - hh);
    g.fillStyle = cssv('--mute');
    g.fillText(cp.n, x + ww / 2, h - 6);
  });
}


