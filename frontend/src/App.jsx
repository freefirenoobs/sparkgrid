import React, { useEffect, useState, useMemo } from 'react';
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
    short: '🌑 Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, NOAA'
  },
  satellite: {
    name: '🛰️ Satellite Imagery',
    short: '🛰️ Sat',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, USDA, USGS'
  },
  terrain: {
    name: '🗺️ Street & Topo',
    short: '🗺️ Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  }
};

const DEMO_PRESETS = [
  {
    id: 'egypt_nile',
    title: '🇪🇬 Egypt: 1km vs 375m',
    subtitle: 'Beni Suef Nile Valley (MODIS + VIIRS)',
    center: [29.0172, 31.2038],
    zoom: 14,
    badge: 'Zoom 14',
    border: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.16)'
  },
  {
    id: 'egypt_suez',
    title: '🏭 Gulf of Suez Flares',
    subtitle: 'Ain Sokhna Industrial + 1km/375m',
    center: [29.6915, 32.3225],
    zoom: 14,
    badge: 'Zoom 14',
    border: '#eab308',
    bg: 'rgba(234, 179, 8, 0.15)'
  },
  {
    id: 'dual_megafire',
    title: '🔥 Dual-Verified Megafire',
    subtitle: '2,006 MW Nested 375m inside 1km',
    center: [12.315, 20.492],
    zoom: 13,
    badge: 'Zoom 13',
    border: '#f97316',
    bg: 'rgba(249, 115, 22, 0.16)'
  },
  {
    id: 'basra_flares',
    title: '🛢️ Basra Oil Field Flares',
    subtitle: 'Persian Gulf Industrial Masking',
    center: [30.7, 47.55],
    zoom: 9,
    badge: 'Zoom 9',
    border: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.14)'
  },
  {
    id: 'egypt_overview',
    title: '🇪🇬 Egypt Full Overview',
    subtitle: 'Nile Delta, Sinai & Red Sea',
    center: [28.2, 31.2],
    zoom: 6,
    badge: 'Zoom 6',
    border: '#10b981',
    bg: 'rgba(16, 185, 129, 0.14)'
  },
  {
    id: 'global_reset',
    title: '🌍 Global Planetary View',
    subtitle: 'All Harmonized Active Clusters',
    center: [22.0, 25.0],
    zoom: 3,
    badge: 'Zoom 3',
    border: '#64748b',
    bg: 'rgba(100, 116, 139, 0.16)'
  }
];

function MapCameraController({ flyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget && flyTarget.center) {
      map.flyTo(flyTarget.center, flyTarget.zoom || 13, {
        animate: true,
        duration: 1.25
      });
    }
  }, [flyTarget, map]);
  return null;
}

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

