#!/usr/bin/env python3
"""
SparkGrid - MODIS and VIIRS Hot Spot Spatio-Temporal Harmonization Engine
NASA Space Apps Cairo 2026

Harmonizes:
- MODIS C6.1 (1km nominal resolution, 0-100 numeric confidence)
- VIIRS 375m (NOAA-20 / S-NPP I-band, categorical confidence: low/nominal/high)
"""

import json
import os
import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sklearn.cluster import DBSCAN
from shapely.geometry import Point, MultiPoint, mapping

def parse_time(date_str, time_val):
    """Parse FIRMS acq_date (YYYY-MM-DD) and acq_time (HHMM) into datetime."""
    t_str = str(time_val).zfill(4)
    hh = int(t_str[:2])
    mm = int(t_str[2:])
    return datetime.strptime(f"{date_str} {hh:02d}:{mm:02d}", "%Y-%m-%d %H:%M")

def normalize_confidence(conf, sensor):
    """Normalize confidence to 0.0 - 1.0 continuous float."""
    if sensor == "MODIS":
        try:
            return float(conf) / 100.0
        except (ValueError, TypeError):
            return 0.5
    else:  # VIIRS
        c_str = str(conf).strip().lower()
        if c_str == "high" or c_str == "h":
            return 0.95
        elif c_str == "nominal" or c_str == "n":
            return 0.70
        elif c_str == "low" or c_str == "l":
            return 0.30
        try:
            val = float(conf)
            return val / 100.0 if val > 1.0 else val
        except (ValueError, TypeError):
            return 0.60

def load_and_preprocess(modis_path, viirs_path):
    dfs = []
    
    if os.path.exists(modis_path):
        print(f"[+] Loading MODIS from: {modis_path}")
        df_m = pd.read_csv(modis_path)
        df_m["sensor"] = "MODIS"
        df_m["nominal_res_m"] = 1000.0
        df_m["norm_confidence"] = df_m["confidence"].apply(lambda c: normalize_confidence(c, "MODIS"))
        df_m["brightness_k"] = df_m["brightness"]
        dfs.append(df_m)
    else:
        print(f"[!] Warning: MODIS file not found at {modis_path}")

    if os.path.exists(viirs_path):
        print(f"[+] Loading VIIRS from: {viirs_path}")
        df_v = pd.read_csv(viirs_path)
        df_v["sensor"] = "VIIRS"
        df_v["nominal_res_m"] = 375.0
        df_v["norm_confidence"] = df_v["confidence"].apply(lambda c: normalize_confidence(c, "VIIRS"))
        df_v["brightness_k"] = df_v["bright_ti4"] if "bright_ti4" in df_v.columns else df_v["brightness"]
        dfs.append(df_v)
    else:
        print(f"[!] Warning: VIIRS file not found at {viirs_path}")

    if not dfs:
        raise FileNotFoundError("Neither MODIS nor VIIRS data files could be found.")

    df = pd.concat(dfs, ignore_index=True)
    df["datetime"] = [parse_time(d, t) for d, t in zip(df["acq_date"], df["acq_time"])]
    df["epoch_minutes"] = df["datetime"].apply(lambda dt: dt.timestamp() / 60.0)
    df["frp"] = pd.to_numeric(df["frp"], errors="coerce").fillna(1.0)
    
    print(f"[+] Total raw hotspots ingested: {len(df)} (MODIS: {sum(df['sensor']=='MODIS')}, VIIRS: {sum(df['sensor']=='VIIRS')})")
    return df

