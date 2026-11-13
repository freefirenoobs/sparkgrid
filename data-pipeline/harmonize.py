#!/usr/bin/env python3
"""harmonize.py — NASA FIRMS MODIS & VIIRS Spatio-Temporal Harmonization Engine
SparkGrid Space Apps Cairo 2026 — Roles 1 & 2 Fusion

Features:
- Dual-sensor schema normalization (MODIS 1km + VIIRS 375m)
- Industrial flare filtering (Gulf of Suez, Basra/Persian Gulf, Sahara, Sirte Basin)
- Great-Circle Haversine DBSCAN spatial clustering (1.5 km)
- Orbital temporal envelope fusion (120 min)
- FRP-weighted flame-front centroid computation
- Bayesian multi-sensor confidence fusion (1 - prod(1 - c_i))
- Subpixel footprint refinement (1000m -> 375m)
- Open-Meteo real-time atmospheric wind spread vectors (50-coord batching)
Outputs: harmonized_hotspots.geojson + harmonized_fires.csv
"""

import os
import io
import sys
import json
import time
import asyncio
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from sklearn.cluster import DBSCAN


# ── 1. INGESTION ──────────────────────────────────────────
def fetch_firms_data(api_key, source, bbox, days):
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{api_key}/{source}/{bbox}/{days}"
    print(f"Fetching {source} data from NASA FIRMS API...")
    try:
        response = requests.get(url, timeout=90)
        if response.status_code == 200 and len(response.text.strip()) > 50:
            df = pd.read_csv(io.StringIO(response.text))
            print(f"  [✓] Received {len(df)} rows from {source}")
            return df
        print(f"  WARNING: {source} returned status {response.status_code}")
    except Exception as e:
        print(f"  WARNING: Error fetching {source}: {e}")
    return pd.DataFrame()


# ── 2. NORMALIZE SCHEMAS ──────────────────────────────────
def normalize_satellite_data(modis_df, viirs_df):
    print("Normalizing satellite schemas...")
    dfs = []

    if not modis_df.empty:
        m = modis_df.copy()
        m["instrument"] = "MODIS"
        m["nominal_res_m"] = 1000.0
        m["frp_mw"] = pd.to_numeric(m.get("frp", 1.0), errors="coerce").fillna(1.0)
        m["brightness_ti4_k"] = pd.to_numeric(m.get("brightness", 300.0), errors="coerce").fillna(300.0)
        m["brightness_ti5_k"] = pd.to_numeric(m.get("bright_t31", 290.0), errors="coerce").fillna(290.0)
        
        m["norm_confidence"] = pd.to_numeric(m.get("confidence", 50), errors="coerce").fillna(50) / 100.0
        m["confidence_cat"] = pd.cut(
            m["norm_confidence"] * 100.0,
            bins=[-1, 30, 80, 100],
            labels=["low", "nominal", "high"]
        ).astype(str)
        dfs.append(m)

    if not viirs_df.empty:
        v = viirs_df.copy()
        v["instrument"] = "VIIRS"
        v["nominal_res_m"] = 375.0
        v["frp_mw"] = pd.to_numeric(v.get("frp", 1.0), errors="coerce").fillna(1.0)
        v["brightness_ti4_k"] = pd.to_numeric(v.get("bright_ti4", 310.0), errors="coerce").fillna(310.0)
        v["brightness_ti5_k"] = pd.to_numeric(v.get("bright_ti5", 290.0), errors="coerce").fillna(290.0)
        
        conf_map = {"l": 0.30, "low": 0.30, "n": 0.70, "nominal": 0.70, "h": 0.95, "high": 0.95}
        v["confidence_str"] = v.get("confidence", "nominal").astype(str).str.lower().str.strip()
        v["norm_confidence"] = v["confidence_str"].map(conf_map).fillna(0.70)
        v["confidence_cat"] = v["confidence_str"].map(lambda x: "high" if "h" in x else ("low" if "l" in x else "nominal"))
        dfs.append(v)

    if not dfs:
        return pd.DataFrame()

    combined_df = pd.concat(dfs, ignore_index=True)
    combined_df["acq_time"] = combined_df["acq_time"].astype(str).str.zfill(4)
    combined_df["acq_datetime"] = pd.to_datetime(
        combined_df["acq_date"] + " " + combined_df["acq_time"],
        format="%Y-%m-%d %H%M",
        errors="coerce"
    ).dt.tz_localize("UTC")
    combined_df = combined_df.dropna(subset=["acq_datetime"])
    combined_df["epoch_minutes"] = combined_df["acq_datetime"].astype(int) / (10**9 * 60.0)
    return combined_df


