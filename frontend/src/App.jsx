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
    basemap: 'satellite',
    prompt: 'Take me to Egypt 1km vs 375m footprints',
    border: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.16)'
  },
  {
    id: 'egypt_suez',
    title: '🏭 Gulf of Suez Flares',
    subtitle: 'Ain Sokhna Industrial + 1km/375m',
    center: [29.6915, 32.3225],
    zoom: 14,
    basemap: 'satellite',
    prompt: 'Show me Gulf of Suez industrial flares',
    border: '#eab308',
    bg: 'rgba(234, 179, 8, 0.15)'
  },
  {
    id: 'dual_megafire',
    title: '🔥 Dual-Verified Megafire',
    subtitle: '2,006 MW Nested 375m inside 1km',
    center: [12.315, 20.492],
    zoom: 13,
    basemap: 'dark',
    prompt: 'Fly to the biggest Dual-Sensor Megafire',
    border: '#f97316',
    bg: 'rgba(249, 115, 22, 0.16)'
  },
  {
    id: 'wind_corridor',
    title: '🌪️ Wind Speed Heat Corridor',
    subtitle: 'Open-Meteo Thermal Spread Risk',
    center: [12.315, 20.492],
    zoom: 7,
    basemap: 'dark',
    prompt: 'Activate Wind Speed Heat Layer and arrows',
    border: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.14)'
  },
  {
    id: 'basra_flares',
    title: '🛢️ Basra Oil Field Flares',
    subtitle: 'Persian Gulf Industrial Masking',
    center: [30.7, 47.55],
    zoom: 10,
    basemap: 'satellite',
    prompt: 'Take me to Basra oil flares',
    border: '#10b981',
    bg: 'rgba(16, 185, 129, 0.14)'
  },
  {
    id: 'global_reset',
    title: '🌍 Global Planetary View',
    subtitle: 'All 11,505 Harmonized Clusters',
    center: [22.0, 25.0],
    zoom: 3,
    basemap: 'dark',
    prompt: 'Pull back to Global Planetary Overview',
    border: '#64748b',
    bg: 'rgba(100, 116, 139, 0.16)'
  }
];

