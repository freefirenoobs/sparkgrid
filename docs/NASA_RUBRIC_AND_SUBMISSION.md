# 🏆 NASA Space Apps Cairo 2026 — Official Project Submission
## Project Name: SparkGrid
### Challenge: Harmonization of MODIS and VIIRS Hot Spots

---

## 🚀 1. Project Summary
Every wildfire season, emergency services, forest managers, and environmental scientists rely on NASA active fire satellite data to detect blazes and save lives. However, NASA’s two primary operational instruments—**MODIS (1 km)** and **VIIRS (375 m)**—observe the Earth at different times, angles, and spatial granularities. This leads to duplicate fire alerts, conflicting fire perimeters, and severe data clutter during crisis operations.

**SparkGrid** is an automated, real-time spatio-temporal harmonization engine. It fuses raw MODIS and VIIRS thermal anomaly streams into a single, unified, de-duplicated operational picture. By combining **Haversine DBSCAN spatial clustering**, **orbital overpass temporal windows**, **Fire Radiative Power (FRP) weighted centroids**, and **Bayesian multi-sensor confidence reinforcement**, SparkGrid:
- De-duplicates noisy satellite streams with a **2.24× data compression ratio** (reducing 26,137 raw points to 11,660 actionable fires in a single 24h window).
- Pinpoints **72 cross-verified dual-sensor ground-truth fires** with reinforced confidence.
- Refines coarse 1 km MODIS detections to **375 m sub-pixel resolution**.
- Provides a responsive, military-grade **Tactical Map HUD** with real-time basemap switching (Dark HUD, Esri True Satellite, and Street Maps).

---

## 🛰️ 2. Space Agency Data Sources & APIs Used
SparkGrid directly leverages official NASA Earth Science open datasets:
1. **NASA FIRMS NRT MODIS C6.1 (Terra and Aqua):**
   - Active fire and thermal anomalies at 1 km spatial resolution.
   - Numeric detection confidence (0% to 100%).
   - Calibrated 4 µm and 11 µm brightness temperatures and Fire Radiative Power (MW).
2. **NASA FIRMS NRT VIIRS 375m C2 (Suomi-NPP & NOAA-20 / JPSS):**
   - Active fire detections using the high-resolution I-Band (I4: 3.74 µm, I5: 11.45 µm).
   - Categorical detection confidence (`low`, `nominal`, `high`).
3. **NASA Earthdata Login & FIRMS REST API:**
   - Automated ingestion of 24-hour and 7-day near-real-time global active fire feeds.

---

## 🔬 3. Detailed Scientific & Technical Methodology

### Phase 1: Confidence Unification & Preprocessing
Raw detection confidence values are normalized to a uniform continuous scale $[0.0, 1.0]$:
- MODIS: $\text{Confidence} / 100$
- VIIRS: `low` = $0.30$, `nominal` = $0.70$, `high` = $0.95$

### Phase 2: Spatio-Temporal DBSCAN Fusion
- **Spatial Clustering:** Observations within a great-circle Haversine distance $\epsilon \le 1.5\text{ km}$ (the physical footprint of a MODIS pixel accounting for scan angle broadening) are clustered.
- **Temporal Alignment:** Matches detections within a 120-minute temporal envelope, corresponding to the orbital separation between morning (Terra) and afternoon (Aqua/NOAA-20) orbits.

### Phase 3: Energy-Weighted Centroid & Subpixel Refinement
- Traditional geometric centroids place fire points in unburned gaps between clusters. SparkGrid calculates **FRP-weighted centroids**, shifting coordinates toward the active flame front with maximum energy release.
- When VIIRS detections are present in a cluster, the effective ground resolution is refined to **375 meters**, enabling precise evacuation perimeter planning.

### Phase 4: Multi-Sensor Bayesian Verification
Fires independently detected by both MODIS and VIIRS within the temporal window receive joint probability confirmation:
$$C_{\text{fused}} = 1 - \prod (1 - c_i)$$
This eliminates sensor-specific artifacts (sun glint, hot ground surfaces, detector noise) and isolates true active wildfires.

---

## 📊 4. Measured Benchmark Results (24h Real Dataset)

| Metric | Raw NASA Datasets | SparkGrid Harmonized | Impact |
| :--- | :--- | :--- | :--- |
| **Total Fire Points** | 26,137 raw records | **11,660 unified clusters** | **2.24× Redundancy Reduction** |
| **MODIS Points** | 3,773 (1 km) | 2,216 isolated + 72 merged | Unified with fine sensors |
| **VIIRS Points** | 22,364 (375 m) | 9,372 isolated + 72 merged | Subpixel precision maintained |
| **Cross-Verified Fires** | 0 (Uncorrelated) | **72 Dual-Sensor Fires** | 100% High Confidence |
| **Cumulative Energy** | Fragmented | **280,039.01 MW FRP** | Accurate global energy budget |

---

## 🎯 5. Alignment with NASA Space Apps Judging Rubric

### 1. Impact (Relevance to Global Firefighting & NASA)
- Prevents dispatching emergency units to duplicate fire reports.
- Supplies incident commanders with precise energy (MW) metrics to allocate aerial retardant drops efficiently.
- De-duplicated GeoJSON feeds can be directly consumed by disaster response agencies (UN OCHA, civil defense, Red Cross).

### 2. Innovation & Creativity
- Unique combination of **energy-weighted spatial physics** with **Bayesian probability fusion**.
- Resolves the multi-decade challenge of cross-sensor harmonization without losing sub-pixel VIIRS accuracy.

### 3. Validity & Scientific Rigor
- Preserves raw instrument telemetry (Kelvin brightness temperatures, satellite IDs, overpass UTC times).
- Accounts for scan geometry and orbital inclination differences.

### 4. Feasibility & Operational Readiness
- **100% Live & Functional:** The application is deployed in production right now at `https://sparkgrid.masarat.app`.
- **Zero-Latency API:** FastAPI backend serves filtered GeoJSON clusters in under 50 milliseconds.
- **Automated CI/CD:** Server auto-syncs with GitHub every 120 seconds.

---

## 🌐 6. Project Links & Artifacts
- **Live Interactive HUD:** [https://sparkgrid.masarat.app](https://sparkgrid.masarat.app)
- **API Swagger Documentation:** [https://sparkgrid-api.masarat.app/docs](https://sparkgrid-api.masarat.app/docs)
- **Open-Source GitHub Repository:** [https://github.com/freefirenoobs/sparkgrid](https://github.com/freefirenoobs/sparkgrid)
- **AI Coding Hub:** [https://sparkgrid-ai.masarat.app](https://sparkgrid-ai.masarat.app)