function compassLabel(deg) {
  if (deg === null || deg === undefined) return 'N/A';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((Number(deg) % 360) + 360) % 360 / 22.5) % 16];
}

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

  // Navigation & Responsive Layout State
  const [activeTab, setActiveTab] = useState('LAYERS'); // 'LAYERS' | 'LOCATIONS' | 'INSPECT' | 'AI'
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sensorFilter, setSensorFilter] = useState('ALL');
  const [dayNightFilter, setDayNightFilter] = useState('ALL'); // 'ALL' | 'D' | 'N'
  const [minFrp, setMinFrp] = useState(0);
  const [timeProgress, setTimeProgress] = useState(100); // 1% to 100% of 24h timeline
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);

  const [basemap, setBasemap] = useState('dark');
  const [apiMode, setApiMode] = useState('WIND_500'); // 'WIND_500' | 'ALL_3000'
  const [selectedFire, setSelectedFire] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // Role 3 Tactical Map Toggles
  const [showSpreadArrows, setShowSpreadArrows] = useState(true);
  const [showFootprints, setShowFootprints] = useState(true);
  const [showWindHeat, setShowWindHeat] = useState(false);
  const [industrialMode, setIndustrialMode] = useState('HIGHLIGHT'); // 'HIGHLIGHT' | 'GRAY_OUT' | 'HIDE'
  const [industrialGrayOutCheckbox, setIndustrialGrayOutCheckbox] = useState(false);

  // Role 5 AI Incident Briefing & Chat
  const [aiBriefing, setAiBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: '🛰️ Welcome to SparkGrid AI (NASA Space Apps Cairo 2026). Tap any quick prompt below or ask me about MODIS (1km) vs VIIRS (375m) footprints, Egypt & Suez hotspots, wind-spread vectors, or firefighting action plans!'
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
      const feats = hData.features || [];
      setHotspots(feats);
      setStats(sData);
      if (!selectedFire && feats.length > 0) {
        // Pre-select the dual-verified Egypt cluster SG-EG-0010 if available
        const egDual = feats.find((f) => f.properties?.cluster_id === 'SG-EG-0010') || feats[0];
        setSelectedFire(egDual.properties);
      }
    } catch (e) {
      console.error('Error fetching SparkGrid data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(apiMode);
  }, [apiMode]);

  // 24h Chronological Time-Scrubber Playback Effect
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = setInterval(() => {
      setTimeProgress((prev) => {
        if (prev >= 100) {
          setIsPlayingTimeline(false);
          return 100;
        }
        return prev + 4;
      });
    }, 280);
    return () => clearInterval(timer);
  }, [isPlayingTimeline]);

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

  const requestClusterBriefing = async (clusterProps) => {
    if (!clusterProps?.cluster_id) return;
    setBriefingLoading(true);
    setAiBriefing(null);
    try {
      const res = await fetch(`/api/hotspots/${encodeURIComponent(clusterProps.cluster_id)}/briefing`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setAiBriefing(data);
      }
    } catch (e) {
      console.error('Briefing error:', e);
    } finally {
      setBriefingLoading(false);
    }
  };

  const sendPromptToAi = async (promptText) => {
    if (!promptText.trim() || chatLoading) return;
    const userMsg = promptText.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          selected_cluster: selectedFire || null
        })
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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    if (q.includes('egypt') || q.includes('nile') || q.includes('beni') || q.includes('cairo')) {
      setFlyTarget({ center: [29.0172, 31.2038], zoom: 14, ts: Date.now() });
      return;
    }
    if (q.includes('suez') || q.includes('sinai') || q.includes('sokhna')) {
      setFlyTarget({ center: [29.6915, 32.3225], zoom: 14, ts: Date.now() });
      return;
    }

    // Check if lat,lon pair
    const coordMatch = q.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      setFlyTarget({
        center: [parseFloat(coordMatch[1]), parseFloat(coordMatch[3])],
        zoom: 13,
        ts: Date.now()
      });
      return;
    }

    // Search by cluster_id
    const match = hotspots.find((f) =>
      String(f.properties?.cluster_id || '').toLowerCase().includes(q)
    );
    if (match) {
      const p = match.properties;
      setSelectedFire(p);
      setActiveTab('INSPECT');
      setMobileSheetOpen(true);
      setFlyTarget({ center: [Number(p.latitude), Number(p.longitude)], zoom: 14, ts: Date.now() });
    }
  };

  const filteredHotspots = useMemo(() => {
    const maxCount = Math.max(1, Math.floor((hotspots.length * timeProgress) / 100));
    const timeSliced = hotspots.slice(0, maxCount);

    return timeSliced.filter((f) => {
      const p = f.properties;
      const isInd = p.is_industrial === true || String(p.is_industrial).toLowerCase() === 'true';
      const frp = Number(p.frp || p.frp_mw || 0);

      if (industrialMode === 'HIDE' && isInd) return false;
      if (frp < minFrp) return false;
      if (dayNightFilter !== 'ALL' && String(p.daynight || 'D').toUpperCase() !== dayNightFilter) {
        return false;
      }

      if (sensorFilter === 'ALL') return true;
      if (sensorFilter === 'MULTI') return Boolean(p.is_multi_sensor);
      if (sensorFilter === 'MODIS') return p.sensor_source === 'MODIS' || Number(p.source_resolution_m) === 1000;
      if (sensorFilter === 'VIIRS') return p.sensor_source === 'VIIRS' && Number(p.source_resolution_m) === 375;
      if (sensorFilter === 'INDUSTRIAL') return isInd;
      if (sensorFilter === 'EGYPT') return String(p.cluster_id || '').startsWith('SG-EG-');
      return true;
    });
  }, [hotspots, sensorFilter, industrialMode, minFrp, dayNightFilter, timeProgress]);

  const sliceCounts = useMemo(() => {
    let dual = 0;
    let ind = 0;
    let modis1k = 0;
    let viirs375 = 0;
    let egypt = 0;
    for (const f of hotspots) {
      const p = f.properties;
      if (p.is_multi_sensor) dual++;
      if (p.is_industrial === true || String(p.is_industrial).toLowerCase() === 'true') ind++;
      if (Number(p.source_resolution_m) === 1000) modis1k++;
      else viirs375++;
      if (String(p.cluster_id || '').startsWith('SG-EG-')) egypt++;
    }
    return { dual, ind, modis1k, viirs375, egypt };
  }, [hotspots]);

  // Client-side export of currently filtered hotspots
  const exportCurrentSlice = (format) => {
    if (format === 'geojson') {
      const blob = new Blob(
        [JSON.stringify({ type: 'FeatureCollection', features: filteredHotspots }, null, 2)],
        { type: 'application/geo+json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sparkgrid_filtered_${filteredHotspots.length}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        'cluster_id',
        'latitude',
        'longitude',
        'sensor_source',
        'source_resolution_m',
        'is_multi_sensor',
        'frp_mw',
        'confidence_pct',
        'is_industrial',
        'wind_speed_mps',
        'wind_dir_deg',
        'spread_heading_deg',
        'acq_datetime'
      ];
      const rows = filteredHotspots.map((f) => {
        const p = f.properties;
        return headers.map((h) => JSON.stringify(p[h] ?? p.frp ?? '')).join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sparkgrid_filtered_${filteredHotspots.length}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getMarkerAppearance = (p) => {
    const isInd = p.is_industrial === true || String(p.is_industrial).toLowerCase() === 'true';
    const frp = Number(p.frp || p.frp_mw || 4);

    if (isInd) {
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
        radius: Math.min(Math.max(Math.sqrt(frp) * 1.3, 6), 14),
        arrowColor: '#fde047'
      };
    }

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

    const baseRadius = Math.min(Math.max(Math.sqrt(frp) * 1.2, 5.5), 16);
    if (p.is_multi_sensor) {
      return {
        stroke: '#f3e8ff',
        fill: '#a855f7',
        fillOpacity: 0.92,
        weight: 2,
        radius: baseRadius + 1.5,
        arrowColor: '#d8b4fe'
      };
    }
    if (Number(p.source_resolution_m) === 1000 || p.sensor_source === 'MODIS') {
      return {
        stroke: '#ffedd5',
        fill: '#ff6b00',
        fillOpacity: 0.86,
        weight: 1.6,
        radius: baseRadius,
        arrowColor: '#fdba74'
      };
    }
    return {
      stroke: '#ffe4e6',
      fill: '#ff2a5f',
      fillOpacity: 0.86,
      weight: 1.6,
      radius: baseRadius,
      arrowColor: '#fda4af'
    };
  };

  const selectHotspotAndInspect = (p, shouldFly = false) => {
    setSelectedFire(p);
    setAiBriefing(null);
    setActiveTab('INSPECT');
    if (shouldFly) {
      setFlyTarget({
        center: [Number(p.latitude), Number(p.longitude)],
        zoom: 14,
        ts: Date.now()
      });
    }
  };

  return (
    <div className="sg-app">
      {/* TOP COMMAND HEADER */}
      <header className="sg-header">
        {/* Brand & Live Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="sg-hide-mobile"
            title="Toggle Mission Control Sidebar"
            style={{
              background: '#141d31',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#e2e8f0',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px'
            }}
          >
            ☰
          </button>

          <div
            onClick={() => setFlyTarget({ center: [28.2, 31.2], zoom: 6, ts: Date.now() })}
            style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #ff2a5f, #ff6b00)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '17px',
                boxShadow: '0 0 14px rgba(255,42,95,0.45)'
              }}
            >
              🔥
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.4px' }}>
                  SPARKGRID
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span className="status-dot" style={{ width: '5px', height: '5px' }} />
                  LIVE 2.45×
                </span>
              </div>
              <div
                className="sg-hide-mobile"
                style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.4px' }}
              >
                NASA Space Apps Cairo • MODIS (1km) & VIIRS (375m) Harmonizer
              </div>
            </div>
          </div>
        </div>

        {/* Center Search Box (Desktop) */}
        <form
          onSubmit={handleSearchSubmit}
          className="sg-hide-mobile"
          style={{ flex: 1, maxWidth: '340px', display: 'flex', gap: '6px' }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search Cluster ID (SG-EG-0003), Egypt, Suez, or lat,lon..."
            style={{
              width: '100%',
              background: '#0d1526',
              border: '1px solid rgba(148,163,184,0.22)',
              borderRadius: '8px',
              padding: '6px 11px',
              color: '#f8fafc',
              fontSize: '12px',
              outline: 'none'
            }}
          />
        </form>

        {/* Right Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setApiMode((m) => (m === 'WIND_500' ? 'ALL_3000' : 'WIND_500'))}
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '7px',
              border: '1px solid rgba(56,189,248,0.4)',
              background: apiMode === 'WIND_500' ? 'rgba(2,132,199,0.28)' : '#141d31',
              color: '#38bdf8',
              cursor: 'pointer'
            }}
          >
            {apiMode === 'WIND_500' ? '💨 500 Wind' : '🌍 3,000 All'}
          </button>

          <button
            onClick={() => exportCurrentSlice('geojson')}
            className="sg-hide-mobile"
            title="Download Filtered GeoJSON"
            style={{
              padding: '6px 9px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '7px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: '#141d31',
              color: '#e2e8f0',
              cursor: 'pointer'
            }}
          >
            📥 GeoJSON
          </button>

          <button
            onClick={() => exportCurrentSlice('csv')}
            className="sg-hide-mobile"
            title="Download Filtered CSV"
            style={{
              padding: '6px 9px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '7px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: '#141d31',
              color: '#e2e8f0',
              cursor: 'pointer'
            }}
          >
            📊 CSV
          </button>

          <button
            onClick={() => setShowGuideModal(true)}
            style={{
              padding: '6px 11px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '7px',
              border: '1px solid rgba(168,85,247,0.5)',
              background: 'linear-gradient(135deg, rgba(147,51,234,0.35), rgba(255,42,95,0.35))',
              color: '#f3e8ff',
              cursor: 'pointer'
            }}
          >
            📖 Guide
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="sg-workspace">
        {/* MISSION CONTROL SIDEBAR (Desktop Left Panel / Mobile Slide-Up Bottom Sheet) */}
        <aside
          className={`sg-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${
            mobileSheetOpen ? '' : 'mobile-hidden'
          }`}
        >
          {/* Mobile Sheet Drag / Close Bar */}
          <div className="sg-mobile-sheet-header">
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8' }}>
              {activeTab === 'LAYERS' && '🎛️ Tactical Layers & Filters'}
              {activeTab === 'LOCATIONS' && '🎯 Demo Locations & Feed'}
              {activeTab === 'INSPECT' && '🔍 Cluster Telemetry & AI Briefing'}
              {activeTab === 'AI' && '🤖 SparkGrid AI Copilot'}
            </span>
            <button
              onClick={() => setMobileSheetOpen(false)}
              style={{
                background: 'rgba(148,163,184,0.15)',
                border: 'none',
                color: '#f8fafc',
                borderRadius: '6px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕ Map View
            </button>
          </div>

          {/* Desktop 4-Tab Switcher */}
          <div
            className="sg-hide-mobile"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              padding: '10px 12px 6px 12px',
              borderBottom: '1px solid rgba(148,163,184,0.14)'
            }}
          >
            {[
              { id: 'LAYERS', label: '🎛️ Layers' },
              { id: 'LOCATIONS', label: '🎯 Demo' },
              { id: 'INSPECT', label: '🔍 Inspect' },
              { id: 'AI', label: '🤖 AI Chat' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '7px 4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '7px',
                  border:
                    activeTab === t.id
                      ? '1px solid rgba(56,189,248,0.5)'
                      : '1px solid transparent',
                  background:
                    activeTab === t.id
                      ? 'linear-gradient(135deg, rgba(2,132,199,0.35), rgba(147,51,234,0.25))'
                      : 'rgba(20,29,49,0.6)',
                  color: activeTab === t.id ? '#fff' : '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable Tab Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '11px'
            }}
          >
            {/* ================= TAB 1: LAYERS & FILTERS ================= */}
            {activeTab === 'LAYERS' && (
              <>
                {/* 4 KPI Telemetry Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div
                    style={{
                      background: 'var(--bg-card)',
                      padding: '9px 11px',
                      borderRadius: '9px',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                      UNIFIED CLUSTERS
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#f8fafc' }}>
                      {stats?.total_clusters?.toLocaleString() || '11,505'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#38bdf8' }}>
                      {filteredHotspots.length} shown • 2.45× compressed
                    </div>
                  </div>

                  <div
                    onClick={() => setSensorFilter(sensorFilter === 'MULTI' ? 'ALL' : 'MULTI')}
                    style={{
                      background: 'var(--bg-card)',
                      padding: '9px 11px',
                      borderRadius: '9px',
                      border: '1px solid rgba(168,85,247,0.4)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#d8b4fe', fontWeight: 600 }}>
                      DUAL-SENSOR VERIFIED
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#c084fc' }}>
                      {stats?.multi_sensor_verified_clusters ?? sliceCounts.dual}
                    </div>
                    <div style={{ fontSize: '10px', color: '#a855f7' }}>
                      {sliceCounts.dual} in active slice (MODIS+VIIRS)
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-card)',
                      padding: '9px 11px',
                      borderRadius: '9px',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                      1KM vs 375M SPLIT
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#fb923c', marginTop: '3px' }}>
                      {sliceCounts.modis1k} <span style={{ fontSize: '10px', color: '#94a3b8' }}>MODIS</span> /{' '}
                      <span style={{ color: '#f43f5e' }}>{sliceCounts.viirs375}</span>{' '}
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>VIIRS</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>1.0 km² vs 0.14 km² area</div>
                  </div>

                  <div
                    onClick={() => setSensorFilter(sensorFilter === 'INDUSTRIAL' ? 'ALL' : 'INDUSTRIAL')}
                    style={{
                      background: 'var(--bg-card)',
                      padding: '9px 11px',
                      borderRadius: '9px',
                      border: '1px solid rgba(234,179,8,0.35)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#fde047', fontWeight: 600 }}>
                      INDUSTRIAL FLARES
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#eab308' }}>
                      {stats?.industrial_flares ?? sliceCounts.ind}
                    </div>
                    <div style={{ fontSize: '10px', color: '#ca8a04' }}>
                      {sliceCounts.ind} in active slice • {sliceCounts.egypt} Egypt
                    </div>
                  </div>
                </div>

                {/* ROLE 3 TACTICAL MAP OVERLAYS */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(56,189,248,0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                    🛰️ Tactical Map Overlays (Role 3)
                  </div>

                  {/* Toggle 1: Spread Direction Arrows */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 9px',
                      background: showSpreadArrows ? 'rgba(56, 189, 248, 0.13)' : 'rgba(15, 23, 42, 0.7)',
                      border: showSpreadArrows ? '1px solid #0284c7' : '1px solid rgba(148,163,184,0.18)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    <div>
                      <div>🏹 Fire-Spread Direction Arrows</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                        Rotated azimuth arrows via <code>spread_heading_deg</code>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSpreadArrows}
                      onChange={(e) => setShowSpreadArrows(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                    />
                  </label>

                  {/* Toggle 2: 1km vs 375m Footprint Polygons */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 9px',
                      background: showFootprints ? 'rgba(168, 85, 247, 0.14)' : 'rgba(15, 23, 42, 0.7)',
                      border: showFootprints ? '1px solid #9333ea' : '1px solid rgba(148,163,184,0.18)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    <div>
                      <div>📐 1km vs 375m Footprint Squares</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                        MODIS (1000m×1000m) vs VIIRS (375m×375m) polygons
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showFootprints}
                      onChange={(e) => setShowFootprints(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#9333ea' }}
                    />
                  </label>

                  {/* Toggle 3: Wind Speed Heat Layer */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 9px',
                      background: showWindHeat ? 'rgba(249, 115, 22, 0.15)' : 'rgba(15, 23, 42, 0.7)',
                      border: showWindHeat ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.18)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    <div>
                      <div>🌪️ Wind Speed Heat Layer</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                        <code>wind_speed_mps</code> scales marker radius & thermal risk
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showWindHeat}
                      onChange={(e) => setShowWindHeat(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#f97316' }}
                    />
                  </label>

                  {showWindHeat && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '4px',
                        background: '#090e1a',
                        padding: '6px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ color: '#38bdf8', fontWeight: 700 }}>● &lt;2.5m/s Low</div>
                      <div style={{ color: '#facc15', fontWeight: 700 }}>● 2.5–5 Mod</div>
                      <div style={{ color: '#fb923c', fontWeight: 700 }}>● 5–8 High</div>
                      <div style={{ color: '#ff0055', fontWeight: 700 }}>● &gt;8 Extreme</div>
                    </div>
                  )}

                  {/* Toggle 4: Industrial Flare Filter */}
                  <div
                    style={{
                      padding: '8px 9px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: '1px solid rgba(148,163,184,0.18)',
                      borderRadius: '8px',
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
                            ? 'Oil/gas flares muted so wildfires stand out'
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
                        style={{ width: '16px', height: '16px', accentColor: '#eab308' }}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
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
                            padding: '5px',
                            fontSize: '10px',
                            fontWeight: 700,
                            borderRadius: '5px',
                            border: 'none',
                            cursor: 'pointer',
                            background: industrialMode === m.id ? '#eab308' : '#0b1120',
                            color: industrialMode === m.id ? '#000' : '#94a3b8'
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SENSOR, FRP & 24H TIMELINE CONTROLS (Role 4) */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px'
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Sensor & Region Filter
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                    {[
                      { id: 'ALL', label: '🌍 All' },
                      { id: 'EGYPT', label: '🇪🇬 Egypt' },
                      { id: 'MULTI', label: '🟣 Dual-Sensor' },
                      { id: 'MODIS', label: '🟠 MODIS 1km' },
                      { id: 'VIIRS', label: '🔴 VIIRS 375m' },
                      { id: 'INDUSTRIAL', label: '🏭 Industrial' }
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => setSensorFilter(btn.id)}
                        style={{
                          padding: '6px 4px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: sensorFilter === btn.id ? '#ff2a5f' : '#0f172a',
                          color: sensorFilter === btn.id ? '#fff' : '#cbd5e1'
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Minimum FRP Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8' }}>🔥 Min Radiative Power (FRP):</span>
                      <strong style={{ color: '#fb923c' }}>{minFrp} MW</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="150"
                      step="5"
                      value={minFrp}
                      onChange={(e) => setMinFrp(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#ff6b00', cursor: 'pointer' }}
                    />
                  </div>

                  {/* 24-Hour Chronological Time Scrubber */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: '#94a3b8' }}>⏱️ 24h Orbital Progression:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ color: '#38bdf8' }}>{timeProgress}%</strong>
                        <button
                          onClick={() => {
                            if (timeProgress >= 100) setTimeProgress(10);
                            setIsPlayingTimeline((p) => !p);
                          }}
                          style={{
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            borderRadius: '5px',
                            border: 'none',
                            background: isPlayingTimeline ? '#ef4444' : '#0284c7',
                            color: '#fff',
                            cursor: 'pointer'
                          }}
                        >
                          {isPlayingTimeline ? '⏸ Pause' : '▶ Play 24h'}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={timeProgress}
                      onChange={(e) => setTimeProgress(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Day/Night & Basemap Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                    {Object.entries(BASEMAPS).map(([key, bm]) => (
                      <button
                        key={key}
                        onClick={() => setBasemap(key)}
                        style={{
                          padding: '6px 4px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: basemap === key ? '#0284c7' : '#0f172a',
                          color: '#fff'
                        }}
                      >
                        {bm.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ================= TAB 2: DEMO PRESETS & LIVE FEED ================= */}
            {activeTab === 'LOCATIONS' && (
              <>
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', marginBottom: '8px', textTransform: 'uppercase' }}>
                    🎯 Instant Judge Demo Camera Presets
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {DEMO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setShowFootprints(true);
                          setShowSpreadArrows(true);
                          setSensorFilter('ALL');
                          setFlyTarget({
                            center: preset.center,
                            zoom: preset.zoom,
                            ts: Date.now()
                          });
                          setMobileSheetOpen(false);
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: `1px solid ${preset.border}`,
                          background: preset.bg,
                          color: '#f8fafc',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700 }}>{preset.title}</div>
                        <div style={{ fontSize: '9px', color: '#cbd5e1', marginTop: '2px' }}>
                          {preset.subtitle}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Scrollable Hotspot Feed */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase' }}>
                      🔥 Active Hotspots Feed ({filteredHotspots.length})
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Tap to fly & inspect</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '340px', overflowY: 'auto' }}>
                    {filteredHotspots.slice(0, 40).map((f, i) => {
                      const p = f.properties;
                      const isInd = p.is_industrial === true || String(p.is_industrial).toLowerCase() === 'true';
                      return (
                        <div
                          key={p.cluster_id || i}
                          onClick={() => {
                            selectHotspotAndInspect(p, true);
                            setMobileSheetOpen(false);
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '7px',
                            background: '#0d1526',
                            border: '1px solid rgba(148,163,184,0.15)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                              {p.cluster_id}{' '}
                              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                                ({Number(p.latitude).toFixed(2)}°N, {Number(p.longitude).toFixed(2)}°E)
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                              Footprint: <b>{p.source_resolution_m}m</b> • Wind: <b>{p.wind_speed_mps ?? 'N/A'} m/s</b> • Heading: <b>{p.spread_heading_deg ?? 'N/A'}°</b>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: isInd
                                  ? '#eab308'
                                  : p.is_multi_sensor
                                  ? '#a855f7'
                                  : Number(p.source_resolution_m) === 1000
                                  ? '#ff6b00'
                                  : '#ff2a5f',
                                color: isInd ? '#000' : '#fff'
                              }}
                            >
                              {isInd ? 'FLARE' : p.is_multi_sensor ? 'DUAL' : `${p.source_resolution_m}m`}
                            </span>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#fb923c', marginTop: '3px' }}>
                              {p.frp} MW
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ================= TAB 3: CLUSTER INSPECTOR & AI ACTION PLAN ================= */}
            {activeTab === 'INSPECT' && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                {selectedFire ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                          {selectedFire.cluster_id}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {Number(selectedFire.latitude).toFixed(4)}°N, {Number(selectedFire.longitude).toFixed(4)}°E
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: 800,
                          background:
                            selectedFire.is_industrial === true || String(selectedFire.is_industrial).toLowerCase() === 'true'
                              ? '#eab308'
                              : selectedFire.is_multi_sensor
                              ? '#a855f7'
                              : Number(selectedFire.source_resolution_m) === 1000
                              ? '#ff6b00'
                              : '#ff2a5f',
                          color:
                            selectedFire.is_industrial === true || String(selectedFire.is_industrial).toLowerCase() === 'true'
                              ? '#000'
                              : '#fff'
                        }}
                      >
                        {selectedFire.is_industrial === true || String(selectedFire.is_industrial).toLowerCase() === 'true'
                          ? '🏭 INDUSTRIAL FLARE'
                          : selectedFire.is_multi_sensor
                          ? '🟣 DUAL-VERIFIED'
                          : `${selectedFire.sensor_source} (${selectedFire.source_resolution_m}m)`}
                      </span>
                    </div>

                    {/* Telemetry Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', fontSize: '11px' }}>
                      <div style={{ background: '#0b1120', padding: '8px', borderRadius: '7px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '10px' }}>PIXEL FOOTPRINT</div>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '13px', marginTop: '2px' }}>
                          {selectedFire.source_resolution_m}m × {selectedFire.source_resolution_m}m
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>
                          {Number(selectedFire.source_resolution_m) === 1000
                            ? '1.00 km² MODIS Nadir'
                            : '0.14 km² VIIRS I-Band (7.1× tighter)'}
                        </div>
                      </div>

                      <div style={{ background: '#0b1120', padding: '8px', borderRadius: '7px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '10px' }}>RADIATIVE POWER</div>
                        <div style={{ fontWeight: 800, color: '#fb923c', fontSize: '13px', marginTop: '2px' }}>
                          {selectedFire.frp} MW
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>
                          Brightness: {selectedFire.bright_ti4 || selectedFire.brightness_ti4_k || 325} K
                        </div>
                      </div>

                      <div style={{ background: '#0b1120', padding: '8px', borderRadius: '7px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '10px' }}>WIND TELEMETRY</div>
                        <div style={{ fontWeight: 800, color: '#facc15', fontSize: '13px', marginTop: '2px' }}>
                          {selectedFire.wind_speed_mps ?? 'N/A'} m/s
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>
                          From {selectedFire.wind_dir_deg ?? 'N/A'}° ({compassLabel(selectedFire.wind_dir_deg)})
                        </div>
                      </div>

                      <div style={{ background: '#0b1120', padding: '8px', borderRadius: '7px' }}>
                        <div style={{ color: '#94a3b8', fontSize: '10px' }}>SPREAD HEADING</div>
                        <div style={{ fontWeight: 800, color: '#34d399', fontSize: '13px', marginTop: '2px' }}>
                          🏹 {selectedFire.spread_heading_deg ?? 'N/A'}° ({compassLabel(selectedFire.spread_heading_deg)})
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>
                          Confidence: {selectedFire.confidence_pct || 88}% ({selectedFire.detection_count || 1} pts)
                        </div>
                      </div>
                    </div>

                    {/* Visual 1000m vs 375m Scale Diagram */}
                    <div
                      style={{
                        background: '#0b1120',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.14)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          border: '2px dashed #ff6b00',
                          background: 'rgba(255,107,0,0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          flexShrink: 0
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            border: '2px solid #ff2a5f',
                            background: 'rgba(255,42,95,0.45)'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: '#cbd5e1', lineHeight: 1.4 }}>
                        <strong style={{ color: '#fff' }}>Why VIIRS (375m) is Tighter than MODIS (1km):</strong>
                        <br />
                        Outer orange box = <b>MODIS 1000m×1000m (1.0 km²)</b>. Inner red box = <b>VIIRS 375m×375m (0.14 km²)</b>—pinpointing the exact flame front!
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                      <button
                        onClick={() => {
                          setShowFootprints(true);
                          setShowSpreadArrows(true);
                          setFlyTarget({
                            center: [Number(selectedFire.latitude), Number(selectedFire.longitude)],
                            zoom: 14,
                            ts: Date.now()
                          });
                          setMobileSheetOpen(false);
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '7px',
                          border: '1px solid #38bdf8',
                          background: 'rgba(56,189,248,0.15)',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        🔍 Zoom to {selectedFire.source_resolution_m}m Box
                      </button>

                      <button
                        onClick={() => requestClusterBriefing(selectedFire)}
                        disabled={briefingLoading}
                        style={{
                          padding: '8px',
                          borderRadius: '7px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #ff2a5f, #9333ea)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        {briefingLoading ? '⏳ Analyzing...' : '⚡ AI Action Plan'}
                      </button>
                    </div>

                    {/* AI Tactical Incident Action Plan Result */}
                    {aiBriefing && (
                      <div
                        style={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(168, 85, 247, 0.5)',
                          borderRadius: '8px',
                          padding: '10px',
                          fontSize: '11px',
                          lineHeight: 1.5
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#d8b4fe', marginBottom: '5px' }}>
                          {aiBriefing.classification}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {aiBriefing.action_plan?.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Tap any hotspot on the map to inspect its telemetry and generate an AI responder briefing.
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 4: SPARKGRID AI COPILOT ================= */}
            {activeTab === 'AI' && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '450px',
                  overflow: 'hidden'
                }}
              >
                {/* Quick Prompt Chips */}
                <div
                  style={{
                    padding: '8px',
                    background: '#0b1120',
                    borderBottom: '1px solid rgba(148,163,184,0.14)',
                    display: 'flex',
                    gap: '5px',
                    flexWrap: 'wrap'
                  }}
                >
                  {[
                    '📐 1km vs 375m Footprints',
                    '🇪🇬 Egypt & Suez Analysis',
                    '🌪️ Wind Spread Vectors',
                    '🏭 Industrial Flares',
                    '⚡ Brief Selected Fire'
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendPromptToAi(chip)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        borderRadius: '999px',
                        border: '1px solid rgba(56,189,248,0.35)',
                        background: 'rgba(2,132,199,0.18)',
                        color: '#bae6fd',
                        cursor: 'pointer'
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Chat Messages */}
                <div
                  style={{
                    flex: 1,
                    padding: '10px',
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
                        background: m.role === 'user' ? '#0284c7' : '#0f172a',
                        border: m.role === 'user' ? 'none' : '1px solid rgba(148,163,184,0.18)',
                        color: '#f8fafc',
                        padding: '8px 11px',
                        borderRadius: '10px',
                        maxWidth: '90%',
                        lineHeight: 1.45,
                        whiteSpace: 'pre-line'
                      }}
                    >
                      {m.text}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ color: '#38bdf8', fontSize: '11px' }}>
                      🛰️ Analyzing NASA FIRMS & Open-Meteo telemetry...
                    </div>
                  )}
                </div>

                {/* Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendPromptToAi(chatInput);
                  }}
                  style={{
                    display: 'flex',
                    padding: '8px',
                    background: '#090e1a',
                    borderTop: '1px solid rgba(148,163,184,0.15)',
                    gap: '6px'
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask SparkGrid AI anything..."
                    style={{
                      flex: 1,
                      background: '#111827',
                      border: '1px solid #334155',
                      borderRadius: '7px',
                      padding: '7px 10px',
                      color: '#fff',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: '7px 13px',
                      background: 'linear-gradient(135deg, #ff2a5f, #ff6b00)',
                      border: 'none',
                      borderRadius: '7px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* Bottom Sync Button */}
            <button
              onClick={triggerPipeline}
              disabled={refreshing}
              style={{
                padding: '9px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(90deg, #ff2a5f, #ff6b00)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                marginTop: 'auto'
              }}
            >
              {refreshing ? '⏳ Re-Running Harmonization...' : '🔄 Sync Live NASA FIRMS + Open-Meteo'}
            </button>
          </div>
        </aside>

        {/* INTERACTIVE LEAFLET MAP AREA */}
        <main className="sg-map-area">
          {/* Mobile Horizontal Quick-Action Pills (Visible on Smartphones right over the map!) */}
          <div className="sg-mobile-pills">
            <button
              onClick={() => {
                setShowFootprints(true);
                setShowSpreadArrows(true);
                setFlyTarget({ center: [29.0172, 31.2038], zoom: 14, ts: Date.now() });
              }}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #a855f7',
                background: 'rgba(46, 16, 101, 0.9)',
                color: '#f3e8ff',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              🇪🇬 Egypt 1km/375m
            </button>

            <button
              onClick={() => setShowSpreadArrows((v) => !v)}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: showSpreadArrows ? '1px solid #38bdf8' : '1px solid #334155',
                background: showSpreadArrows ? 'rgba(2, 132, 199, 0.88)' : 'rgba(15, 23, 42, 0.88)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              🏹 Arrows {showSpreadArrows ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowFootprints((v) => !v)}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: showFootprints ? '1px solid #a855f7' : '1px solid #334155',
                background: showFootprints ? 'rgba(147, 51, 234, 0.88)' : 'rgba(15, 23, 42, 0.88)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              📐 1km/375m {showFootprints ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowWindHeat((v) => !v)}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: showWindHeat ? '1px solid #f97316' : '1px solid #334155',
                background: showWindHeat ? 'rgba(234, 88, 12, 0.9)' : 'rgba(15, 23, 42, 0.88)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              🌪️ Wind Heat
            </button>

            <button
              onClick={() => {
                const next = !industrialGrayOutCheckbox;
                setIndustrialGrayOutCheckbox(next);
                setIndustrialMode(next ? 'GRAY_OUT' : 'HIGHLIGHT');
              }}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #eab308',
                background: industrialGrayOutCheckbox
                  ? 'rgba(71, 85, 105, 0.9)'
                  : 'rgba(161, 98, 7, 0.9)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              🏭 {industrialGrayOutCheckbox ? 'Flares Muted' : 'Flares Yellow'}
            </button>

            <button
              onClick={() =>
                setBasemap((b) => (b === 'dark' ? 'satellite' : b === 'satellite' ? 'terrain' : 'dark'))
              }
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #475569',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              {BASEMAPS[basemap].short}
            </button>
          </div>

          <MapContainer
            center={[27.8, 30.8]}
            zoom={5}
            style={{ height: '100%', width: '100%', background: '#070b14' }}
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
              const isInd = p.is_industrial === true || String(p.is_industrial).toLowerCase() === 'true';
              const style = getMarkerAppearance(p);
              const hasSpread =
                p.spread_heading_deg !== null &&
                p.spread_heading_deg !== undefined &&
                !(isInd && (industrialGrayOutCheckbox || industrialMode === 'GRAY_OUT'));

              let spreadLineEnd = null;
              if (hasSpread && showSpreadArrows) {
                const rad = (Number(p.spread_heading_deg) * Math.PI) / 180.0;
                const distDeg = Math.max(Number(p.wind_speed_mps || 3) * 0.011, 0.022);
                spreadLineEnd = [lat + Math.cos(rad) * distDeg, lon + Math.sin(rad) * distDeg];
              }

              return (
                <React.Fragment key={p.cluster_id || idx}>
                  {/* 1. 1km vs 375m FOOTPRINT POLYGONS */}
                  {showFootprints && (
                    <>
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
                          eventHandlers={{ click: () => selectHotspotAndInspect(p, false) }}
                        />
                      )}
                      <Rectangle
                        bounds={getFootprintBounds(lat, lon, resM)}
                        pathOptions={{
                          color: isInd
                            ? style.stroke
                            : p.is_multi_sensor
                            ? '#a855f7'
                            : resM === 1000
                            ? '#ff6b00'
                            : '#ff2a5f',
                          weight: resM === 1000 ? 1.8 : 2.0,
                          fillColor: isInd
                            ? style.fill
                            : p.is_multi_sensor
                            ? '#a855f7'
                            : resM === 1000
                            ? '#ff6b00'
                            : '#ff2a5f',
                          fillOpacity:
                            isInd && (industrialGrayOutCheckbox || industrialMode === 'GRAY_OUT')
                              ? 0.08
                              : resM === 1000
                              ? 0.18
                              : 0.28
                        }}
                        eventHandlers={{ click: () => selectHotspotAndInspect(p, false) }}
                      />
                    </>
                  )}

                  {/* 2. WIND SPEED HEAT LAYER HALO */}
                  {showWindHeat && !isInd && style.glowRadius && (
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

                  {/* 3. CORE HOTSPOT CIRCLE MARKER */}
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
                      click: () => selectHotspotAndInspect(p, false)
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: '210px', fontSize: '12px', lineHeight: 1.45 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '13px', color: '#38bdf8' }}>{p.cluster_id}</strong>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#cbd5e1' }}>
                            {resM}m × {resM}m
                          </span>
                        </div>
                        <hr style={{ margin: '5px 0', borderColor: 'rgba(148,163,184,0.2)' }} />
                        <div>
                          <b>Sensor:</b> {p.sensor_source} {p.is_multi_sensor ? '✅ Dual-Verified' : ''}
                        </div>
                        <div>
                          <b>Radiative Power:</b> <span style={{ color: '#fb923c', fontWeight: 700 }}>{p.frp} MW</span>
                        </div>
                        <div>
                          <b>Type:</b> {isInd ? '🏭 Industrial Gas Flare' : '🔥 Vegetation / Wildfire'}
                        </div>
                        {p.wind_speed_mps != null && (
                          <div>
                            <b>Wind & Spread:</b> {p.wind_speed_mps} m/s ➔ 🏹 {p.spread_heading_deg}° ({compassLabel(p.spread_heading_deg)})
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
                          <button
                            onClick={() =>
                              setFlyTarget({ center: [lat, lon], zoom: 14, ts: Date.now() })
                            }
                            style={{
                              flex: 1,
                              padding: '5px',
                              borderRadius: '5px',
                              border: '1px solid #38bdf8',
                              background: 'rgba(2,132,199,0.25)',
                              color: '#fff',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 Zoom {resM}m
                          </button>
                          <button
                            onClick={() => {
                              selectHotspotAndInspect(p, false);
                              setMobileSheetOpen(true);
                              requestClusterBriefing(p);
                            }}
                            style={{
                              flex: 1,
                              padding: '5px',
                              borderRadius: '5px',
                              border: 'none',
                              background: '#9333ea',
                              color: '#fff',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ⚡ AI Plan
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>

                  {/* 4. FIRE-SPREAD DIRECTION ARROWS */}
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

          {/* Collapsible Floating Legend Card */}
          {showLegend ? (
            <div
              className="sg-floating-legend"
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: 'rgba(11, 17, 32, 0.92)',
                backdropFilter: 'blur(10px)',
                padding: '11px 14px',
                borderRadius: '11px',
                border: '1px solid rgba(148,163,184,0.22)',
                zIndex: 999,
                fontSize: '11px',
                maxWidth: '265px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.55)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, color: '#f8fafc' }}>🛰️ Map Legend</span>
                <button
                  onClick={() => setShowLegend(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Hide ✕
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
                <span><b>MODIS+VIIRS</b> Dual-Verified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{ width: '10px', height: '10px', border: '2px solid #ff6b00', background: 'rgba(255,107,0,0.25)', display: 'inline-block' }} />
                <span><b>MODIS</b> 1000m × 1000m (1.0 km²)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{ width: '10px', height: '10px', border: '2px solid #ff2a5f', background: 'rgba(255,42,95,0.35)', display: 'inline-block' }} />
                <span><b>VIIRS</b> 375m × 375m (0.14 km²)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: industrialGrayOutCheckbox ? '#64748b' : '#eab308', display: 'inline-block' }} />
                <span><b>Industrial Flare</b> ({industrialGrayOutCheckbox ? 'Muted' : 'Yellow'})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>➤</span>
                <span><b>Spread Arrow</b> (<code>spread_heading_deg</code>)</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLegend(true)}
              style={{
                position: 'absolute',
                bottom: '70px',
                right: '12px',
                zIndex: 999,
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(148,163,184,0.3)',
                background: 'rgba(11, 17, 32, 0.9)',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🛰️ Legend
            </button>
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION DOCK (Smartphone Native Feel) */}
      <nav className="sg-mobile-dock">
        {[
          { id: 'MAP', icon: '🗺️', label: 'Map' },
          { id: 'LAYERS', icon: '🎛️', label: 'Layers' },
          { id: 'LOCATIONS', icon: '🎯', label: 'Demo' },
          { id: 'INSPECT', icon: '🔍', label: 'Inspect' },
          { id: 'AI', icon: '🤖', label: 'AI Chat' }
        ].map((item) => {
          const isActive =
            item.id === 'MAP'
              ? !mobileSheetOpen
              : mobileSheetOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'MAP') {
                  setMobileSheetOpen(false);
                } else {
                  setActiveTab(item.id);
                  setMobileSheetOpen(true);
                }
              }}
              style={{
                background: isActive ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                borderRadius: '10px',
                color: isActive ? '#38bdf8' : '#94a3b8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '15px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* INTERACTIVE MISSION GUIDE & SCIENTIFIC EXPLAINER MODAL */}
      {showGuideModal && (
        <div
          onClick={() => setShowGuideModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 7, 15, 0.82)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0d1526',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '16px',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '86dvh',
              overflowY: 'auto',
              padding: '20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  🛰️ SparkGrid Mission Guide & Judge Walkthrough
                </h2>
                <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                  NASA Space Apps Challenge Cairo 2026 • Harmonization of MODIS & VIIRS Hot Spots
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                style={{
                  background: '#1e293b',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#131d33', padding: '12px', borderRadius: '10px', borderLeft: '4px solid #a855f7' }}>
                <strong style={{ color: '#fff' }}>1. The Problem We Solve (2.45× Deduplication):</strong>
                <br />
                NASA’s <b>MODIS</b> satellites (Terra/Aqua) scan at <b>1000m × 1000m (1.0 km²)</b> resolution, while <b>VIIRS</b> satellites (Suomi-NPP/NOAA-20/21) scan at <b>375m × 375m (0.14 km²)</b>. Plotting raw data creates massive duplicate clusters. SparkGrid uses <b>Spatiotemporal Haversine DBSCAN</b> (1.5 km radius, 120-min orbital window) + <b>FRP-weighted centroids</b> to fuse <b>27,672 raw detections into 11,505 clusters</b>, isolating <b>672 Dual-Sensor Verified fires</b>.
              </div>

              <div style={{ background: '#131d33', padding: '12px', borderRadius: '10px', borderLeft: '4px solid #38bdf8' }}>
                <strong style={{ color: '#fff' }}>2. How to Explore the 4 Tactical Layers:</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                  <li><b>📐 1km vs 375m Footprint Polygons:</b> Zoom to level 13–14 to see true-scale orange 1000m MODIS squares vs tight red 375m VIIRS squares.</li>
                  <li><b>🏹 Fire-Spread Direction Arrows:</b> Rotated azimuth arrows showing where Open-Meteo 10m winds are pushing the flame front (<code>spread_heading_deg</code>).</li>
                  <li><b>🌪️ Wind Speed Heat Layer:</b> Scales hotspot radius and color intensity by wind speed (<code>wind_speed_mps</code>) to highlight rapid-spread hazards.</li>
                  <li><b>🏭 Industrial Flare Masking:</b> Highlights or grays out 175 persistent oil & gas flares in the Gulf of Suez, Sinai, and Persian Gulf.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowGuideModal(false);
                  setShowFootprints(true);
                  setShowSpreadArrows(true);
                  setFlyTarget({ center: [29.0172, 31.2038], zoom: 14, ts: Date.now() });
                }}
                style={{
                  padding: '10px',
                  borderRadius: '9px',
                  border: '1px solid #a855f7',
                  background: 'rgba(147,51,234,0.25)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🇪🇬 Tour 1: Egypt 1km vs 375m (Zoom 14)
              </button>

              <button
                onClick={() => {
                  setShowGuideModal(false);
                  setShowFootprints(true);
                  setShowSpreadArrows(true);
                  setFlyTarget({ center: [12.315, 20.492], zoom: 13, ts: Date.now() });
                }}
                style={{
                  padding: '10px',
                  borderRadius: '9px',
                  border: '1px solid #f97316',
                  background: 'rgba(249,115,22,0.25)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔥 Tour 2: 2,006 MW Dual-Sensor Megafire
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