const NASA_SLIDES = [
  {
    num: 1,
    tag: 'SLIDE 1 / 7 • MISSION HOOK',
    title: 'SPARKGRID: Harmonizing the Planet’s Fire Sentinels',
    subtitle: 'NASA Space Apps Challenge Cairo 2026 • Challenge: Harmonization of MODIS & VIIRS Hot Spots',
    bullets: [
      '🔥 The Emergency Crisis: Wildfire command centers are overwhelmed by conflicting, duplicate satellite alerts during peak fire seasons.',
      '🛰️ Our Solution: SparkGrid is a real-time Spatiotemporal Harmonization Engine + God’s Eye AI Tactical Map HUD live at https://sparkgrid.masarat.app.',
      '📊 Proven Impact: Compressed 27,672 raw NASA satellite detections into 11,505 unified clusters (2.45× deduplication) while isolating 672 Dual-Sensor Verified fires.'
    ],
    metricLabel: '2.45×',
    metricSub: 'Telemetry Redundancy Reduction (27,672 ➔ 11,505 Clusters)',
    tourPrompt: 'Pull back to Global Planetary Overview'
  },
  {
    num: 2,
    tag: 'SLIDE 2 / 7 • THE SCIENTIFIC DILEMMA',
    title: 'Why Raw MODIS (1km) & VIIRS (375m) Data Clash',
    subtitle: 'Resolving Spatial Granularity, Orbital Timing & Radiometric Discrepancies',
    bullets: [
      '🟠 MODIS (Terra & Aqua): 1000m × 1000m nadir pixel (1.00 km² area), continuous 0–100% confidence, 10:30 AM / 1:30 PM passes.',
      '🔴 VIIRS (Suomi-NPP, NOAA-20/21): 375m × 375m I-Band pixel (0.14 km² area — 7.1× tighter!), categorical low/nominal/high confidence.',
      '⚠️ Without Harmonization: A single 1 km² blaze triggers 1 MODIS box + up to 7 overlapping VIIRS pixels, inflating burned area estimates and misdirecting aerial water drops.'
    ],
    metricLabel: '7.1×',
    metricSub: 'Tighter Spatial Area Resolution with VIIRS (0.14 km² vs 1.00 km²)',
    tourPrompt: 'Take me to Egypt 1km vs 375m footprints'
  },
  {
    num: 3,
    tag: 'SLIDE 3 / 7 • ALGORITHMIC ARCHITECTURE',
    title: 'The 8-Stage Spatiotemporal Harmonization Pipeline',
    subtitle: 'Great-Circle Haversine DBSCAN + FRP-Weighted Centroids + Bayesian Fusion',
    bullets: [
      '1️⃣ Unified Confidence Mapping: Normalizes MODIS [0–100] and VIIRS [low=0.30, nom=0.70, high=0.95] into a common probability space.',
      '2️⃣ Spherical Haversine DBSCAN: Clusters detections within ε = 1.5 km on the Earth’s sphere across a |Δt| ≤ 120-minute orbital window.',
      '3️⃣ FRP-Weighted Centroids & Bayesian Fusion: Anchors cluster centers to maximum radiative power and computes C_fused = 1 − ∏(1 − c_i).'
    ],
    metricLabel: '672',
    metricSub: 'Dual-Sensor Cross-Validated Wildfires (MODIS + VIIRS Simultaneous)',
    tourPrompt: 'Fly to the biggest Dual-Sensor Megafire'
  },
  {
    num: 4,
    tag: 'SLIDE 4 / 7 • METEOROLOGICAL & FLARE INTELLIGENCE',
    title: 'Open-Meteo Wind Vectors & Industrial Flare Masking',
    subtitle: 'Transforming Static Thermal Dots into Dynamic Fire-Spread Predictions',
    bullets: [
      '🏹 Fire-Spread Azimuth Arrows (spread_heading_deg): Queries Open-Meteo 10m wind vectors in 50-coordinate batches to compute θ_spread = (θ_wind + 180°) mod 360°.',
      '🌪️ Wind Speed Heat Layer (wind_speed_mps): Dynamically scales marker radius and 4-tier thermal color risk (<2.5 m/s Cyan to >8 m/s Crimson).',
      '🏭 Industrial Flare Filter (is_industrial): Masks 175 persistent oil/gas flares in the Gulf of Suez, Sinai, Basra, and Niger Delta to prevent false dispatches.'
    ],
    metricLabel: '10,106',
    metricSub: 'Active Clusters Enriched with Real-Time Wind & Spread Vectors',
    tourPrompt: 'Show me Gulf of Suez industrial flares'
  },
  {
    num: 5,
    tag: 'SLIDE 5 / 7 • GOD’S EYE AI & TACTICAL HUD',
    title: 'God’s Eye Voice AI Commander & Smartphone-Ready HUD',
    subtitle: 'Talk to the Map: Voice-Guided Camera Flights + Instant Responder Action Plans',
    bullets: [
      '👁️ God’s Eye Voice & Camera AI: Speak or type "Take me to Egypt" or "Show me the biggest megafire"—the AI flies the camera, toggles polygons, and narrates the science out loud.',
      '⚡ Automated Incident Action Plans: 1-click AI briefing calculates evacuation bearings, spread velocity in km/h, and containment buffer zones.',
      '📱 Cross-Platform Responsive Design: Works seamlessly on Emergency Command Walls (Desktop) and Field Responder Smartphones (Mobile Bottom Sheet).'
    ],
    metricLabel: '100%',
    metricSub: 'Live Interactive Web & Smartphone Compatibility',
    tourPrompt: 'Activate Wind Speed Heat Layer and arrows'
  },
  {
    num: 6,
    tag: 'SLIDE 6 / 7 • EMPIRICAL BENCHMARKS & EGYPT CASE STUDY',
    title: 'Global Planetary Run + Egypt & Red Sea Regional Validation',
    subtitle: 'Verified Telemetry Across 11,505 Global Clusters & 45 Featured Egypt Hotspots',
    bullets: [
      '🇪🇬 Egypt Case Study (Beni Suef & Gulf of Suez): Demonstrates side-by-side 1000m MODIS (`SG-EG-0003`) and 375m VIIRS (`SG-EG-0010`) agricultural fires plus Ain Sokhna offshore flares.',
      '⚡ Total Radiative Energy Tracked: 296,892.71 MW globally (Mean: 25.81 MW, Peak megafire cluster: 3,635.08 MW).',
      '📥 Open GIS Interoperability: 1-click export of filtered GeoJSON and CSV datasets for civil defense and environmental researchers.'
    ],
    metricLabel: '296.9 GW',
    metricSub: 'Cumulative Fire Radiative Power Harmonized Globally',
    tourPrompt: 'Take me to Egypt 1km vs 375m footprints'
  },
  {
    num: 7,
    tag: 'SLIDE 7 / 7 • OPEN SOURCE & FUTURE ROADMAP',
    title: 'Production Cloud Architecture & Next-Generation Roadmap',
    subtitle: 'Built for NASA Space Apps Cairo 2026 • Open Source & Live Today',
    bullets: [
      '☁️ Cloud Infrastructure: Hosted on Azure Ubuntu VMs behind Cloudflare Zero Trust SSL Tunnels with 2-minute automated GitHub CI/CD (`deploy.sh`).',
      '🚀 Phase 2 Roadmap: Direct integration with NASA Earthdata WebSockets, burnt-area perimeter polygon forecasting (Rothermel spread model), and SMS civil defense alerts.',
      '🔗 Live Links: App: https://sparkgrid.masarat.app • API Docs: https://sparkgrid-api.masarat.app/docs • GitHub: https://github.com/freefirenoobs/sparkgrid'
    ],
    metricLabel: 'LIVE',
    metricSub: 'https://sparkgrid.masarat.app • Ready for Global Deployment',
    tourPrompt: 'Pull back to Global Planetary Overview'
  }
];

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
  const [showSlidesModal, setShowSlidesModal] = useState(false);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [showLegend, setShowLegend] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sensorFilter, setSensorFilter] = useState('ALL');
  const [dayNightFilter, setDayNightFilter] = useState('ALL');
  const [minFrp, setMinFrp] = useState(0);
  const [timeProgress, setTimeProgress] = useState(100);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);

  const [basemap, setBasemap] = useState('dark');
  const [apiMode, setApiMode] = useState('WIND_500');
  const [selectedFire, setSelectedFire] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // Role 3 Tactical Map Toggles
  const [showSpreadArrows, setShowSpreadArrows] = useState(true);
  const [showFootprints, setShowFootprints] = useState(true);
  const [showWindHeat, setShowWindHeat] = useState(false);
  const [industrialMode, setIndustrialMode] = useState('HIGHLIGHT');
  const [industrialGrayOutCheckbox, setIndustrialGrayOutCheckbox] = useState(false);

  // GOD'S EYE AI VOICE & CAMERA TOUR STATE
  const [godsEyeBanner, setGodsEyeBanner] = useState({
    visible: true,
    locationTitle: '👁️ God’s Eye AI Commander Ready',
    narration:
      'Tap the 🎙️ Mic or click any destination below—I will fly the satellite camera there, toggle the scientific layers, and explain what you are seeing out loud!'
  });
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoTourRunning, setAutoTourRunning] = useState(false);
  const tourTimeoutRef = useRef(null);

  // Role 5 AI Incident Briefing & Chat
  const [aiBriefing, setAiBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: '👁️ Welcome to SparkGrid God’s Eye AI! Ask me to take you anywhere (e.g., "Take me to Egypt 1km vs 375m", "Show me Suez flares", "Fly to the biggest megafire")—I will fly the camera and narrate live!'
    }
  ]);

  // Speak text aloud via Web Speech Synthesis API
  const speakNarration = (text) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.03;
      utter.pitch = 1.0;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error('Speech synthesis error:', e);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    if (tourTimeoutRef.current) {
      clearTimeout(tourTimeoutRef.current);
      tourTimeoutRef.current = null;
    }
    setAutoTourRunning(false);
  };

  // Apply Camera & Layer Action returned by God's Eye AI
  const executeGodsEyeAction = (action, speechText, replyText) => {
    if (action) {
      if (action.basemap) setBasemap(action.basemap);
      if (typeof action.showFootprints === 'boolean') setShowFootprints(action.showFootprints);
      if (typeof action.showSpreadArrows === 'boolean') setShowSpreadArrows(action.showSpreadArrows);
      if (typeof action.showWindHeat === 'boolean') setShowWindHeat(action.showWindHeat);
      if (action.industrialMode) {
        setIndustrialMode(action.industrialMode);
        setIndustrialGrayOutCheckbox(action.industrialMode === 'GRAY_OUT');
      }
      if (action.cluster_id && hotspots.length > 0) {
        const found = hotspots.find((f) => f.properties?.cluster_id === action.cluster_id);
        if (found) setSelectedFire(found.properties);
      }
      if (action.center) {
        setFlyTarget({
          center: action.center,
          zoom: action.zoom || 13,
          ts: Date.now()
        });
      }
    }
    if (speechText || replyText) {
      setGodsEyeBanner({
        visible: true,
        locationTitle: action?.location_title || '👁️ God’s Eye AI Analysis',
        narration: speechText || replyText
      });
      if (speechText) speakNarration(speechText);
    }
  };

  // Voice Recognition (Mic Input)
  const startMicRecognition = () => {
    const SpeechRec =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRec) {
      alert('Voice recognition works best in Chrome or Edge. You can also type or tap any God’s Eye button!');
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setIsListeningMic(true);
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setIsListeningMic(false);
        if (transcript) {
          sendPromptToAi(transcript);
        }
      };
      rec.onerror = () => setIsListeningMic(false);
      rec.onend = () => setIsListeningMic(false);
      rec.start();
    } catch (e) {
      setIsListeningMic(false);
    }
  };

  // Automated 4-Stop God's Eye Guided Tour
  const startAutoGuidedTour = () => {
    if (autoTourRunning) {
      stopSpeaking();
      return;
    }
    setAutoTourRunning(true);
    const stops = [
      'Pull back to Global Planetary Overview',
      'Take me to Egypt 1km vs 375m footprints',
      'Show me Gulf of Suez industrial flares',
      'Fly to the biggest Dual-Sensor Megafire'
    ];
    let step = 0;
    const runNext = () => {
      if (step >= stops.length) {
        setAutoTourRunning(false);
        return;
      }
      sendPromptToAi(stops[step]);
      step++;
      tourTimeoutRef.current = setTimeout(runNext, 11000);
    };
    runNext();
  };

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
        if (data.action_plan?.[0]) {
          speakNarration(`${data.classification}. ${data.action_plan[0]}`);
        }
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
      if (data.camera_action || data.speech) {
        executeGodsEyeAction(data.camera_action, data.speech, data.reply);
      }
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
    const q = searchQuery.trim();
    if (!q) return;
    sendPromptToAi(q);
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

  const activeSlide = NASA_SLIDES[currentSlideIdx];

  return (
    <div className="sg-app">
      {/* TOP COMMAND HEADER */}
      <header className="sg-header">
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
            onClick={() => sendPromptToAi('Pull back to Global Planetary Overview')}
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
                  GOD’S EYE AI
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

        {/* Center Voice & Text God's Eye Command Bar (Desktop) */}
        <form
          onSubmit={handleSearchSubmit}
          className="sg-hide-mobile"
          style={{ flex: 1, maxWidth: '410px', display: 'flex', gap: '6px', alignItems: 'center' }}
        >
          <button
            type="button"
            onClick={startMicRecognition}
            title="Speak to God's Eye AI (Voice Navigation)"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: isListeningMic ? '1px solid #ef4444' : '1px solid rgba(56,189,248,0.4)',
              background: isListeningMic ? '#dc2626' : 'rgba(2,132,199,0.25)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {isListeningMic ? '🎙️ Listening...' : '🎙️ Talk'}
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="👁️ Ask God's Eye AI: 'Take me to Egypt', 'Suez flares', 'Megafire'..."
            style={{
              width: '100%',
              background: '#0d1526',
              border: '1px solid rgba(148,163,184,0.25)',
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
            onClick={startAutoGuidedTour}
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 800,
              borderRadius: '7px',
              border: '1px solid rgba(56,189,248,0.55)',
              background: autoTourRunning
                ? '#dc2626'
                : 'linear-gradient(135deg, #0284c7, #7c3aed)',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(56,189,248,0.35)'
            }}
          >
            {autoTourRunning ? '⏹ Stop Tour' : '👁️ AI Tour'}
          </button>

          <button
            onClick={() => setShowSlidesModal(true)}
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 800,
              borderRadius: '7px',
              border: '1px solid rgba(251,146,60,0.55)',
              background: 'linear-gradient(135deg, rgba(255,42,95,0.4), rgba(255,107,0,0.4))',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            📊 7-Slide Deck
          </button>

          <button
            onClick={() => setApiMode((m) => (m === 'WIND_500' ? 'ALL_3000' : 'WIND_500'))}
            className="sg-hide-mobile"
            style={{
              padding: '6px 9px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '7px',
              border: '1px solid rgba(148,163,184,0.25)',
              background: '#141d31',
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
              padding: '6px 8px',
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
            onClick={() => setShowGuideModal(true)}
            className="sg-hide-mobile"
            style={{
              padding: '6px 9px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '7px',
              border: '1px solid rgba(168,85,247,0.4)',
              background: 'rgba(147,51,234,0.25)',
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
        {/* MISSION CONTROL SIDEBAR */}
        <aside
          className={`sg-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${
            mobileSheetOpen ? '' : 'mobile-hidden'
          }`}
        >
          <div className="sg-mobile-sheet-header">
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8' }}>
              {activeTab === 'LAYERS' && '🎛️ Tactical Layers & Filters'}
              {activeTab === 'LOCATIONS' && '🎯 God’s Eye Locations & Feed'}
              {activeTab === 'INSPECT' && '🔍 Cluster Telemetry & AI Briefing'}
              {activeTab === 'AI' && '👁️ God’s Eye Voice & Chat AI'}
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
              { id: 'AI', label: '👁️ God’s Eye' }
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

                {/* SENSOR, FRP & 24H TIMELINE CONTROLS */}
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
                    👁️ God’s Eye Voice-Narrated Destinations
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {DEMO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          sendPromptToAi(preset.prompt);
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
                        {briefingLoading ? '⏳ Analyzing...' : '⚡ AI Voice Action Plan'}
                      </button>
                    </div>

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

            {/* ================= TAB 4: GOD'S EYE VOICE & CHAT AI ================= */}
            {activeTab === 'AI' && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '460px',
                  overflow: 'hidden'
                }}
              >
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
                    '🇪🇬 Take me to Egypt 1km vs 375m',
                    '🏭 Show me Gulf of Suez flares',
                    '🔥 Fly to 2,006 MW Megafire',
                    '🌪️ Activate Wind Speed Heat Layer',
                    '🌍 Global Planetary Overview'
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
                      👁️ God’s Eye AI flying camera & analyzing telemetry...
                    </div>
                  )}
                </div>

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
                  <button
                    type="button"
                    onClick={startMicRecognition}
                    style={{
                      padding: '7px 10px',
                      background: isListeningMic ? '#dc2626' : '#1e293b',
                      border: '1px solid #38bdf8',
                      borderRadius: '7px',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    🎙️
                  </button>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Say 'Take me to Egypt' or ask anything..."
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
                      padding: '7px 12px',
                      background: 'linear-gradient(135deg, #ff2a5f, #ff6b00)',
                      border: 'none',
                      borderRadius: '7px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Fly
                  </button>
                </form>
              </div>
            )}

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
          {/* Mobile Horizontal Quick-Action Pills */}
          <div className="sg-mobile-pills">
            <button
              onClick={startMicRecognition}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #38bdf8',
                background: isListeningMic ? '#dc2626' : 'rgba(2, 132, 199, 0.92)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 800
              }}
            >
              {isListeningMic ? '🎙️ Listening...' : '🎙️ Voice AI'}
            </button>

            <button
              onClick={() => sendPromptToAi('Take me to Egypt 1km vs 375m footprints')}
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
              onClick={() => sendPromptToAi('Show me Gulf of Suez industrial flares')}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #eab308',
                background: 'rgba(113, 63, 18, 0.9)',
                color: '#fef08a',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              🏭 Suez Flares
            </button>

            <button
              onClick={() => sendPromptToAi('Fly to the biggest Dual-Sensor Megafire')}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '999px',
                border: '1px solid #f97316',
                background: 'rgba(124, 45, 18, 0.9)',
                color: '#ffedd5',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              🔥 2006 MW Fire
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
                            ⚡ AI Voice Plan
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>

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

          {/* 👁️ FLOATING GOD'S EYE AI VOICE NARRATOR & CAMERA COMMANDER DOCK */}
          {godsEyeBanner.visible && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                right: '290px',
                minWidth: '290px',
                maxWidth: '680px',
                background: 'rgba(9, 14, 26, 0.94)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                borderRadius: '14px',
                padding: '11px 14px',
                zIndex: 1000,
                boxShadow: '0 12px 35px rgba(0,0,0,0.75)'
              }}
              className="sg-hide-mobile"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: isSpeaking ? '#ef4444' : '#0284c7',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 800
                    }}
                  >
                    {isSpeaking ? '🔊 SPEAKING LIVE' : '👁️ GOD’S EYE AI'}
                  </span>
                  <strong style={{ fontSize: '12px', color: '#38bdf8' }}>
                    {godsEyeBanner.locationTitle}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => {
                      const next = !voiceEnabled;
                      setVoiceEnabled(next);
                      if (!next) stopSpeaking();
                    }}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: '1px solid rgba(148,163,184,0.25)',
                      background: voiceEnabled ? 'rgba(16,185,129,0.2)' : '#1e293b',
                      color: voiceEnabled ? '#34d399' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    {voiceEnabled ? '🔊 Voice ON' : '🔇 Muted'}
                  </button>
                  {isSpeaking && (
                    <button
                      onClick={stopSpeaking}
                      style={{
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        background: '#dc2626',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      ⏹ Stop
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '11.5px', color: '#e2e8f0', lineHeight: 1.45, marginBottom: '8px' }}>
                {godsEyeBanner.narration}
              </div>

              {/* 1-Click God's Eye Flight Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={startMicRecognition}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: '1px solid #38bdf8',
                    background: isListeningMic ? '#dc2626' : '#0284c7',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isListeningMic ? '🎙️ Listening...' : '🎙️ Speak Destination'}
                </button>
                {[
                  { label: '🇪🇬 Fly: Egypt 1km vs 375m', prompt: 'Take me to Egypt 1km vs 375m footprints' },
                  { label: '🏭 Fly: Suez Oil Flares', prompt: 'Show me Gulf of Suez industrial flares' },
                  { label: '🔥 Fly: 2,006 MW Megafire', prompt: 'Fly to the biggest Dual-Sensor Megafire' },
                  { label: '🌪️ Fly: Wind Heat Corridor', prompt: 'Activate Wind Speed Heat Layer and arrows' },
                  { label: '🌍 Fly: Planetary View', prompt: 'Pull back to Global Planetary Overview' }
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={() => sendPromptToAi(b.prompt)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '999px',
                      border: '1px solid rgba(148,163,184,0.28)',
                      background: 'rgba(30, 41, 59, 0.85)',
                      color: '#f8fafc',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav className="sg-mobile-dock">
        {[
          { id: 'MAP', icon: '🗺️', label: 'Map' },
          { id: 'LAYERS', icon: '🎛️', label: 'Layers' },
          { id: 'LOCATIONS', icon: '🎯', label: 'Demo' },
          { id: 'INSPECT', icon: '🔍', label: 'Inspect' },
          { id: 'AI', icon: '👁️', label: 'God’s Eye' }
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

      {/* 📊 OFFICIAL 7-SLIDE NASA SUBMISSION DECK MODAL */}
      {showSlidesModal && (
        <div
          onClick={() => setShowSlidesModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 7, 15, 0.88)',
            backdropFilter: 'blur(10px)',
            zIndex: 2100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, #0b1325 0%, #070b14 100%)',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              borderRadius: '18px',
              maxWidth: '840px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#38bdf8',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: 'rgba(2,132,199,0.2)',
                  border: '1px solid rgba(56,189,248,0.35)'
                }}
              >
                {activeSlide.tag}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href="/slides.html"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '6px 11px',
                    borderRadius: '8px',
                    background: '#0284c7',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  🖨️ Open Printable / PDF Deck
                </a>
                <button
                  onClick={() => setShowSlidesModal(false)}
                  style={{
                    background: '#1e293b',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '6px 11px',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#fff' }}>
                {activeSlide.title}
              </h2>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                {activeSlide.subtitle}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'stretch' }}>
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(148,163,184,0.18)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: '#e2e8f0'
                }}
              >
                {activeSlide.bullets.map((b, i) => (
                  <div key={i}>{b}</div>
                ))}
              </div>

              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(255,42,95,0.18), rgba(147,51,234,0.22))',
                  border: '1px solid rgba(168,85,247,0.4)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '36px', fontWeight: 900, color: '#fff' }}>
                  {activeSlide.metricLabel}
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px', lineHeight: 1.4 }}>
                  {activeSlide.metricSub}
                </div>
                <button
                  onClick={() => {
                    setShowSlidesModal(false);
                    sendPromptToAi(activeSlide.tourPrompt);
                  }}
                  style={{
                    marginTop: '14px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #38bdf8',
                    background: 'rgba(2,132,199,0.3)',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  👁️ Demonstrate Live on Map
                </button>
              </div>
            </div>

            {/* Slide Navigation Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentSlideIdx((i) => Math.max(0, i - 1))}
                disabled={currentSlideIdx === 0}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: currentSlideIdx === 0 ? '#0f172a' : '#1e293b',
                  color: currentSlideIdx === 0 ? '#475569' : '#fff',
                  fontWeight: 700,
                  cursor: currentSlideIdx === 0 ? 'default' : 'pointer'
                }}
              >
                ◀ Previous Slide
              </button>

              <div style={{ display: 'flex', gap: '6px' }}>
                {NASA_SLIDES.map((s, idx) => (
                  <button
                    key={s.num}
                    onClick={() => setCurrentSlideIdx(idx)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: 'none',
                      background: currentSlideIdx === idx ? '#ff2a5f' : '#1e293b',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {s.num}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentSlideIdx((i) => Math.min(NASA_SLIDES.length - 1, i + 1))}
                disabled={currentSlideIdx === NASA_SLIDES.length - 1}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    currentSlideIdx === NASA_SLIDES.length - 1
                      ? '#1e293b'
                      : 'linear-gradient(90deg, #ff2a5f, #ff6b00)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: currentSlideIdx === NASA_SLIDES.length - 1 ? 'default' : 'pointer'
                }}
              >
                Next Slide ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE MISSION GUIDE MODAL */}
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
                <strong style={{ color: '#fff' }}>2. God’s Eye Voice AI & 4 Tactical Layers:</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                  <li><b>👁️ God’s Eye Voice AI:</b> Click <b>🎙️ Talk</b> or <b>👁️ AI Tour</b>—the AI flies the camera to Egypt, Suez, or Central Africa and narrates the telemetry out loud!</li>
                  <li><b>📐 1km vs 375m Footprint Polygons:</b> Zoom to level 13–14 to see true-scale orange 1000m MODIS squares vs tight red 375m VIIRS squares.</li>
                  <li><b>🏹 Fire-Spread Direction Arrows:</b> Rotated azimuth arrows showing where Open-Meteo 10m winds are pushing the flame front (<code>spread_heading_deg</code>).</li>
                  <li><b>🏭 Industrial Flare Masking:</b> Highlights or grays out 175 persistent oil & gas flares in the Gulf of Suez, Sinai, and Persian Gulf.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowGuideModal(false);
                  sendPromptToAi('Take me to Egypt 1km vs 375m footprints');
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
                🇪🇬 Tour 1: Egypt 1km vs 375m (Voice AI)
              </button>

              <button
                onClick={() => {
                  setShowGuideModal(false);
                  sendPromptToAi('Fly to the biggest Dual-Sensor Megafire');
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
                🔥 Tour 2: 2,006 MW Megafire (Voice AI)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
