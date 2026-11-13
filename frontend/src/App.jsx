import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

const BASEMAPS = {
  dark: {
    name: "Dark HUD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16
  },
  satellite: {
    name: "Satellite Imagery (Esri World)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 19
  },
  osm: {
    name: "OpenStreetMap (Standard)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    maxZoom: 19
  }
};

export default function App() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentBasemap, setCurrentBasemap] = useState('dark');
  const [filterSensor, setFilterSensor] = useState('all');
  const [minFrp, setMinFrp] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotspots?limit=5000').then(r => r.json()),
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

  const getColor = (p) => {
    const isInd = String(p.is_industrial).toLowerCase() === 'true';
    if (isInd) return '#eab308'; // Yellow for Industrial Flares
    if (p.is_multi_sensor) return '#a855f7'; // Purple for Multi-Sensor Harmonized
    const inst = p.instrument || (p.sensors && p.sensors.length ? p.sensors[0] : '');
    if (inst === 'VIIRS' || (p.sensors && p.sensors.includes('VIIRS'))) return '#ef4444'; // Red for VIIRS 375m
    return '#f97316'; // Orange for MODIS 1km
  };

  const getFrp = (p) => {
    return Number(p.total_frp_mw || p.frp_mw || 0);
  };

  const filteredFeatures = data?.features?.filter(f => {
    const p = f.properties || {};
    const frp = getFrp(p);
    if (frp < minFrp) return false;

    const isInd = String(p.is_industrial).toLowerCase() === 'true';
    const isMulti = Boolean(p.is_multi_sensor);
    const inst = p.instrument || (p.sensors && p.sensors.length ? p.sensors[0] : '');

    if (filterSensor === 'multi' && !isMulti) return false;
    if (filterSensor === 'viirs' && (isMulti || (inst !== 'VIIRS' && (!p.sensors || !p.sensors.includes('VIIRS'))))) return false;
    if (filterSensor === 'modis' && (isMulti || (inst !== 'MODIS' && (!p.sensors || !p.sensors.includes('MODIS'))))) return false;
    if (filterSensor === 'industrial' && !isInd) return false;
    if (filterSensor === 'wind' && p.spread_heading_deg === null) return false;

    return true;
  }) || [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0d14' }}>
      {/* Sleek Floating Glassmorphic HUD */}
      <div className="hud">
        <h2>🛰️ SparkGrid Harmonizer</h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
          NASA Space Apps Cairo 2026 • MODIS & VIIRS Engine
        </p>

        {stats && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="val">{stats.total_clusters.toLocaleString()}</div>
              <div className="lbl">Harmonized Clusters</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #a855f7' }}>
              <div className="val" style={{ color: '#c084fc' }}>{stats.multi_sensor_verified_clusters.toLocaleString()}</div>
              <div className="lbl">Dual-Sensor Verified</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #38bdf8' }}>
              <div className="val" style={{ color: '#38bdf8' }}>{stats.with_wind_vectors.toLocaleString()}</div>
              <div className="lbl">With Wind Vectors</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
              <div className="val" style={{ color: '#ef4444' }}>{stats.viirs_only_clusters.toLocaleString()}</div>
              <div className="lbl">VIIRS (375m)</div>
            </div>
          </div>
        )}

        {/* Basemap Switcher Controls */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🗺️ Basemap View:
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setCurrentBasemap('dark')}
              className={`mode-btn ${currentBasemap === 'dark' ? 'active' : ''}`}
            >
              🌑 Dark HUD
            </button>
            <button
              onClick={() => setCurrentBasemap('satellite')}
              className={`mode-btn ${currentBasemap === 'satellite' ? 'active' : ''}`}
            >
              🛰️ Satellite
            </button>
            <button
              onClick={() => setCurrentBasemap('osm')}
              className={`mode-btn ${currentBasemap === 'osm' ? 'active' : ''}`}
            >
              🗺️ Street
            </button>
          </div>
        </div>

        {/* Sensor & Feature Filter Controls */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🔥 Feature Filters:
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterSensor('all')}
              className={`filter-btn ${filterSensor === 'all' ? 'active' : ''}`}
            >
              All ({filteredFeatures.length})
            </button>
            <button
              onClick={() => setFilterSensor('multi')}
              className={`filter-btn ${filterSensor === 'multi' ? 'active' : ''}`}
              style={{ borderColor: '#a855f7', color: '#c084fc' }}
            >
              🟣 Dual-Verified ({stats?.multi_sensor_verified_clusters || 0})
            </button>
            <button
              onClick={() => setFilterSensor('viirs')}
              className={`filter-btn ${filterSensor === 'viirs' ? 'active' : ''}`}
              style={{ borderColor: '#ef4444' }}
            >
              🔴 VIIRS
            </button>
            <button
              onClick={() => setFilterSensor('modis')}
              className={`filter-btn ${filterSensor === 'modis' ? 'active' : ''}`}
              style={{ borderColor: '#f97316' }}
            >
              🟠 MODIS
            </button>
            <button
              onClick={() => setFilterSensor('wind')}
              className={`filter-btn ${filterSensor === 'wind' ? 'active' : ''}`}
              style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
            >
              💨 Wind Vectors
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.73rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#c084fc' }}>● Dual-Verified</span>
          <span style={{ color: '#ef4444' }}>● VIIRS (375m)</span>
          <span style={{ color: '#f97316' }}>● MODIS (1km)</span>
          <span style={{ color: '#38bdf8' }}>💨 Wind Spread</span>
        </div>
      </div>

      {/* Map Viewport */}
      <MapContainer id="map" center={[20.0, 15.0]} zoom={3} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          key={currentBasemap}
          attribution={BASEMAPS[currentBasemap].attribution}
          url={BASEMAPS[currentBasemap].url}
          maxZoom={BASEMAPS[currentBasemap].maxZoom}
        />

        {filteredFeatures.map((f, idx) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const color = getColor(p);
          const frp = getFrp(p);
          const radius = Math.min(Math.max(frp / 15, 4), 16);

          return (
            <CircleMarker
              key={idx}
              center={[lat, lon]}
              radius={radius}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: currentBasemap === 'satellite' ? 0.9 : 0.75,
                weight: p.is_multi_sensor ? 2.5 : 1
              }}
            >
              <Popup>
                <div style={{ color: '#0f172a', fontFamily: 'sans-serif', fontSize: '0.85rem', lineHeight: '1.4' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '6px' }}>
                    {p.is_multi_sensor ? '🟣 Dual-Sensor Verified Fire' : '🔥 Active Fire Hotspot'}
                  </div>
                  <div><strong>Sensors:</strong> {p.sensors ? p.sensors.join(' + ') : (p.instrument || 'Satellite')}</div>
                  <div><strong>Resolution:</strong> {p.effective_resolution_m || 375}m {p.is_multi_sensor ? '(Refined to 375m)' : ''}</div>
                  <div><strong>Total FRP:</strong> <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{frp.toFixed(2)} MW</span></div>
                  <div><strong>Detections Merged:</strong> {p.detection_count || 1} (MODIS: {p.modis_detections || 0}, VIIRS: {p.viirs_detections || 0})</div>
                  <div><strong>Confidence:</strong> {p.confidence_score ? `${(p.confidence_score * 100).toFixed(0)}% (Bayesian Fusion)` : (p.confidence || 'Nominal')}</div>
                  
                  {p.spread_heading_deg !== null && (
                    <div style={{ marginTop: '6px', padding: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px' }}>
                      <div style={{ color: '#166534', fontWeight: 'bold', fontSize: '0.8rem' }}>💨 Open-Meteo Wind Spread</div>
                      <div><strong>Wind Speed:</strong> {p.wind_speed_mps} m/s</div>
                      <div><strong>Wind From:</strong> {p.wind_direction_deg}°</div>
                      <div><strong>Predicted Spread:</strong> <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>Heading {p.spread_heading_deg}°</span></div>
                    </div>
                  )}

                  {String(p.is_industrial).toLowerCase() === 'true' && (
                    <div style={{ marginTop: '4px', color: '#854d0e', fontWeight: 'bold' }}>
                      ⚠️ Static Industrial Flare Detected
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                    Acquired: {p.earliest_detection || p.acq_datetime}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}