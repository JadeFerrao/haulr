'use client';

import { useEffect, useRef } from 'react';

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
}

export default function ShipmentList({
  items,
  sel,
  onSelect,
  collapsed,
  onToggle,
  title = 'Live shipments',
}: Props) {
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Attach refs to DOM elements so the frame loop can update their text / progress
  useEffect(() => {
    items.forEach((item, i) => {
      const el = rowRefs.current[i];
      if (!el) return;
      item.row = el;
      item.st = el.querySelector<HTMLElement>('.st') ?? undefined;
      item.eta = el.querySelector<HTMLElement>('.eta') ?? undefined;
      item.bar = el.querySelector<HTMLElement>('i') ?? undefined;
    });
  }, [items]);

  return (
    <aside className={`panel list${collapsed ? ' collapsed' : ''}`} aria-label={title}>
      <h2>
        <span>{title}</span>
        <span className="live">Live</span>
        <button
          className="tg"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="rows"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </h2>
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
    </aside>
  );
}