# ── 3. INDUSTRIAL FLARE FILTER ────────────────────────────
def build_static_flare_mask():
    """Gulf of Suez and North African static gas flare coordinates."""
    return {
        (28.12, 33.21), (28.45, 33.05),
        (31.10, 29.80), (28.69, 33.28),
        (29.41, 32.55), (30.15, 31.40)
    }


def is_in_flare_basin(lat, lon, flare_mask):
    if (round(lat, 2), round(lon, 2)) in flare_mask:
        return True
    # Gulf of Suez (Egypt) offshore/coastal oil rigs
    if 27.6 <= lat <= 29.7 and 32.5 <= lon <= 33.9:
        return True
    # Western Desert / Alexandria refineries (Egypt)
    if (31.02 <= lat <= 31.15 and 29.75 <= lon <= 29.90) or (29.7 <= lat <= 30.0 and 28.3 <= lon <= 28.8):
        return True
    # Iraq / Basra / Persian Gulf super-giant oil fields
    if 29.0 <= lat <= 32.5 and 47.0 <= lon <= 51.5:
        return True
    # Algeria Hassi Messaoud Sahara desert oil fields
    if 31.2 <= lat <= 32.2 and 5.6 <= lon <= 6.8:
        return True
    # Libya Sirte Basin desert oil fields
    if 28.2 <= lat <= 30.2 and 18.5 <= lon <= 21.5:
        return True
    return False


def flag_industrial_flares(df, flare_mask):
    print("Applying Industrial Gas Flare Filter...")
    df["is_industrial"] = df.apply(
        lambda row: is_in_flare_basin(row["latitude"], row["longitude"], flare_mask),
        axis=1
    )
    flares = df["is_industrial"].sum()
    print(f"  [✓] Flagged {flares} industrial flare detections, retained {len(df)} total points")
    return df


# ── 4. HAVERSINE DBSCAN SPATIO-TEMPORAL FUSION ────────────
def harmonize_spatio_temporal(df, spatial_eps_km=1.5, max_time_diff_min=120.0):
    print(f"Executing Spatio-Temporal DBSCAN Harmonization (eps={spatial_eps_km} km, window={max_time_diff_min} min)...")
    
    coords_rad = np.radians(df[["latitude", "longitude"]].values)
    kms_per_radian = 6371.0088
    eps_rad = spatial_eps_km / kms_per_radian

    db = DBSCAN(eps=eps_rad, min_samples=1, metric="haversine", algorithm="ball_tree")
    initial_labels = db.fit_predict(coords_rad)
    df["spatial_cluster"] = initial_labels

    final_clusters = []
    cluster_counter = 0

    for sc_id, group in df.groupby("spatial_cluster"):
        if len(group) == 1:
            final_clusters.append((group.index[0], cluster_counter))
            cluster_counter += 1
            continue

        sorted_grp = group.sort_values("epoch_minutes")
        current_sub = cluster_counter
        last_time = None

        for idx, row in sorted_grp.iterrows():
            if last_time is None or abs(row["epoch_minutes"] - last_time) <= max_time_diff_min:
                final_clusters.append((idx, current_sub))
                last_time = row["epoch_minutes"]
            else:
                cluster_counter += 1
                current_sub = cluster_counter
                final_clusters.append((idx, current_sub))
                last_time = row["epoch_minutes"]
        cluster_counter += 1

    cluster_df = pd.DataFrame(final_clusters, columns=["idx", "cluster_id"]).set_index("idx")
    df["cluster_id"] = cluster_df["cluster_id"]

    clusters_data = []

    for c_id, grp in df.groupby("cluster_id"):
        instruments = sorted(list(grp["instrument"].unique()))
        is_multi = len(instruments) > 1

        weights = grp["frp_mw"].values
        if weights.sum() > 0:
            c_lat = float(np.average(grp["latitude"], weights=weights))
            c_lon = float(np.average(grp["longitude"], weights=weights))
        else:
            c_lat = float(grp["latitude"].mean())
            c_lon = float(grp["longitude"].mean())

        total_frp = float(grp["frp_mw"].sum())
        mean_frp = float(grp["frp_mw"].mean())
        max_bright = float(grp["brightness_ti4_k"].max())

        conf_scores = grp["norm_confidence"].values
        combined_conf = float(1.0 - np.prod([1.0 - c for c in conf_scores]))
        combined_conf = min(round(combined_conf, 3), 1.0)

        conf_cat = "high" if combined_conf >= 0.80 else ("nominal" if combined_conf >= 0.50 else "low")

        if is_multi or "VIIRS" in instruments:
            effective_res = 375.0
            status = "HARMONIZED_MULTI_SENSOR" if is_multi else "VIIRS_HIGH_RES"
        else:
            effective_res = 1000.0
            status = "MODIS_STANDARD"

        is_ind = bool(grp["is_industrial"].any())
        satellites = sorted(list(grp["satellite"].astype(str).unique())) if "satellite" in grp.columns else ["NASA"]

        clusters_data.append({
            "cluster_id": int(c_id),
            "latitude": round(c_lat, 5),
            "longitude": round(c_lon, 5),
            "is_multi_sensor": bool(is_multi),
            "harmonization_status": status,
            "sensors": instruments,
            "instrument": "+".join(instruments) if is_multi else instruments[0],
            "satellite": "+".join(satellites),
            "detection_count": int(len(grp)),
            "modis_detections": int(sum(grp["instrument"] == "MODIS")),
            "viirs_detections": int(sum(grp["instrument"] == "VIIRS")),
            "total_frp_mw": round(total_frp, 2),
            "frp_mw": round(total_frp, 2),
            "mean_frp_mw": round(mean_frp, 2),
            "max_brightness_k": round(max_bright, 2),
            "confidence_score": combined_conf,
            "confidence": conf_cat,
            "effective_resolution_m": effective_res,
            "source_resolution_m": effective_res,
            "is_industrial": bool(is_ind),
            "earliest_detection": grp["acq_datetime"].min().isoformat(),
            "latest_detection": grp["acq_datetime"].max().isoformat(),
            "acq_datetime": grp["acq_datetime"].min().isoformat(),
            "epoch_unixtime": int(grp["acq_datetime"].min().timestamp())
        })

    cluster_df_res = pd.DataFrame(clusters_data)
    multi_count = sum(cluster_df_res["is_multi_sensor"])
    print(f"  [✓] Harmonization complete: {len(df)} raw points -> {len(cluster_df_res)} unified clusters")
    print(f"  [⭐] Multi-Sensor Dual-Verified Clusters: {multi_count}")
    return cluster_df_res