def harmonize_hotspots(df, spatial_eps_km=1.5, max_time_diff_min=120.0):
    """
    Spatio-temporal clustering using Haversine DBSCAN + temporal validation.
    Groups detections within 1 km and 30 minutes into unified clusters.
    """
    print(f"[+] Performing Spatio-Temporal Harmonization (eps={spatial_eps_km} km, time_window={max_time_diff_min} min)...")
    
    # Haversine DBSCAN expects coordinates in radians [lat, lon]
    coords_rad = np.radians(df[["latitude", "longitude"]].values)
    kms_per_radian = 6371.0088
    eps_rad = spatial_eps_km / kms_per_radian

    # Stage 1: Spatial clustering
    db = DBSCAN(eps=eps_rad, min_samples=1, metric="haversine", algorithm="ball_tree")
    initial_labels = db.fit_predict(coords_rad)
    df["spatial_cluster"] = initial_labels

    # Stage 2: Temporal refinement within spatial clusters
    final_clusters = []
    cluster_counter = 0

    for sc_id, group in df.groupby("spatial_cluster"):
        if len(group) == 1:
            final_clusters.append((group.index[0], cluster_counter))
            cluster_counter += 1
            continue

        # Sort by time
        sorted_grp = group.sort_values("epoch_minutes")
        current_sub = cluster_counter
        last_time = None

        for idx, row in sorted_grp.iterrows():
            if last_time is None:
                final_clusters.append((idx, current_sub))
                last_time = row["epoch_minutes"]
            elif abs(row["epoch_minutes"] - last_time) <= max_time_diff_min:
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

    # Stage 3: Aggregate Harmonized Features
    geojson_features = []
    
    for c_id, grp in df.groupby("cluster_id"):
        sensors = sorted(list(grp["sensor"].unique()))
        is_multi_sensor = len(sensors) > 1
        
        # Weighted centroid by FRP
        weights = grp["frp"].values
        if weights.sum() > 0:
            c_lat = np.average(grp["latitude"], weights=weights)
            c_lon = np.average(grp["longitude"], weights=weights)
        else:
            c_lat = grp["latitude"].mean()
            c_lon = grp["longitude"].mean()

        total_frp = float(grp["frp"].sum())
        mean_frp = float(grp["frp"].mean())
        max_brightness = float(grp["brightness_k"].max())
        
        # Combined confidence boost if multi-sensor
        conf_scores = grp["norm_confidence"].values
        combined_conf = float(1.0 - np.prod([1.0 - c for c in conf_scores]))
        combined_conf = min(round(combined_conf, 3), 1.0)
        
        # Harmonized classification
        if is_multi_sensor:
            status = "HARMONIZED_MULTI_SENSOR"
            effective_res = 375.0  # Refined by VIIRS subpixel detection
        elif "VIIRS" in sensors:
            status = "VIIRS_HIGH_RES"
            effective_res = 375.0
        else:
            status = "MODIS_STANDARD"
            effective_res = 1000.0

        earliest = grp["datetime"].min().isoformat()
        latest = grp["datetime"].max().isoformat()

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(c_lon, 5), round(c_lat, 5)]
            },
            "properties": {
                "cluster_id": int(c_id),
                "harmonization_status": status,
                "is_multi_sensor": is_multi_sensor,
                "sensors": sensors,
                "detection_count": len(grp),
                "modis_detections": int(sum(grp["sensor"] == "MODIS")),
                "viirs_detections": int(sum(grp["sensor"] == "VIIRS")),
                "total_frp_mw": round(total_frp, 2),
                "mean_frp_mw": round(mean_frp, 2),
                "max_brightness_k": round(max_brightness, 2),
                "confidence_score": combined_conf,
                "effective_resolution_m": effective_res,
                "earliest_detection": earliest,
                "latest_detection": latest,
                "daynight": grp["daynight"].iloc[0] if "daynight" in grp.columns else "U"
            }
        }
        geojson_features.append(feature)

    geojson_collection = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "SparkGrid Harmonized Hotspots (NASA FIRMS MODIS & VIIRS)",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "total_clusters": len(geojson_features),
            "multi_sensor_clusters": sum(1 for f in geojson_features if f["properties"]["is_multi_sensor"]),
            "modis_raw_points": int(sum(df["sensor"] == "MODIS")),
            "viirs_raw_points": int(sum(df["sensor"] == "VIIRS"))
        },
        "features": geojson_features
    }

    print(f"[✓] Harmonization complete! Created {len(geojson_features)} clusters.")
    print(f"    - Multi-Sensor Verified Clusters: {geojson_collection['metadata']['multi_sensor_clusters']}")
    print(f"    - Compression / Aggregation Ratio: {len(df)} -> {len(geojson_features)}")
    return geojson_collection

def main():
    base_data_dir = "/home/azureuser/sparkgrid/data/firms"
    output_path = "/home/azureuser/sparkgrid/data/harmonized_hotspots.geojson"
    
    # Default to regional datasets (faster, focused on Egypt/Africa for Cairo hackathon)
    modis_csv = os.path.join(base_data_dir, "MODIS_C6_1_Northern_and_Central_Africa_24h.csv")
    viirs_csv = os.path.join(base_data_dir, "J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv")
    
    if len(sys.argv) > 2:
        modis_csv = sys.argv[1]
        viirs_csv = sys.argv[2]
        
    df = load_and_preprocess(modis_csv, viirs_csv)
    geojson_data = harmonize_hotspots(df)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson_data, f, indent=2)
    print(f"[✓] Successfully exported harmonized GeoJSON to: {output_path}")

if __name__ == "__main__":
    main()
