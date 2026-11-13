# 🛰️ SparkGrid — NASA Space Apps Cairo 2026
> **Challenge:** Harmonization of MODIS and VIIRS Hot Spots  
> **Live Web App:** [https://sparkgrid.masarat.app](https://sparkgrid.masarat.app)  
> **FastAPI Docs:** [https://sparkgrid-api.masarat.app/docs](https://sparkgrid-api.masarat.app/docs)  
> **AI Coding Hub:** [https://sparkgrid-ai.masarat.app](https://sparkgrid-ai.masarat.app)  

---

## 📌 Executive Summary
NASA operates two premier active fire remote sensing instruments in low Earth orbit:
- **MODIS** (Terra & Aqua): 1 km spatial resolution.
- **VIIRS** (Suomi-NPP & NOAA-20): 375 m spatial resolution.

Discrepancies in orbital overpass timing, sensor geometry, and spatial granularity produce duplicate fire detections and operational confusion for emergency management agencies.

**SparkGrid** is an automated, real-time spatio-temporal harmonization engine that ingests raw NASA FIRMS datasets, performs DBSCAN spatio-temporal clustering (1.5 km, 120 min), calculates Fire Radiative Power (FRP) weighted centroids, and outputs high-fidelity GeoJSON with sub-pixel resolution.

### 📊 Benchmark Impact (Northern & Central Africa 24h Window)
- **Raw Input Hotspots:** 26,137 detections (3,773 MODIS + 22,364 VIIRS)
- **Harmonized Clusters:** 11,660 unified hotspots
- **Data Reduction Ratio:** **2.24× compression** (de-duplicating over 14,000 redundant reports)
- **Dual-Sensor Validated Fires:** 72 high-confidence fires cross-verified by both instruments
- **Cumulative Fire Radiative Power (FRP):** 280,039.01 MW

---

## 🏗️ Repository Architecture
```text
/sparkgrid
├── backend/                  # FastAPI 0.115+ REST API & GeoJSON provider
│   ├── main.py               # Endpoints (/api/hotspots, /api/stats, /api/deploy)
│   └── requirements.txt
├── frontend/                 # React 18 + Vite + Leaflet Tactical HUD
│   ├── src/App.jsx           # Dark HUD, Esri Satellite, & Street basemap switchers
│   └── vite.config.js
├── data-pipeline/            # Spatio-temporal harmonization pipeline
│   ├── harmonize.py          # Haversine DBSCAN + temporal fusion engine
│   └── requirements.txt
├── docs/                     # NASA presentation slides, rubrics, & diagrams
├── deploy.sh                 # Automatic deployment script for RemoteDesktop-VM
└── .gitignore
```

---

## 🚀 Live Services & Endpoints
| Service | Production URL | Origin Port |
| :--- | :--- | :--- |
| **Tactical Map (Frontend)** | [sparkgrid.masarat.app](https://sparkgrid.masarat.app) | `5173` (Vite) |
| **API & Swagger UI** | [sparkgrid-api.masarat.app/docs](https://sparkgrid-api.masarat.app/docs) | `8000` (FastAPI) |
| **AI Coding Hub (Open WebUI)** | [sparkgrid-ai.masarat.app](https://sparkgrid-ai.masarat.app) | `8080` (Docker) |

---

## 👥 Team Roles (SparkGrid Cairo 2026)
1. **Lead Architect & DevOps (Amr):** VM management, Cloudflare tunnel routing, Git CI/CD deployment.
2. **Data Pipeline Lead:** Algorithm tuning, gas flare filtering, fire propagation vectors.
3. **Frontend Map Lead:** React + Leaflet layers, sensor footprints, HUD controls.
4. **Analytics HUD Lead:** FRP metrics, compression stats, GeoJSON download exports.
5. **AI Tactical Briefing Lead:** Open-Meteo weather integration + LLM incident response plans.
6. **NASA Pitch & Video Lead:** 2-minute demo video, slide deck, rubric responses.

---

## 🔄 Automated Deployment
This repository is configured with automated continuous deployment on `RemoteDesktop-VM`.
- **Scheduled Auto-Sync:** A cron daemon checks for new commits on `main` every 2 minutes.
- **Instant Webhook:** Trigger `POST https://sparkgrid-api.masarat.app/api/deploy?token=sparkgrid2026` to deploy immediately.