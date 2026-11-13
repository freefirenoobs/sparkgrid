# 🛰️ SparkGrid Architecture & Harmonization Methodology
## Challenge: Harmonization of MODIS and VIIRS Hot Spots (NASA Space Apps Cairo 2026)

### 1. Problem Context
NASA FIRMS provides near-real-time active fire detections from two primary instrument suites:
1. **MODIS (Terra & Aqua):** ~1 km spatial footprint. Long historic record (2000–present). Numeric confidence (0–100%).
2. **VIIRS (S-NPP, NOAA-20, NOAA-21):** ~375 m I-band spatial footprint. Higher spatial fidelity, detects smaller/cooler fires. Categorical confidence (`low`, `nominal`, `high`).

Because the instruments differ in footprint, point-spread functions, overpass times, and detection algorithms, raw overlay leads to:
- Double counting of fire events.
- Discrepancies in Fire Radiative Power (FRP) estimates.
- Visual clutter without spatial-temporal convergence.

### 2. Harmonization Algorithm
SparkGrid uses a multi-stage spatio-temporal clustering engine:
1. **Confidence Unification:** Normalizes MODIS (0–100) and VIIRS (`low`: 0.3, `nominal`: 0.7, `high`: 0.95) into continuous $[0.0, 1.0]$.
2. **Haversine DBSCAN Spatial Clustering:** Projects geographic coordinates into radian space with an $\epsilon = 1.5\text{ km}$ boundary based on sensor pixel geometries.
3. **Temporal Windowing:** Correlates detections within orbital overpass windows ($|\Delta t| \le 120\text{ min}$) reflecting the constellation spacing of Aqua/Terra and NOAA-20.
4. **FRP-Weighted Centroids:** Centers clusters at the high-intensity core of the fire front rather than simple geometric means.
5. **Confidence Boosting:** Multi-sensor co-detections receive Bayesian confidence reinforcement:
   $$C_{\text{combined}} = 1 - \prod (1 - c_i)$$
6. **Subpixel Footprint Refinement:** Multi-sensor clusters are refined from $1000\text{m}$ to $375\text{m}$ effective resolution using the VIIRS detection boundary.