# ── 5. OPEN-METEO WIND VECTORS (BATCHED) ──────────────────
async def enrich_clusters_with_wind(df):
    print("Batching Open-Meteo wind requests (50 coordinates per call)...")
    df["grid_lat"] = df["latitude"].round(0)
    df["grid_lon"] = df["longitude"].round(0)

    for col in ["wind_direction_deg", "wind_speed_mps", "spread_heading_deg"]:
        df[col] = None

    # Prioritize MENA / Africa / Europe grid cells first
    grids = {}
    for idx, row in df.iterrows():
        g_key = (int(row["grid_lat"]), int(row["grid_lon"]))
        grids.setdefault(g_key, []).append(idx)

    grid_keys = sorted(
        grids.keys(),
        key=lambda k: (0 if (-10 <= k[0] <= 45 and -20 <= k[1] <= 60) else 1, -len(grids[k]))
    )
    print(f"  Total unique 1° grid cells to query: {len(grid_keys)}")

    batch_size = 50
    for i in range(0, len(grid_keys), batch_size):
        batch = grid_keys[i:i+batch_size]
        lats = ",".join(str(k[0]) for k in batch)
        lons = ",".join(str(k[1]) for k in batch)
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms"
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, dict):
                    data = [data]
                for k, item in zip(batch, data):
                    curr = item.get("current", {})
                    w_spd = curr.get("wind_speed_10m")
                    w_dir = curr.get("wind_direction_10m")
                    if w_spd is not None and w_dir is not None:
                        heading = round((float(w_dir) + 180.0) % 360.0, 1)
                        for row_idx in grids[k]:
                            df.at[row_idx, "wind_speed_mps"] = round(float(w_spd), 2)
                            df.at[row_idx, "wind_direction_deg"] = round(float(w_dir), 1)
                            df.at[row_idx, "spread_heading_deg"] = heading
        except Exception as e:
            print(f"  Warning on wind batch {i}: {e}")
        time.sleep(0.15)

    df = df.drop(columns=["grid_lat", "grid_lon", "epoch_unixtime"])
    wind_count = df["spread_heading_deg"].notna().sum()
    print(f"  [✓] Mapped wind vectors for {wind_count}/{len(df)} clusters")
    return df


