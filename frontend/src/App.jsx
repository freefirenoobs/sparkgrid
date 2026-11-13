import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

export default function App() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotspots?limit=1500').then(r => r.json()),
      fetch('/api/hotspots/stats').then(r => r.json())
    ]).then(([hotspots, summaryStats]) => {
      setData(hotspots);
      setStats(summaryStats);
      setLoading(false);
    }).catch(err => {
      console.error("API error:", err);
      setLoading(false);
    });
  }, []);

  const getColor = (isMulti, sensors) => {
    if (isMulti) return '#a855f7'; // Purple for Multi-Sensor Harmonized
    if (sensors.includes('VIIRS')) return '#ef4444'; // Red for VIIRS 375m
    return '#f97316'; // Orange for MODIS 1km
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div className="hud">
        <h2>🛰️ SparkGrid Harmonizer</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
          NASA Space Apps Cairo 2026 • MODIS C6.1 + VIIRS 375m
        </p>

        {stats && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="val">{stats.total_clusters.toLocaleString()}</div>
              <div className="lbl">Harmonized Clusters</div>
            </div>
            <div className="stat-card">
              <div className="val" style={{ color: '#a855f7' }}>{stats.multi_sensor_verified_clusters}</div>
              <div className="lbl">Dual-Sensor Verified</div>
            </div>
            <div className="stat-card">
              <div className="val" style={{ color: '#ef4444' }}>{stats.viirs_only_clusters.toLocaleString()}</div>
              <div className="lbl">VIIRS (375m)</div>
            </div>
            <div className="stat-card">
              <div className="val" style={{ color: '#f97316' }}>{stats.modis_only_clusters.toLocaleString()}</div>
              <div className="lbl">MODIS (1km)</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '14px', fontSize: '0.75rem', display: 'flex', gap: '8px' }}>
          <span className="badge badge-multi">● Multi-Sensor</span>
          <span className="badge badge-viirs">● VIIRS 375m</span>
          <span className="badge badge-modis">● MODIS 1km</span>
        </div>
      </div>

      <MapContainer id="map" center={[15.0, 25.0]} zoom={4} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {data && data.features.map(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties;
          const color = getColor(p.is_multi_sensor, p.sensors);
          const radius = Math.min(Math.max(p.total_frp_mw / 20, 4), 18);

          return (
            <CircleMarker
              key={p.cluster_id}
              center={[lat, lon]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 1 }}
            >
              <Popup>
                <div style={{ color: '#0f172a' }}>
                  <strong>Cluster #{p.cluster_id}</strong><br />
                  <strong>Status:</strong> {p.harmonization_status}<br />
                  <strong>Sensors:</strong> {p.sensors.join(', ')}<br />
                  <strong>Total FRP:</strong> {p.total_frp_mw} MW<br />
                  <strong>Resolution:</strong> {p.effective_resolution_m} m<br />
                  <strong>Confidence:</strong> {(p.confidence_score * 100).toFixed(0)}%<br />
                  <strong>Detections:</strong> {p.detection_count} (M: {p.modis_detections}, V: {p.viirs_detections})<br />
                  <strong>Time:</strong> {p.earliest_detection}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
