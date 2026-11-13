#!/usr/bin/env python3
"""harmonize.py — NASA FIRMS MODIS & VIIRS Hotspot Harmonization Engine
SparkGrid Space Apps Cairo 2026 — Role 2 (Ryuza / Sharaf)

Sources: MODIS_NRT (1km) + VIIRS_NOAA21_NRT (375m)
Features: schema normalization, industrial flare filtering, wind spread vectors
Output: harmonized_fires.csv + harmonized_hotspots.geojson
"""

import requests
import pandas as pd
import io
import asyncio
import httpx
import json
import numpy as np
from datetime import datetime, timezone


# ── 1. FETCH ──────────────────────────────────────────────
def fetch_firms_data(api_key, source, bbox, days):
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{api_key}/{source}/{bbox}/{days}"
    print(f"Fetching {source} data...")
    response = requests.get(url, timeout=90)
    if response.status_code == 200:
        return pd.read_csv(io.StringIO(response.text))
    print(f"  WARNING: {source} returned {response.status_code}")
    return pd.DataFrame()


# ── 2. NORMALIZE ──────────────────────────────────────────
def normalize_satellite_data(modis_df, viirs_df):
    print("Normalizing schemas...")
    if not modis_df.empty:
        modis_df = modis_df.rename(columns={
            'brightness': 'brightness_ti4_k',
            'bright_t31': 'brightness_ti5_k',
            'frp': 'frp_mw'
        })
        modis_df['confidence'] = pd.cut(
            modis_df['confidence'],
            bins=[-1, 30, 80, 100],
            labels=['low', 'nominal', 'high']
        )
        modis_df['source_resolution_m'] = 1000

    if not viirs_df.empty:
        viirs_df = viirs_df.rename(columns={
            'bright_ti4': 'brightness_ti4_k',
            'bright_ti5': 'brightness_ti5_k',
            'frp': 'frp_mw'
        })
        viirs_df['confidence'] = viirs_df['confidence'].map({
            'l': 'low', 'n': 'nominal', 'h': 'high'
        })
        viirs_df['source_resolution_m'] = 375

    combined_df = pd.concat([modis_df, viirs_df], ignore_index=True)
    combined_df['acq_time'] = combined_df['acq_time'].astype(str).str.zfill(4)
    combined_df['acq_datetime'] = pd.to_datetime(
        combined_df['acq_date'] + ' ' + combined_df['acq_time'],
        format='%Y-%m-%d %H%M'
    ).dt.tz_localize('UTC')
    return combined_df.drop(columns=['acq_date', 'acq_time'])


# ── 3. FLARE FILTER ───────────────────────────────────────
def build_static_flare_mask():
    """Hardcoded Gulf of Suez gas flare coordinates (lat, lon) at ~1km precision.
    Extend by loading MODIS_SP historical type=2 detections for full coverage."""
    return {
        (28.12, 33.21), (28.45, 33.05),
        (31.10, 29.80), (28.69, 33.28)
    }


def flag_industrial_flares_with_mask(nrt_df, flare_mask):
    print("Applying Static Flare Mask...")
    nrt_df['is_industrial'] = nrt_df.apply(
        lambda row: (round(row['latitude'], 2), round(row['longitude'], 2)) in flare_mask,
        axis=1
    )
    clean_fires_df = nrt_df[nrt_df['is_industrial'] == False].copy()
    print(f"  Flagged {nrt_df['is_industrial'].sum()} industrial, kept {len(clean_fires_df)} vegetation fires")
    return clean_fires_df


# ── 4. WIND SPREAD VECTORS ────────────────────────────────
async def fetch_wind_for_grid(client, lat, lon, dates, sem):
    min_date = dates.min()
    now = pd.Timestamp.utcnow()

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_direction_10m,wind_speed_10m",
        "timeformat": "unixtime",
        "wind_speed_unit": "ms"
    }

    if (now - min_date).days > 5:
        url = "https://archive-api.open-meteo.com/v1/archive"
        params["start_date"] = dates.min().strftime('%Y-%m-%d')
        params["end_date"] = dates.max().strftime('%Y-%m-%d')
    else:
        url = "https://api.open-meteo.com/v1/forecast"
        params["past_days"] = 5

    try:
        async with sem:
            response = await client.get(url, params=params, timeout=12.0)
            response.raise_for_status()
            data = response.json()
            return pd.DataFrame({
                'time': data['hourly']['time'],
                'wind_direction_deg': data['hourly']['wind_direction_10m'],
                'wind_speed_mps': data['hourly']['wind_speed_10m']
            })
    except Exception:
        return pd.DataFrame()


