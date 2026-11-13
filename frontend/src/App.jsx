import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
  Rectangle,
  Marker,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BASEMAPS = {
  dark: {
    name: '🌑 Dark Matter',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, NOAA'
  },
  satellite: {
    name: '🛰️ Satellite Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, USDA, USGS'
  },
  terrain: {
    name: '🗺️ Street & Topo',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  }
};

// Helper component to programmatically fly the Leaflet map to demo locations
function MapCameraController({ flyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget && flyTarget.center) {
      map.flyTo(flyTarget.center, flyTarget.zoom || 13, {
        animate: true,
        duration: 1.35
      });
    }
  }, [flyTarget, map]);
  return null;
}

// Compute wind speed thermal color & radius for the Wind Speed Heat Layer
function getWindHeatStyle(windSpeed) {
  const spd = Number(windSpeed || 0);
  if (spd >= 8.0) {
    return { color: '#ff0055', fillColor: '#ff0055', label: 'Extreme (>8 m/s)', glowRadius: 24 };
  }
  if (spd >= 5.0) {
    return { color: '#f97316', fillColor: '#fb923c', label: 'High (5–8 m/s)', glowRadius: 18 };
  }
  if (spd >= 2.5) {
    return { color: '#eab308', fillColor: '#facc15', label: 'Moderate (2.5–5 m/s)', glowRadius: 13 };
  }
  return { color: '#38bdf8', fillColor: '#0ea5e9', label: 'Low (<2.5 m/s)', glowRadius: 9 };
}

// Compute geographic bounding box [[south, west], [north, east]] for a square of side `meters`
function getFootprintBounds(lat, lon, meters) {
  const halfM = meters / 2.0;
  const dLat = halfM / 111320.0;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180.0), 0.1);
  const dLon = halfM / (111320.0 * cosLat);
  return [
    [lat - dLat, lon - dLon],
    [lat + dLat, lon + dLon]
  ];
}

// Cache rotated SVG arrow DivIcons by quantized heading (every 5 degrees) + color mode for fast rendering
const arrowIconCache = {};
function getRotatedArrowIcon(headingDeg, colorHex, windSpeed) {
  const qHeading = Math.round((Number(headingDeg) || 0) / 5) * 5;
  const sizeTier = windSpeed >= 6 ? 'lg' : windSpeed >= 3 ? 'md' : 'sm';
  const key = `${qHeading}_${colorHex}_${sizeTier}`;
  if (arrowIconCache[key]) return arrowIconCache[key];

  const px = sizeTier === 'lg' ? 24 : sizeTier === 'md' ? 20 : 17;
  const html = `
    <div style="
      width:${px}px;
      height:${px}px;
      display:flex;
      align-items:center;
      justify-content:center;
      transform: rotate(${qHeading}deg);
      transform-origin: center center;
      pointer-events: none;
      filter: drop-shadow(0 0 3px rgba(0,0,0,0.95));
    ">
      <svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L19 19L12 15L5 19L12 2Z" fill="${colorHex}" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
    </div>
  `;

  const icon = L.divIcon({
    className: 'sparkgrid-arrow-icon',
    html,
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2]
  });
  arrowIconCache[key] = icon;
  return icon;
}

