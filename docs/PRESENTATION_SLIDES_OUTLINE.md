# 🎬 SparkGrid — 7-Slide Pitch Deck & Demo Video Storyboard
> **NASA Space Apps Cairo 2026** • 4-Minute Judge Pitch & 2-Minute Demo Video

---

## 📽️ 2-Minute Video Timing Guide
- **0:00 - 0:25:** The Problem (The satellite conflict & duplicate alarms)
- **0:25 - 0:50:** The SparkGrid Solution (Spatio-temporal clustering engine)
- **0:50 - 1:30:** Live Application Demo (Map HUD, Esri Satellite, Dual-Verified filtering, popup telemetry)
- **1:30 - 1:50:** Real Results (2.24x data reduction, 72 confirmed fires, 280,000 MW FRP)
- **1:50 - 2:00:** Impact & Call to Action (Saving lives and forests worldwide)

---

## 📑 Slide Deck Outline (7 Slides)

### 📌 Slide 1: Title & Hook
- **Headline:** **SparkGrid** — *Harmonizing the Planet’s Fire Sentinels*
- **Sub-headline:** Spatio-Temporal Fusion of NASA MODIS & VIIRS Satellite Hotspots
- **Visuals:** Dark minimalist aesthetic, SparkGrid logo, NASA Space Apps Cairo 2026 badge, live URL `sparkgrid.masarat.app`.
- **Team Names:** Amr (Lead Architect & DevOps) and Team SparkGrid.
- **Hook:** *"When wildfires ignite, seconds count. But right now, NASA's satellites speak two different languages. SparkGrid translates them into one unified defense grid."*

---

### 📌 Slide 2: The Satellite Dilemma
- **Headline:** Two Eyes in the Sky, Conflicting Views on the Ground
- **Left Column:** **MODIS (Terra & Aqua)** — Coarse 1 km resolution, 24-year continuous record, 0-100% confidence scale.
- **Right Column:** **VIIRS (NOAA-20 & Suomi-NPP)** — Sharp 375 m resolution, detects small/hidden blazes, categorical confidence.
- **The Core Problem:**
  - Duplicate fire alerts overwhelm emergency dispatchers.
  - Conflicting fire perimeters cause misallocated water drops.
  - No unified, real-time spatio-temporal convergence.
- **Visual:** Side-by-side graphic showing a 1 km MODIS square overlapping three 375 m VIIRS points.

---

### 📌 Slide 3: The SparkGrid Engine
- **Headline:** Intelligent Spatio-Temporal Fusion
- **Three Pillars:**
  1. **Confidence Unification:** Normalizes heterogeneous confidence scales into a continuous Bayesian probability.
  2. **Haversine DBSCAN Spatial Clustering:** Grouping detections within 1.5 km physical sensor footprints across the spherical Earth.
  3. **Orbital Window Matching & FRP-Weighted Centroids:** Matching detections within 120-minute overpass intervals, placing centroids directly at the high-energy fire front.
- **Visual:** Flowchart showing raw points -> DBSCAN -> Bayesian fusion -> Single refined 375 m cluster.

---

### 📌 Slide 4: Real Benchmark Results (The 2.24× Breakthrough)
- **Headline:** Proven Impact on 26,000+ Real Satellite Hotspots
- **Key Metrics Callout:**
  - **26,137 Raw Hotspots ➔ 11,660 Harmonized Fires** (**2.24× Redundancy Reduction**)
  - **72 Dual-Sensor Cross-Verified Fires:** 100% ground-truth confidence.
  - **280,039 MW Total Fire Radiative Power (FRP)** accurately mapped.
- **Visual:** Before-and-after map side-by-side: noisy swarm of red/orange dots on the left vs. clean, structured purple/red clusters on the right.

---

### 📌 Slide 5: The Tactical Map HUD (Live Demo)
- **Headline:** Built for Incident Commanders & First Responders
- **Key Features Demonstrated:**
  - **🌑 Dark HUD Mode:** Military-grade contrast for command centers.
  - **🛰️ True Satellite Imagery (Esri World):** Instant terrain and forest boundary inspection.
  - **🟣 Dual-Verified Filter:** One-click isolation of highest-priority threats.
  - **Detailed Telemetry Popups:** Total FRP (MW), effective resolution (375m), peak brightness ($K$), and detection counts.
- **Visual:** Full-screen hero screenshot of `https://sparkgrid.masarat.app`.

---

### 📌 Slide 6: First Responder & Environmental Impact
- **Headline:** Faster Decisions, Safer Communities, Healthier Forests
- **Operational Benefits:**
  - **Zero Duplicate Dispatches:** Eliminates wasted fire truck and helicopter deployments.
  - **Subpixel Fire Perimeter Accuracy:** Enables safe evacuation zone boundaries.
  - **Open GIS Interoperability:** Clean GeoJSON ready for ArcGIS, QGIS, and Google Earth.
- **Target Users:** Civil Defense, UN Disaster Relief, Wildfire Hotshot Crews, Forest Rangers.

---

### 📌 Slide 7: Vision, Open Source & Roadmap
- **Headline:** The Future of Global Fire Defense
- **Roadmap:**
  - Real-time streaming API integration with NASA FIRMS WebSockets.
  - Open-Meteo wind vector prediction for fire front advancement.
  - Industrial flare masking (filtering oil/gas extraction anomalies).
- **Call to Action:** *"Explore the live map now at `sparkgrid.masarat.app` — fully open source on GitHub."*
- **Final Visual:** QR code linking to `https://sparkgrid.masarat.app` and `https://github.com/freefirenoobs/sparkgrid`.