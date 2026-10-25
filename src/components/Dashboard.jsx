import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend
} from 'chart.js';
import { TYPE_LABELS, MAX_TIER } from '../data/config';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const chartFont = { family: "'DM Sans', sans-serif" };
const gridColor = 'rgba(100,116,139,0.15)';
const textColor = '#64748b';

export default function Dashboard({ zones, stacks, allContainers, onClose }) {

  const zoneOccupancy = useMemo(() => {
    return zones.map(z => {
      let count = 0;
      const total = z.rows * z.cols * MAX_TIER;
      for (let r = 0; r < z.rows; r++)
        for (let c = 0; c < z.cols; c++)
          count += (stacks[z.id]?.[r]?.[c]?.length || 0);
      return { id: z.id, label: z.label, count, total, pct: total > 0 ? Math.round(count / total * 100) : 0 };
    });
  }, [zones, stacks]);

  const typeCounts = useMemo(() => {
    const counts = {};
    allContainers.forEach(c => {
      counts[c.type] = (counts[c.type] || 0) + 1;
    });
    return counts;
  }, [allContainers]);

  const dwellStats = useMemo(() => {
    const now = new Date();
    const brackets = { '0-3j': 0, '4-7j': 0, '8-14j': 0, '15j+': 0 };
    allContainers.forEach(c => {
      const entry = new Date(c.entryDate);
      const days = Math.floor((now - entry) / 86400000);
      if (days <= 3) brackets['0-3j']++;
      else if (days <= 7) brackets['4-7j']++;
      else if (days <= 14) brackets['8-14j']++;
      else brackets['15j+']++;
    });
    return brackets;
  }, [allContainers]);

  const occupancyData = {
    labels: zoneOccupancy.map(z => `Zone ${z.id}`),
    datasets: [{
      label: 'Occupation %',
      data: zoneOccupancy.map(z => z.pct),
      backgroundColor: ['#38bdf8', '#22c55e', '#f59e0b', '#8b5cf6'],
      borderRadius: 6,
      barThickness: 36,
    }]
  };

  const typeLabels = Object.keys(typeCounts);
  const typeColors = {
    'empty-20': '#22c55e', 'empty-40': '#4ade80',
    'full-20': '#f59e0b', 'full-40': '#fbbf24',
    'reefer': '#8b5cf6', 'reefer-full': '#a78bfa',
  };
  const typeData = {
    labels: typeLabels.map(t => TYPE_LABELS[t] || t),
    datasets: [{
      data: typeLabels.map(t => typeCounts[t]),
      backgroundColor: typeLabels.map(t => typeColors[t] || '#64748b'),
      borderWidth: 0,
    }]
  };

  const dwellData = {
    labels: Object.keys(dwellStats),
    datasets: [{
      label: 'Conteneurs',
      data: Object.values(dwellStats),
      backgroundColor: ['#22c55e', '#38bdf8', '#f59e0b', '#ef4444'],
      borderRadius: 6,
      barThickness: 36,
    }]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { titleFont: chartFont, bodyFont: chartFont },
    },
    scales: {
      x: { ticks: { color: textColor, font: chartFont }, grid: { display: false } },
      y: { ticks: { color: textColor, font: chartFont }, grid: { color: gridColor } },
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: textColor, font: { ...chartFont, size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 },
      },
      tooltip: { titleFont: chartFont, bodyFont: chartFont },
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-dashboard" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Dashboard BI</h3>
            <span className="modal-subtitle">Vue d'ensemble en temps réel</span>
          </div>
          <button className="stack-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* KPI row */}
          <div className="dash-kpi-row">
            <div className="dash-kpi">
              <div className="dash-kpi-value">{allContainers.length}</div>
              <div className="dash-kpi-label">Conteneurs</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-value">
                {zoneOccupancy.length > 0 ? Math.round(zoneOccupancy.reduce((s, z) => s + z.pct, 0) / zoneOccupancy.length) : 0}%
              </div>
              <div className="dash-kpi-label">Occupation moy.</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-value" style={{ color: '#8b5cf6' }}>
                {allContainers.filter(c => c.type.includes('reefer')).length}
              </div>
              <div className="dash-kpi-label">Reefers</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-value" style={{ color: '#ef4444' }}>
                {allContainers.filter(c => c.reefer?.tempAlert).length}
              </div>
              <div className="dash-kpi-label">Alertes temp.</div>
            </div>
          </div>

          <div className="dash-grid">
            <div className="dash-card">
              <div className="dash-card-title">Occupation par zone</div>
              <div className="dash-chart-wrap">
                <Bar data={occupancyData} options={{ ...barOptions, scales: { ...barOptions.scales, y: { ...barOptions.scales.y, max: 100, ticks: { ...barOptions.scales.y.ticks, callback: v => v + '%' } } } }} />
              </div>
            </div>
            <div className="dash-card">
              <div className="dash-card-title">Répartition par type</div>
              <div className="dash-chart-wrap">
                <Doughnut data={typeData} options={doughnutOptions} />
              </div>
            </div>
            <div className="dash-card dash-card-wide">
              <div className="dash-card-title">Durée de séjour (Dwell time)</div>
              <div className="dash-chart-wrap">
                <Bar data={dwellData} options={barOptions} />
              </div>
            </div>
          </div>

          {/* Zone detail table */}
          <div className="dash-card" style={{ marginTop: 16 }}>
            <div className="dash-card-title">Détail par zone</div>
            <table className="dash-table">
              <thead>
                <tr><th>Zone</th><th>Conteneurs</th><th>Capacité</th><th>Occupation</th></tr>
              </thead>
              <tbody>
                {zoneOccupancy.map(z => (
                  <tr key={z.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{z.id}</td>
                    <td>{z.count}</td>
                    <td>{z.total}</td>
                    <td>
                      <div className="dash-bar-cell">
                        <div className="dash-bar-bg">
                          <div className="dash-bar-fill" style={{
                            width: z.pct + '%',
                            background: z.pct > 85 ? '#ef4444' : z.pct > 60 ? '#f59e0b' : '#22c55e'
                          }}></div>
                        </div>
                        <span>{z.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