export default function App() {
  const [hotspots, setHotspots] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Basemap
  const [sensorFilter, setSensorFilter] = useState('ALL');
  const [basemap, setBasemap] = useState('dark');
  const [apiMode, setApiMode] = useState('WIND_500'); // 'WIND_500' -> ?limit=500&has_wind=true | 'ALL_3000' -> ?limit=3000
  const [selectedFire, setSelectedFire] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // Role 3 Interactive Layer Toggles
  const [showSpreadArrows, setShowSpreadArrows] = useState(true);
  const [showFootprints, setShowFootprints] = useState(true);
  const [showWindHeat, setShowWindHeat] = useState(false);
  // Industrial flare mode: 'HIGHLIGHT' (yellow highlight), 'GRAY_OUT' (muted gray), 'HIDE' (hidden)
  const [industrialMode, setIndustrialMode] = useState('HIGHLIGHT');
  const [industrialGrayOutCheckbox, setIndustrialGrayOutCheckbox] = useState(false);

  // AI Chat Widget State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: '🛰️ Welcome to SparkGrid AI (NASA Space Apps Cairo 2026). Ask me about MODIS (1km) vs VIIRS (375m) footprint harmonization, fire-spread direction arrows, wind speed risk, or industrial flare filtering!'
    }
  ]);

  const fetchData = async (mode = apiMode) => {
    setLoading(true);
    try {
      const query =
        mode === 'WIND_500'
          ? '/api/hotspots?limit=500&has_wind=true'
          : '/api/hotspots?limit=3000';
      const [hRes, sRes] = await Promise.all([
        fetch(query),
        fetch('/api/hotspots/stats')
      ]);
      const hData = await hRes.json();
      const sData = await sRes.json();
      setHotspots(hData.features || []);
      setStats(sData);
    } catch (e) {
      console.error('Error fetching SparkGrid data:', e);
    } finally {
      setLoading(false);
    }
  };

  const triggerPipeline = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/pipeline/run', { method: 'POST' });
      await fetchData(apiMode);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const contextStr = selectedFire
        ? ` Currently selected hotspot ${selectedFire.cluster_id} at (${selectedFire.latitude}, ${selectedFire.longitude}), sensor=${selectedFire.sensor_source}, footprint=${selectedFire.source_resolution_m}m, FRP=${selectedFire.frp} MW, wind=${selectedFire.wind_speed_mps} m/s, spread_heading=${selectedFire.spread_heading_deg} deg, industrial=${selectedFire.is_industrial}.`
        : '';
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg + contextStr })
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.reply || 'No response from AI.' }
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '⚠️ Error reaching SparkGrid AI.' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    fetchData(apiMode);
  }, [apiMode]);

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((f) => {
      const p = f.properties;
      if (industrialMode === 'HIDE' && p.is_industrial) return false;
      if (sensorFilter === 'ALL') return true;
      if (sensorFilter === 'MULTI') return p.is_multi_sensor;
      if (sensorFilter === 'MODIS') return p.sensor_source === 'MODIS' || p.source_resolution_m === 1000;
      if (sensorFilter === 'VIIRS') return p.sensor_source === 'VIIRS' && p.source_resolution_m === 375;
      if (sensorFilter === 'INDUSTRIAL') return p.is_industrial === true;
      return true;
    });
  }, [hotspots, sensorFilter, industrialMode]);

  // Live counts inside current loaded slice
  const sliceCounts = useMemo(() => {
    let dual = 0;
    let ind = 0;
    let modis1k = 0;
    let viirs375 = 0;
    let withSpread = 0;
    for (const f of hotspots) {
      const p = f.properties;
      if (p.is_multi_sensor) dual++;
      if (p.is_industrial) ind++;
      if (Number(p.source_resolution_m) === 1000) modis1k++;
      else viirs375++;
      if (p.spread_heading_deg !== null && p.spread_heading_deg !== undefined) withSpread++;
    }
    return { dual, ind, modis1k, viirs375, withSpread };
  }, [hotspots]);

  const getMarkerAppearance = (p) => {
    // 1. Industrial Flare handling
    if (p.is_industrial) {
      if (industrialGrayOutCheckbox || industrialMode === 'GRAY_OUT') {
        return {
          stroke: '#64748b',
          fill: '#475569',
          fillOpacity: 0.28,
          weight: 1,
          radius: 4.5,
          arrowColor: '#64748b'
        };
      }
      return {
        stroke: '#fef08a',
        fill: '#eab308',
        fillOpacity: 0.92,
        weight: 2,
        radius: Math.min(Math.max(Math.sqrt(p.frp || 5) * 1.3, 6), 14),
        arrowColor: '#fde047'
      };
    }

    // 2. Wind Speed Heat Layer override
    if (showWindHeat) {
      const spd = Number(p.wind_speed_mps || 0);
      const heat = getWindHeatStyle(spd);
      const radius = Math.min(Math.max(4.5 + spd * 1.55, 5), 20);
      return {
        stroke: '#ffffff',
        fill: heat.fillColor,
        fillOpacity: 0.88,
        weight: 1.5,
        radius,
        arrowColor: heat.color,
        glowColor: heat.fillColor,
        glowRadius: heat.glowRadius
      };
    }

    // 3. Default Sensor Harmonization Colors
    const baseRadius = Math.min(Math.max(Math.sqrt(p.frp || 4) * 1.2, 5), 16);
    if (p.is_multi_sensor) {
      return {
        stroke: '#f3e8ff',
        fill: '#a855f7',
        fillOpacity: 0.9,
        weight: 2,
        radius: baseRadius + 1.5,
        arrowColor: '#d8b4fe'
      };
    }
    if (Number(p.source_resolution_m) === 1000 || p.sensor_source === 'MODIS') {
      return {
        stroke: '#ffedd5',
        fill: '#ff6b00',
        fillOpacity: 0.85,
        weight: 1.5,
        radius: baseRadius,
        arrowColor: '#fdba74'
      };
    }
    return {
      stroke: '#ffe4e6',
      fill: '#ff2a5f',
      fillOpacity: 0.85,
      weight: 1.5,
      radius: baseRadius,
      arrowColor: '#fda4af'
    };
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: '#080b12',
        color: '#f0f4f8',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* Left Mission Control Sidebar */}
      <aside
        style={{
          width: '390px',
          background: 'linear-gradient(180deg, #0d1322 0%, #080b12 100%)',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          zIndex: 1000,
          overflowY: 'auto',
          gap: '12px'
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #ff2a5f, #ff6b00)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '18px',
                boxShadow: '0 0 15px rgba(255,42,95,0.4)'
              }}
            >
              🔥
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                SPARKGRID
              </h1>
              <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                NASA Space Apps • MODIS + VIIRS Harmonizer
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              const next = apiMode === 'WIND_500' ? 'ALL_3000' : 'WIND_500';
              setApiMode(next);
            }}
            title="Switch between Top 500 Wind-Enriched API endpoint and 3,000 Global Clusters"
            style={{
              padding: '5px 8px',
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid #334155',
              background: apiMode === 'WIND_500' ? '#0284c7' : '#1e293b',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {apiMode === 'WIND_500' ? '💨 API: 500 Wind' : '🌍 API: 3,000 All'}
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ background: '#111827', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>HARMONIZED CLUSTERS</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
              {stats?.total_clusters?.toLocaleString() || '11,505'}
            </div>
            <div style={{ fontSize: '10px', color: '#38bdf8' }}>
              Showing {filteredHotspots.length} on map
            </div>
          </div>
          <div style={{ background: '#111827', padding: '10px', borderRadius: '8px', border: '1px solid #3b0764' }}>
            <div style={{ fontSize: '10px', color: '#d8b4fe' }}>DUAL-SENSOR VERIFIED</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#c084fc', marginTop: '2px' }}>
              {stats?.multi_sensor_verified_clusters?.toLocaleString() || sliceCounts.dual}
            </div>
            <div style={{ fontSize: '10px', color: '#a855f7' }}>
              {sliceCounts.dual} in active view
            </div>
          </div>
          <div style={{ background: '#111827', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>1KM vs 375M SPLIT</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fb923c', marginTop: '4px' }}>
              {sliceCounts.modis1k} <span style={{ fontSize: '10px', color: '#94a3b8' }}>MODIS</span> /{' '}
              <span style={{ color: '#f43f5e' }}>{sliceCounts.viirs375}</span>{' '}
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>VIIRS</span>
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>1000m vs 375m pixels</div>
          </div>
          <div style={{ background: '#111827', padding: '10px', borderRadius: '8px', border: '1px solid #422006' }}>
            <div style={{ fontSize: '10px', color: '#fde047' }}>INDUSTRIAL FLARES</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#eab308', marginTop: '2px' }}>
              {stats?.industrial_flares ?? sliceCounts.ind}
            </div>
            <div style={{ fontSize: '10px', color: '#ca8a04' }}>
              {sliceCounts.ind} in active view
            </div>
          </div>
        </div>

        {/* ROLE 3: NEW VISUALIZATION LAYERS PANEL */}
        <div
          style={{
            background: '#0f172a',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              🛰️ Role 3 Tactical Map Layers
            </span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>Live Controls</span>
          </div>

          {/* 1. Fire-Spread Direction Arrows */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 9px',
              background: showSpreadArrows ? 'rgba(56, 189, 248, 0.12)' : '#1e293b',
              border: showSpreadArrows ? '1px solid #0284c7' : '1px solid #334155',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <div>
              <div>🏹 Fire-Spread Direction Arrows</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                Rotated markers via <code>spread_heading_deg</code>
              </div>
            </div>
            <input
              type="checkbox"
              checked={showSpreadArrows}
              onChange={(e) => setShowSpreadArrows(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#0284c7', cursor: 'pointer' }}
            />
          </label>

          {/* 2. 1km vs 375m Footprint Polygons */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 9px',
              background: showFootprints ? 'rgba(168, 85, 247, 0.14)' : '#1e293b',
              border: showFootprints ? '1px solid #9333ea' : '1px solid #334155',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <div>
              <div>📐 1km vs 375m Footprint Polygons</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                MODIS (1000m×1000m) vs VIIRS (375m×375m) squares
              </div>
            </div>
            <input
              type="checkbox"
              checked={showFootprints}
              onChange={(e) => setShowFootprints(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#9333ea', cursor: 'pointer' }}
            />
          </label>

          {/* 3. Wind Speed Heat Layer */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 9px',
              background: showWindHeat ? 'rgba(249, 115, 22, 0.15)' : '#1e293b',
              border: showWindHeat ? '1px solid #f97316' : '1px solid #334155',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <div>
              <div>🌪️ Wind Speed Heat Layer</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                <code>wind_speed_mps</code> drives size & thermal color risk
              </div>
            </div>
            <input
              type="checkbox"
              checked={showWindHeat}
              onChange={(e) => setShowWindHeat(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#f97316', cursor: 'pointer' }}
            />
          </label>

          {/* Wind Speed Heat Legend (when active) */}
          {showWindHeat && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px',
                background: '#090d16',
                padding: '6px',
                borderRadius: '6px',
                fontSize: '9px',
                textAlign: 'center'
              }}
            >
              <div style={{ color: '#38bdf8', fontWeight: 700 }}>● &lt;2.5 m/s Low</div>
              <div style={{ color: '#facc15', fontWeight: 700 }}>● 2.5–5 Mod</div>
              <div style={{ color: '#fb923c', fontWeight: 700 }}>● 5–8 High</div>
              <div style={{ color: '#ff0055', fontWeight: 700 }}>● &gt;8 Extreme</div>
            </div>
          )}

          {/* 4. Industrial Flare Toggle */}
          <div
            style={{
              padding: '8px 9px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '7px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <div>
                <div>🏭 Gray Out Industrial Flares (<code>is_industrial</code>)</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                  {industrialGrayOutCheckbox
                    ? 'Industrial oil/gas flares grayed out (muted)'
                    : 'Industrial flares highlighted in Hazard Yellow'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={industrialGrayOutCheckbox}
                onChange={(e) => {
                  setIndustrialGrayOutCheckbox(e.target.checked);
                  setIndustrialMode(e.target.checked ? 'GRAY_OUT' : 'HIGHLIGHT');
                }}
                style={{ width: '16px', height: '16px', accentColor: '#eab308', cursor: 'pointer' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
              {[
                { id: 'HIGHLIGHT', label: '⚡ Highlight', gray: false },
                { id: 'GRAY_OUT', label: '🌫️ Gray Out', gray: true },
                { id: 'HIDE', label: '🚫 Hide Flares', gray: false }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setIndustrialMode(m.id);
                    setIndustrialGrayOutCheckbox(m.gray);
                  }}
                  style={{
                    padding: '4px 6px',
                    fontSize: '10px',
                    fontWeight: 600,
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    background: industrialMode === m.id ? '#eab308' : '#0f172a',
                    color: industrialMode === m.id ? '#000' : '#94a3b8'
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ONE-CLICK JUDGE DEMO CAMERA PRESETS */}
        <div
          style={{
            background: '#111827',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #1e293b'
          }}
        >
          <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
            🎯 Instant Judge Demo Zoom Presets
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            <button
              onClick={() => {
                setShowFootprints(true);
                setShowSpreadArrows(true);
                setSensorFilter('ALL');
                setFlyTarget({ center: [29.0172, 31.2038], zoom: 14, ts: Date.now() });
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #9333ea',
                background: '#2e1065',
                color: '#f3e8ff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              🇪🇬 Egypt 1km vs 375m
              <div style={{ fontSize: '9px', color: '#c084fc' }}>Beni Suef Nile Footprints</div>
            </button>

            <button
              onClick={() => {
                setShowFootprints(true);
                setShowSpreadArrows(true);
                setSensorFilter('ALL');
                setFlyTarget({ center: [29.6915, 32.3225], zoom: 14, ts: Date.now() });
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #ca8a04',
                background: '#422006',
                color: '#fef08a',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              🏭 Suez Flares + 1km
              <div style={{ fontSize: '9px', color: '#fde047' }}>Gulf of Suez MODIS/VIIRS</div>
            </button>

            <button
              onClick={() => {
                setShowFootprints(true);
                setShowSpreadArrows(true);
                setSensorFilter('ALL');
                setFlyTarget({ center: [12.315, 20.492], zoom: 13, ts: Date.now() });
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #ea580c',
                background: '#431407',
                color: '#ffedd5',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              🔥 Dual-Sensor Cluster
              <div style={{ fontSize: '9px', color: '#fdba74' }}>2006 MW + 1km vs 375m</div>
            </button>

            <button
              onClick={() => {
                setFlyTarget({ center: [24.0, 29.0], zoom: 3, ts: Date.now() });
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              🌍 Global Overview
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>Reset Camera (Zoom 3)</div>
            </button>
          </div>
        </div>

        {/* Basemap & Sensor Filter Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
          <div style={{ background: '#111827', padding: '9px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>
              Sensor & Classification Filter
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {[
                { id: 'ALL', label: 'All Points' },
                { id: 'MULTI', label: '🟣 Dual-Sensor' },
                { id: 'MODIS', label: '🟠 MODIS 1km' },
                { id: 'VIIRS', label: '🔴 VIIRS 375m' },
                { id: 'INDUSTRIAL', label: '🏭 Industrial' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setSensorFilter(btn.id)}
                  style={{
                    padding: '5px 4px',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: sensorFilter === btn.id ? '#ff2a5f' : '#1e293b',
                    color: sensorFilter === btn.id ? '#fff' : '#cbd5e1'
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#111827', padding: '9px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>
              Basemap Layer
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {Object.entries(BASEMAPS).map(([key, bm]) => (
                <button
                  key={key}
                  onClick={() => setBasemap(key)}
                  style={{
                    padding: '5px 4px',
                    borderRadius: '5px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: basemap === key ? '#0284c7' : '#1e293b',
                    color: '#fff'
                  }}
                >
                  {bm.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Hotspot Inspector */}
        <div
          style={{
            background: '#111827',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            flex: 1
          }}
        >
          <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>
            🔍 Selected Cluster Telemetry
          </div>
          {selectedFire ? (
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#fff', fontSize: '13px' }}>{selectedFire.cluster_id}</span>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: selectedFire.is_industrial
                      ? '#eab308'
                      : selectedFire.is_multi_sensor
                      ? '#a855f7'
                      : '#ef4444',
                    color: selectedFire.is_industrial ? '#000' : '#fff'
                  }}
                >
                  {selectedFire.is_industrial
                    ? '🏭 INDUSTRIAL FLARE'
                    : selectedFire.is_multi_sensor
                    ? '🟣 DUAL-VERIFIED'
                    : selectedFire.sensor_source}
                </span>
              </div>
              <div>
                <strong>Coordinates:</strong> {selectedFire.latitude.toFixed(4)}°N, {selectedFire.longitude.toFixed(4)}°E
              </div>
              <div>
                <strong>Pixel Footprint:</strong>{' '}
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  {selectedFire.source_resolution_m}m × {selectedFire.source_resolution_m}m
                </span>{' '}
                ({selectedFire.is_multi_sensor ? 'MODIS 1000m + VIIRS 375m fused' : selectedFire.sensor_source})
              </div>
              <div>
                <strong>Fire Radiative Power:</strong> {selectedFire.frp} MW (Max: {selectedFire.frp_max || selectedFire.frp} MW)
              </div>
              <div>
                <strong>Harmonized Confidence:</strong> {selectedFire.confidence_pct}% ({selectedFire.detection_count} raw points)
              </div>
              {selectedFire.wind_speed_mps != null && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '7px',
                    background: '#1e293b',
                    borderRadius: '6px',
                    borderLeft: '3px solid #38bdf8'
                  }}
                >
                  <div>
                    💨 <strong>Wind Speed:</strong> {selectedFire.wind_speed_mps} m/s (from {selectedFire.wind_dir_deg}°)
                  </div>
                  <div>
                    🏹 <strong>Spread Direction:</strong> {selectedFire.spread_heading_deg}° azimuth
                  </div>
                </div>
              )}
              <button
                onClick={() =>
                  setFlyTarget({
                    center: [selectedFire.latitude, selectedFire.longitude],
                    zoom: 14,
                    ts: Date.now()
                  })
                }
                style={{
                  marginTop: '4px',
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #38bdf8',
                  background: 'rgba(56,189,248,0.15)',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🔍 Zoom to {selectedFire.source_resolution_m}m Footprint Square
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
              Click any hotspot marker or footprint square on the map to inspect its harmonized MODIS/VIIRS pixel footprint, FRP energy, and wind-driven spread heading.
            </div>
          )}
        </div>

        <button
          onClick={triggerPipeline}
          disabled={refreshing}
          style={{
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(90deg, #ff2a5f, #ff6b00)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          {refreshing ? '⏳ Re-Running Harmonization Pipeline...' : '🔄 Sync Live NASA FIRMS + Open-Meteo'}
        </button>
      </aside>

      {/* Main Interactive Map */}
      <main style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[26.5, 30.5]}
          zoom={5}
          style={{ height: '100%', width: '100%', background: '#080b12' }}
        >
          <MapCameraController flyTarget={flyTarget} />
          <TileLayer
            key={basemap}
            url={BASEMAPS[basemap].url}
            attribution={BASEMAPS[basemap].attribution}
          />

          {filteredHotspots.map((feature, idx) => {
            const p = feature.properties;
            const lat = Number(p.latitude);
            const lon = Number(p.longitude);
            const resM = Number(p.source_resolution_m || (p.sensor_source === 'MODIS' ? 1000 : 375));
            const style = getMarkerAppearance(p);
            const hasSpread =
              p.spread_heading_deg !== null &&
              p.spread_heading_deg !== undefined &&
              !(p.is_industrial && (industrialGrayOutCheckbox || industrialMode === 'GRAY_OUT'));

            // Spread vector endpoint (~4-15 km depending on wind speed)
            let spreadLineEnd = null;
            if (hasSpread && showSpreadArrows) {
              const rad = (Number(p.spread_heading_deg) * Math.PI) / 180.0;
              const distDeg = Math.max(Number(p.wind_speed_mps || 3) * 0.012, 0.025);
              spreadLineEnd = [lat + Math.cos(rad) * distDeg, lon + Math.sin(rad) * distDeg];
            }

            return (
              <React.Fragment key={p.cluster_id || idx}>
                {/* 1. 1km vs 375m FOOTPRINT POLYGONS */}
                {showFootprints && (
                  <>
                    {/* If Dual-Sensor Verified, draw outer 1000m MODIS square + inner 375m VIIRS square */}
                    {p.is_multi_sensor && (
                      <Rectangle
                        bounds={getFootprintBounds(lat, lon, 1000)}
                        pathOptions={{
                          color: '#ff6b00',
                          weight: 1.5,
                          dashArray: '4 4',
                          fillColor: '#ff6b00',
                          fillOpacity: 0.12
                        }}
                        eventHandlers={{ click: () => setSelectedFire(p) }}
                      />
                    )}
                    <Rectangle
                      bounds={getFootprintBounds(lat, lon, resM)}
                      pathOptions={{
                        color: p.is_industrial
                          ? style.stroke
                          : p.is_multi_sensor
                          ? '#a855f7'
                          : resM === 1000
                          ? '#ff6b00'
                          : '#ff2a5f',
                        weight: resM === 1000 ? 1.8 : 2.0,
                        fillColor: p.is_industrial
                          ? style.fill
                          : p.is_multi_sensor
                          ? '#a855f7'
                          : resM === 1000
                          ? '#ff6b00'
                          : '#ff2a5f',
                        fillOpacity:
                          p.is_industrial && (industrialGrayOutCheckbox || industrialMode === 'GRAY_OUT')
                            ? 0.08
                            : resM === 1000
                            ? 0.18
                            : 0.28
                      }}
                      eventHandlers={{ click: () => setSelectedFire(p) }}
                    />
                  </>
                )}

                {/* 2. WIND SPEED HEAT LAYER OUTER GLOW */}
                {showWindHeat && !p.is_industrial && style.glowRadius && (
                  <CircleMarker
                    center={[lat, lon]}
                    radius={style.glowRadius}
                    pathOptions={{
                      color: 'transparent',
                      fillColor: style.glowColor,
                      fillOpacity: 0.22
                    }}
                    interactive={false}
                  />
                )}

                {/* 3. CORE HOTSPOT MARKER */}
                <CircleMarker
                  center={[lat, lon]}
                  radius={style.radius}
                  pathOptions={{
                    color: style.stroke,
                    weight: style.weight,
                    fillColor: style.fill,
                    fillOpacity: style.fillOpacity
                  }}
                  eventHandlers={{
                    click: () => setSelectedFire(p)
                  }}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', minWidth: '215px', fontSize: '12px' }}>
                      <strong style={{ fontSize: '13px' }}>{p.cluster_id}</strong>
                      <hr style={{ margin: '5px 0', borderColor: '#cbd5e1' }} />
                      <div>
                        <b>Sensor:</b> {p.sensor_source}{' '}
                        {p.is_multi_sensor ? '✅ (Dual-Verified)' : ''}
                      </div>
                      <div>
                        <b>Pixel Footprint:</b> {resM}m × {resM}m (
                        {resM === 1000 ? '1.0 km² MODIS' : '0.14 km² VIIRS'})
                      </div>
                      <div>
                        <b>Radiative Power (FRP):</b> {p.frp} MW
                      </div>
                      <div>
                        <b>Confidence:</b> {p.confidence_pct}% ({p.detection_count} detections)
                      </div>
                      <div>
                        <b>Industrial Flare:</b> {p.is_industrial ? 'Yes 🏭' : 'No (Biomass/Wildfire)'}
                      </div>
                      {p.wind_speed_mps != null && (
                        <>
                          <div>
                            <b>Wind Speed:</b> {p.wind_speed_mps} m/s (from {p.wind_dir_deg}°)
                          </div>
                          <div>
                            <b>Spread Heading:</b> {p.spread_heading_deg}°
                          </div>
                        </>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>

                {/* 4. FIRE-SPREAD DIRECTION ARROWS (Rotated SVG Marker + Vector Line) */}
                {showSpreadArrows && hasSpread && (
                  <>
                    {spreadLineEnd && (
                      <Polyline
                        positions={[
                          [lat, lon],
                          spreadLineEnd
                        ]}
                        pathOptions={{
                          color: style.arrowColor,
                          weight: 2,
                          dashArray: '3 3',
                          opacity: 0.85
                        }}
                      />
                    )}
                    <Marker
                      position={[lat, lon]}
                      icon={getRotatedArrowIcon(
                        p.spread_heading_deg,
                        style.arrowColor,
                        Number(p.wind_speed_mps || 0)
                      )}
                      interactive={false}
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* Top-Right Floating Legend & Footprint Comparison Card */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(13, 19, 34, 0.92)',
            backdropFilter: 'blur(8px)',
            padding: '12px 15px',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            zIndex: 999,
            fontSize: '11px',
            maxWidth: '285px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: '7px', color: '#f8fafc', fontSize: '12px' }}>
            🛰️ Harmonized Footprint & Vector Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
            <span>
              <b>MODIS + VIIRS</b> (Dual-Verified Nested)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <span style={{ width: '10px', height: '10px', border: '2px solid #ff6b00', background: 'rgba(255,107,0,0.25)', display: 'inline-block' }} />
            <span>
              <b>MODIS Footprint</b> (1000m × 1000m = 1.0 km²)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <span style={{ width: '10px', height: '10px', border: '2px solid #ff2a5f', background: 'rgba(255,42,95,0.35)', display: 'inline-block' }} />
            <span>
              <b>VIIRS Footprint</b> (375m × 375m = 0.14 km²)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: industrialGrayOutCheckbox ? '#64748b' : '#eab308', display: 'inline-block' }} />
            <span>
              <b>Industrial Flare</b> ({industrialGrayOutCheckbox ? 'Grayed Out' : 'Highlighted'})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 800 }}>➤</span>
            <span>
              <b>Spread Arrow</b> (<code>spread_heading_deg</code>)
            </span>
          </div>
        </div>

        {/* Bottom-Right Floating SparkGrid AI Assistant */}
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', zIndex: 1001 }}>
          {chatOpen ? (
            <div
              style={{
                width: '350px',
                height: '440px',
                background: '#0d1322',
                border: '1px solid #334155',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '11px 15px',
                  background: 'linear-gradient(90deg, #ff2a5f, #ff6b00)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 700,
                  fontSize: '13px'
                }}
              >
                <span>🤖 SparkGrid AI Copilot</span>
                <button
                  onClick={() => setChatOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: '12px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px'
                }}
              >
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      background: m.role === 'user' ? '#0284c7' : '#1e293b',
                      color: '#f8fafc',
                      padding: '8px 11px',
                      borderRadius: '10px',
                      maxWidth: '85%',
                      lineHeight: 1.45
                    }}
                  >
                    {m.text}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                    🛰️ Analyzing satellite & wind telemetry...
                  </div>
                )}
              </div>
              <form
                onSubmit={sendChatMessage}
                style={{
                  display: 'flex',
                  borderTop: '1px solid #1e293b',
                  padding: '8px',
                  background: '#080b12'
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about footprints, wind spread, or fires..."
                  style={{
                    flex: 1,
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    marginLeft: '6px',
                    padding: '7px 12px',
                    background: '#ff2a5f',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          ) : (
            <button
              onClick={() => setChatOpen(true)}
              style={{
                padding: '12px 18px',
                borderRadius: '999px',
                border: 'none',
                background: 'linear-gradient(135deg, #ff2a5f, #ff6b00)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(255,42,95,0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              🤖 Ask SparkGrid AI
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
