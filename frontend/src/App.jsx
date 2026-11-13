import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl } from 'react-leaflet';

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
      fetch('/api/hotspots?limit=3000').then(r => r.json()),
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

  const filteredFeatures = data?.features?.filter(f => {
    const p = f.properties;
    if (p.total_frp_mw < minFrp) return false;
    if (filterSensor === 'multi' && !p.is_multi_sensor) return false;
    if (filterSensor === 'viirs' && (p.is_multi_sensor || !p.sensors.includes('VIIRS'))) return false;
    if (filterSensor === 'modis' && (p.is_multi_sensor || !p.sensors.includes('MODIS'))) return false;
    return true;
  }) || [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0d14' }}>
      {/* Sleek Floating Glassmorphic HUD */}
      <div className="hud">
        <h2>🛰️ SparkGrid Harmonizer</h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
          NASA Space Apps Cairo 2026 • MODIS C6.1 & VIIRS 375m
        </p>

        {stats && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="val">{stats.total_clusters.toLocaleString()}</div>
              <div className="lbl">Harmonized Clusters</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #a855f7' }}>
              <div className="val" style={{ color: '#a855f7' }}>{stats.multi_sensor_verified_clusters}</div>
              <div className="lbl">Dual-Sensor Verified</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
              <div className="val" style={{ color: '#ef4444' }}>{stats.viirs_only_clusters.toLocaleString()}</div>
              <div className="lbl">VIIRS (375m)</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid #f97316' }}>
              <div className="val" style={{ color: '#f97316' }}>{stats.modis_only_clusters.toLocaleString()}</div>
              <div className="lbl">MODIS (1km)</div>
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

        {/* Sensor Filter Controls */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🔥 Sensor Layer Filter:
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
              style={{ borderColor: '#a855f7' }}
            >
              🟣 Dual-Verified
            </button>
            <button
              onClick={() => setFilterSensor('viirs')}
              className={`filter-btn ${filterSensor === 'viirs' ? 'active' : ''}`}
              style={{ borderColor: '#ef4444' }}
            >
              🔴 VIIRS (375m)
            </button>
            <button
              onClick={() => setFilterSensor('modis')}
              className={`filter-btn ${filterSensor === 'modis' ? 'active' : ''}`}
              style={{ borderColor: '#f97316' }}
            >
              🟠 MODIS (1km)
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.73rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#a855f7' }}>● Multi-Sensor</span>
          <span style={{ color: '#ef4444' }}>● VIIRS 375m</span>
          <span style={{ color: '#f97316' }}>● MODIS 1km</span>
        </div>
      </div>

      {/* Map Viewport */}
      <MapContainer id="map" center={[15.0, 25.0]} zoom={4} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          key={currentBasemap}
          attribution={BASEMAPS[currentBasemap].attribution}
          url={BASEMAPS[currentBasemap].url}
          maxZoom={BASEMAPS[currentBasemap].maxZoom}
        />

        {filteredFeatures.map(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties;
          const color = getColor(p.is_multi_sensor, p.sensors);
          const radius = Math.min(Math.max(p.total_frp_mw / 25, 4), 16);

          return (
            <CircleMarker
              key={p.cluster_id}
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
                    Cluster #{p.cluster_id} {p.is_multi_sensor ? '🟣 Dual-Sensor' : ''}
                  </div>
                  <div><strong>Harmonization:</strong> {p.harmonization_status}</div>
                  <div><strong>Sensors:</strong> {p.sensors.join(' + ')}</div>
                  <div><strong>Total FRP:</strong> <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{p.total_frp_mw} MW</span></div>
                  <div><strong>Resolution:</strong> {p.effective_resolution_m} m</div>
                  <div><strong>Confidence:</strong> {(p.confidence_score * 100).toFixed(0)}%</div>
                  <div><strong>Detections:</strong> {p.detection_count} (MODIS: {p.modis_detections}, VIIRS: {p.viirs_detections})</div>
                  <div><strong>Max Brightness:</strong> {p.max_brightness_k} K</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                    Overpass: {p.earliest_detection} UTC
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