# ── 6. EXPORT GEOJSON & CSV ───────────────────────────────
def export_outputs(df, geojson_path, csv_path):
    features = []
    for _, row in df.iterrows():
        props = {}
        for k, v in row.items():
            if isinstance(v, (list, tuple)):
                props[k] = list(v)
            elif isinstance(v, (bool, np.bool_)):
                props[k] = bool(v)
            elif isinstance(v, (np.integer, int)):
                props[k] = int(v)
            elif isinstance(v, (np.floating, float)):
                if pd.isna(v):
                    props[k] = None
                elif k in ("latitude", "longitude"):
                    props[k] = round(float(v), 5)
                else:
                    props[k] = round(float(v), 2)
            elif not isinstance(v, (list, tuple, dict)) and pd.isna(v):
                props[k] = None
            else:
                props[k] = v

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(float(row["longitude"]), 5), round(float(row["latitude"]), 5)]
            },
            "properties": props
        })

    multi_count = int(sum(df["is_multi_sensor"]))
    ind_count = int(sum(df["is_industrial"]))
    modis_count = int(sum(df["sensors"].apply(lambda s: "MODIS" in s)))
    viirs_count = int(sum(df["sensors"].apply(lambda s: "VIIRS" in s)))
    with_wind = int(df["spread_heading_deg"].notna().sum())
    total_frp = round(float(df["total_frp_mw"].sum()), 2)

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "SparkGrid Harmonized Hotspots (NASA FIRMS MODIS & VIIRS)",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_clusters": len(df),
            "multi_sensor_clusters": multi_count,
            "industrial_flares": ind_count,
            "modis_count": modis_count,
            "viirs_count": viirs_count,
            "with_wind_vectors": with_wind,
            "total_frp_mw": total_frp
        },
        "features": features
    }

    with open(geojson_path, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"[✓] Exported GeoJSON: {geojson_path}")

    csv_df = df.copy()
    if "sensors" in csv_df.columns:
        csv_df["sensors"] = csv_df["sensors"].apply(lambda s: ";".join(s) if isinstance(s, list) else str(s))
    csv_df.to_csv(csv_path, index=False)
    print(f"[✓] Exported CSV: {csv_path}")


# ── MAIN PIPELINE ─────────────────────────────────────────
async def run_pipeline(api_key, bbox, days=1):
    print(f"=== SparkGrid Spatio-Temporal Pipeline (BBOX={bbox}, days={days}) ===\n")

    viirs_df = fetch_firms_data(api_key, "VIIRS_NOAA21_NRT", bbox, days)
    modis_df = fetch_firms_data(api_key, "MODIS_NRT", bbox, days)

    if viirs_df.empty and modis_df.empty:
        local_v = "/home/azureuser/sparkgrid/data/firms/J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv"
        local_m = "/home/azureuser/sparkgrid/data/firms/MODIS_C6_1_Northern_and_Central_Africa_24h.csv"
        if os.path.exists(local_v) and os.path.exists(local_m):
            print("  Falling back to cached local FIRMS datasets...")
            viirs_df = pd.read_csv(local_v)
            modis_df = pd.read_csv(local_m)

    if viirs_df.empty and modis_df.empty:
        print("ERROR: No data available from API or local fallback.")
        return

    unified_df = normalize_satellite_data(modis_df, viirs_df)
    clean_df = flag_industrial_flares(unified_df, build_static_flare_mask())
    clusters_df = harmonize_spatio_temporal(clean_df, spatial_eps_km=1.5, max_time_diff_min=120.0)
    final_df = await enrich_clusters_with_wind(clusters_df)

    out_geojson = "/home/azureuser/sparkgrid/data/harmonized_hotspots.geojson"
    out_csv = "/home/azureuser/sparkgrid/data-pipeline/harmonized_fires.csv"
    export_outputs(final_df, out_geojson, out_csv)
    
    gdrive_dir = "/home/azureuser/gdrive/SparkGrid_Data"
    if os.path.exists(gdrive_dir):
        os.system(f"cp {out_csv} {gdrive_dir}/harmonized_fires.csv 2>/dev/null || true")

    return final_df


if __name__ == "__main__":
    MAP_KEY = "b92bb1344998d34521453b0633e40a6e"
    BBOX = "-180,-90,180,90"  # World
    days = 1

    asyncio.run(run_pipeline(MAP_KEY, BBOX, days=days))