async def add_wind_vectors(df):
    print("Batching Open-Meteo wind requests by 1° grid cells...")
    df['grid_lat'] = df['latitude'].round(0)
    df['grid_lon'] = df['longitude'].round(0)
    df['acq_unixtime'] = df['acq_datetime'].astype(int) // 10**9

    for col in ['wind_direction_deg', 'wind_speed_mps', 'spread_heading_deg']:
        df[col] = None

    grids = df.groupby(['grid_lat', 'grid_lon'])
    print(f"Total unique grid cells to query: {len(grids)}")

    sem = asyncio.Semaphore(15)
    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=30, max_keepalive_connections=15)) as client:
        tasks = []
        grid_keys = []
        for (g_lat, g_lon), group in grids:
            grid_keys.append((g_lat, g_lon))
            tasks.append(fetch_wind_for_grid(client, g_lat, g_lon, group['acq_datetime'], sem=sem))

        results = await asyncio.gather(*tasks)

        for (g_lat, g_lon), weather_df in zip(grid_keys, results):
            if weather_df.empty:
                continue

            grid_idx = df[(df['grid_lat'] == g_lat) & (df['grid_lon'] == g_lon)].index

            for idx in grid_idx:
                fire_time = df.loc[idx, 'acq_unixtime']
                weather_df['time_diff'] = abs(weather_df['time'] - fire_time)
                closest = weather_df.loc[weather_df['time_diff'].idxmin()]

                if pd.notna(closest['wind_direction_deg']) and pd.notna(closest['wind_speed_mps']):
                    df.at[idx, 'wind_direction_deg'] = closest['wind_direction_deg']
                    df.at[idx, 'wind_speed_mps'] = closest['wind_speed_mps']
                    df.at[idx, 'spread_heading_deg'] = (closest['wind_direction_deg'] + 180) % 360

    df = df.drop(columns=['grid_lat', 'grid_lon', 'acq_unixtime'])
    wind_count = df['spread_heading_deg'].notna().sum()
    print(f"  Mapped wind vectors for {wind_count}/{len(df)} hotspots.")
    return df


# ── 5. EXPORT ─────────────────────────────────────────────
def export_geojson(df, path):
    """Convert DataFrame to GeoJSON FeatureCollection."""
    features = []
    for _, row in df.iterrows():
        props = {}
        for k, v in row.items():
            if isinstance(v, pd.Timestamp):
                props[k] = v.isoformat()
            elif isinstance(v, (np.integer,)):
                props[k] = int(v)
            elif isinstance(v, (np.floating,)):
                props[k] = None if pd.isna(v) else float(v)
            elif pd.isna(v):
                props[k] = None
            else:
                props[k] = v
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(row['longitude']), float(row['latitude'])]
            },
            "properties": props
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "title": "SparkGrid Harmonized Hotspots (NASA FIRMS MODIS & VIIRS)",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_hotspots": len(df),
            "modis_count": int(len(df[df['instrument'] == 'MODIS'])),
            "viirs_count": int(len(df[df['instrument'] == 'VIIRS'])),
            "with_wind_vectors": int(df['spread_heading_deg'].notna().sum()),
            "total_frp_mw": round(float(df['frp_mw'].sum()), 2)
        }
    }

    with open(path, 'w') as f:
        json.dump(geojson, f, indent=2)
    print(f"Exported GeoJSON to '{path}'")


# ── MAIN PIPELINE ─────────────────────────────────────────
async def run_pipeline(api_key, bbox, days=1):
    print(f"=== SparkGrid Pipeline: {bbox}, {days} days ===\n")

    viirs_df = fetch_firms_data(api_key, "VIIRS_NOAA21_NRT", bbox, days)
    modis_df = fetch_firms_data(api_key, "MODIS_NRT", bbox, days)

    if viirs_df.empty and modis_df.empty:
        print("ERROR: No data from either source. Check MAP_KEY and date availability.")
        return

    unified_df = normalize_satellite_data(modis_df, viirs_df)
    clean_df = flag_industrial_flares_with_mask(unified_df, build_static_flare_mask())
    final_df = await add_wind_vectors(clean_df)

    print(f"\n=== Pipeline Complete: {len(final_df)} hotspots ===")
    print(f"  MODIS:  {len(final_df[final_df['instrument'] == 'MODIS'])}")
    print(f"  VIIRS:  {len(final_df[final_df['instrument'] == 'VIIRS'])}")
    print(f"  With wind: {final_df['spread_heading_deg'].notna().sum()}")
    print(f"  Total FRP: {final_df['frp_mw'].sum():.1f} MW")

    final_df.to_csv('harmonized_fires.csv', index=False)
    print("Exported 'harmonized_fires.csv'")

    export_geojson(final_df, 'harmonized_hotspots.geojson')
    return final_df


if __name__ == "__main__":
    MAP_KEY = "b92bb1344998d34521453b0633e40a6e"
    BBOX = "-180,-90,180,90"  # World

    asyncio.run(run_pipeline(MAP_KEY, BBOX, days=1))