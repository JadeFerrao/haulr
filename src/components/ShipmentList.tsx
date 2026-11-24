'use client';

import { useEffect, useRef } from 'react';
import type { F1TimingItem } from '@/lib/f1Scene';

export interface BaseTrackableItem {
  id: string;
  route: string;
  row?: HTMLButtonElement;
  st?: HTMLElement;
  eta?: HTMLElement;
  bar?: HTMLElement;
}

interface Props {
  items: BaseTrackableItem[];
  sel: number;
  onSelect: (i: number) => void;
  collapsed: boolean;
  onToggle: () => void;
  title?: string;
  isF1?: boolean;
  fstate?: { msg: string; status: 'red' | 'green' | '' };
  f1Items?: F1TimingItem[];
}

export default function ShipmentList({
  items,
  sel,
  onSelect,
  collapsed,
  onToggle,
  title = 'Live shipments',
  isF1 = false,
  fstate,
  f1Items = [],
}: Props) {
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Attach refs to DOM elements so the frame loop can update their text / progress
  useEffect(() => {
    if (isF1) return;
    items.forEach((item, i) => {
      const el = rowRefs.current[i];
      if (!el) return;
      item.row = el;
      item.st = el.querySelector<HTMLElement>('.st') ?? undefined;
      item.eta = el.querySelector<HTMLElement>('.eta') ?? undefined;
      item.bar = el.querySelector<HTMLElement>('i') ?? undefined;
    });
  }, [items, isF1]);

  return (
    <aside className={`panel list${collapsed ? ' collapsed' : ''}${isF1 ? ' f1' : ''}`} aria-label={title}>
      <h2>
        <span>{title}</span>
        <span className="live">Live</span>
        <button
          className="tg"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={isF1 ? 'timing' : 'rows'}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </h2>

      {isF1 ? (
        <div id="timing">
          {fstate && (
            <div className="fstate" data-s={fstate.status}>
              {fstate.msg}
            </div>
          )}
          {f1Items.map((item, p) => (
            <button
              key={item.code + '-' + item.carIndex}
              className={`trow${item.carIndex === sel ? ' sel' : ''}`}
              onClick={() => onSelect(item.carIndex)}
            >
              <b className="p">{p + 1}</b>
              <i className="chip" style={{ background: item.teamColor }} />
              <span className="d">
                {item.code} <small>{item.team}</small>
              </span>
              <span className="g">{item.gap}</span>
              <span className="ty" style={{ color: item.tyreColor }}>
                {item.tyre}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div id="rows">
          {items.map((item, i) => (
            <button
              key={item.id + '-' + i}
              className={`row${i === sel ? ' sel' : ''}`}
              ref={el => {
                rowRefs.current[i] = el;
              }}
              onClick={() => onSelect(i)}
            >
              <b>{item.id}</b>
              <span className="st"></span>
              <small>{item.route}</small>
              <small className="eta" style={{ textAlign: 'right' }}></small>
              <div className="bar">
                <i />
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
