'use client';

import { useEffect, useState } from 'react';
import { getActiveNetworkMode } from '@/lib/scene';
import DashboardCards from './DashboardCards';

export default function Dashboard() {
  const [mode, setMode] = useState<'logistics' | 'airport'>('logistics');

  useEffect(() => {
    const updateMode = () => {
      setMode(getActiveNetworkMode());
    };
    updateMode();
    const timer = setInterval(updateMode, 800);
    return () => clearInterval(timer);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAirport = mode === 'airport';

  return (
    <section className="dash" id="dashboard" aria-label="Performance and operations dashboard">
      <div className="dh">
        <div>
          <h2>{isAirport ? 'Airport operations & flight metrics' : 'Network performance'}</h2>
          <p>
            {isAirport
              ? 'Real-time flight movements, apron turnaround, fueling and GSE logistics. Sample data.'
              : 'Live figures calculated from the simulation above. Sample data.'}
          </p>
        </div>
        <div className="dh-actions">
          <button
            type="button"
            className="back-to-map-btn"
            onClick={scrollToTop}
            aria-label="Back to 3D map"
          >
            {isAirport ? '↑ 3D Airport View' : '↑ 3D Network'}
          </button>
          <span className="live">Live</span>
        </div>
      </div>
      <DashboardCards />
    </section>
  );
}
