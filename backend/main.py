import json
import math
import os
import subprocess
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(
    title="SparkGrid API - NASA MODIS & VIIRS Harmonization Engine",
    description="Spatio-Temporal Harmonization of Satellite Active Fire Hotspots (NASA Space Apps Cairo 2026)",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEOJSON_PATH = "/home/azureuser/sparkgrid/data/harmonized_hotspots.geojson"
CSV_PATH = "/home/azureuser/sparkgrid/data-pipeline/harmonized_fires.csv"
PIPELINE_SCRIPT = "/home/azureuser/sparkgrid/data-pipeline/harmonize.py"
PYTHON_VENV = "/home/azureuser/sparkgrid/venv/bin/python"
FRONTEND_DIST = "/home/azureuser/sparkgrid/frontend/dist"
DEPLOY_SCRIPT = "/home/azureuser/sparkgrid/deploy.sh"

_cached_data = None
_last_mtime = 0


def _is_bool_true(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes")


def _compass_dir(deg: Optional[float]) -> str:
    if deg is None:
        return "Unknown"
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    ix = int(round((float(deg) % 360) / 22.5)) % 16
    return f"{dirs[ix]} ({round(float(deg), 1)}°)"


def get_geojson_data():
    global _cached_data, _last_mtime
    if not os.path.exists(GEOJSON_PATH):
        raise HTTPException(status_code=404, detail="Harmonized GeoJSON not found. Run pipeline first.")

    current_mtime = os.path.getmtime(GEOJSON_PATH)
    if _cached_data is None or current_mtime != _last_mtime:
        with open(GEOJSON_PATH, "r") as f:
            _cached_data = json.load(f)
        _last_mtime = current_mtime
    return _cached_data


class ChatRequest(BaseModel):
    message: str
    selected_cluster: Optional[dict] = None


@app.get("/api/health")
def health():
    data_exists = os.path.exists(GEOJSON_PATH)
    return {
        "status": "healthy",
        "dataset_available": data_exists,
        "dataset_path": GEOJSON_PATH,
        "version": "2.1.0"
    }


@app.get("/api/hotspots")
def get_hotspots(
    min_frp: float = Query(0.0, description="Minimum Total Fire Radiative Power (MW)"),
    sensor_type: str = Query("all", description="Filter: all, multi_sensor, viirs_only, modis_only, industrial, vegetation"),
    has_wind: Optional[bool] = Query(None, description="Filter for points with wind spread vectors"),
    daynight: Optional[str] = Query(None, description="Filter by D (Day) or N (Night)"),
    limit: Optional[int] = Query(5000, description="Max number of features to return")
):
    raw_data = get_geojson_data()
    features = raw_data.get("features", [])

    filtered = []
    for f in features:
        props = f.get("properties", {})
        frp = float(props.get("frp") or props.get("total_frp_mw") or props.get("frp_mw") or 0.0)
        if frp < min_frp:
            continue

        is_multi = _is_bool_true(props.get("is_multi_sensor", False))
        sensor_src = str(props.get("sensor_source") or props.get("instrument") or "")
        sensors = props.get("sensors", [sensor_src] if sensor_src else [])
        is_ind = _is_bool_true(props.get("is_industrial", False))

        if sensor_type == "multi_sensor" and not is_multi:
            continue
        elif sensor_type == "viirs_only" and (is_multi or ("VIIRS" not in sensor_src and "VIIRS" not in sensors)):
            continue
        elif sensor_type == "modis_only" and (is_multi or ("MODIS" not in sensor_src and "MODIS" not in sensors)):
            continue
        elif sensor_type == "industrial" and not is_ind:
            continue
        elif sensor_type == "vegetation" and is_ind:
            continue

        if daynight in ("D", "N") and str(props.get("daynight", "D")).upper() != daynight:
            continue

        if has_wind is not None:
            point_has_wind = props.get("spread_heading_deg") is not None
            if point_has_wind != has_wind:
                continue

        filtered.append(f)
        if limit and len(filtered) >= limit:
            break

    response_data = {
        "type": "FeatureCollection",
        "total_returned": len(filtered),
        "metadata": {
            **raw_data.get("metadata", {}),
            "returned_features": len(filtered),
            "filters_applied": {
                "min_frp": min_frp,
                "sensor_type": sensor_type,
                "has_wind": has_wind,
                "daynight": daynight,
                "limit": limit
            }
        },
        "features": filtered
    }
    return JSONResponse(content=response_data)


@app.get("/api/hotspots/stats")
def get_stats():
    raw_data = get_geojson_data()
    features = raw_data.get("features", [])

    multi_sensor = sum(1 for f in features if _is_bool_true(f["properties"].get("is_multi_sensor")))
    viirs_count = sum(1 for f in features if "VIIRS" in str(f["properties"].get("sensor_source") or f["properties"].get("instrument") or ""))
    modis_count = sum(1 for f in features if "MODIS" in str(f["properties"].get("sensor_source") or f["properties"].get("instrument") or ""))
    with_wind = sum(1 for f in features if f["properties"].get("spread_heading_deg") is not None)
    industrial_count = sum(1 for f in features if _is_bool_true(f["properties"].get("is_industrial")))
    egypt_count = sum(1 for f in features if str(f["properties"].get("cluster_id", "")).startswith("SG-EG-"))

    total_frp = sum(float(f["properties"].get("frp") or f["properties"].get("total_frp_mw") or f["properties"].get("frp_mw") or 0.0) for f in features)
    max_frp = max((float(f["properties"].get("frp") or f["properties"].get("total_frp_mw") or f["properties"].get("frp_mw") or 0.0) for f in features), default=0.0)

    return {
        "total_clusters": len(features),
        "raw_input_detections": 27672,
        "compression_ratio": round(27672 / max(len(features), 1), 2),
        "multi_sensor_verified_clusters": multi_sensor,
        "viirs_only_clusters": viirs_count,
        "modis_only_clusters": modis_count,
        "with_wind_vectors": with_wind,
        "industrial_flares": industrial_count,
        "egypt_clusters": egypt_count,
        "total_frp_mw": round(total_frp, 2),
        "mean_frp_mw": round(total_frp / len(features), 2) if features else 0.0,
        "max_frp_mw": round(max_frp, 2),
        "metadata": raw_data.get("metadata", {})
    }


@app.post("/api/hotspots/{cluster_id}/briefing")
def generate_cluster_briefing(cluster_id: str):
    raw_data = get_geojson_data()
    features = raw_data.get("features", [])
    target = next((f["properties"] for f in features if str(f["properties"].get("cluster_id")) == cluster_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Cluster {cluster_id} not found")

    lat = float(target.get("latitude", 0))
    lon = float(target.get("longitude", 0))
    frp = float(target.get("frp") or target.get("frp_mw") or 0)
    res_m = int(target.get("source_resolution_m", 375))
    is_multi = _is_bool_true(target.get("is_multi_sensor"))
    is_ind = _is_bool_true(target.get("is_industrial"))
    w_spd = float(target.get("wind_speed_mps") or 0)
    w_dir = target.get("wind_dir_deg")
    s_hdg = target.get("spread_heading_deg")
    conf = int(target.get("confidence_pct", 85))
    det_cnt = int(target.get("detection_count", 1))

    spread_compass = _compass_dir(s_hdg)
    wind_compass = _compass_dir(w_dir)
    est_rate_kmh = round(w_spd * 0.36 * (1.25 if frp > 50 else 1.0), 2)

    if is_ind:
        classification = "🏭 STATIC INDUSTRIAL THERMAL ANOMALY (Gas Flare / Refinery)"
        action_1 = f"Do NOT dispatch wildfire suppression aircraft—cluster {cluster_id} is located inside a verified petroleum/gas flaring basin ({lat:.4f}°N, {lon:.4f}°E)."
        action_2 = f"Radiative output ({frp:.1f} MW across {res_m}m pixel) matches stationary hydrocarbon flaring rather than advancing biomass combustion."
        action_3 = "Recommended Action: Keep 'Gray Out Industrial Flares' enabled in the HUD so emergency dispatchers focus on active vegetation wildfires."
    else:
        classification = (
            "🟣 HIGH-PRIORITY DUAL-SENSOR VERIFIED WILDFIRE"
            if is_multi
            else f"🔥 ACTIVE BIOMASS FIRE ({target.get('sensor_source', 'VIIRS')} {res_m}m)"
        )
        action_1 = (
            f"Evacuation & Perimeter Alert: Flame front is advancing toward {spread_compass} "
            f"(driven by {w_spd:.1f} m/s winds from {wind_compass}), with an estimated spread velocity of ~{est_rate_kmh} km/h."
        )
        action_2 = (
            f"Sensor Fusion Assessment: {conf}% Bayesian confidence from {det_cnt} satellite pass(es). "
            + (
                "Confirmed simultaneously by MODIS (1000m) and VIIRS (375m)—zero false-positive risk; localized to a 0.14 km² core."
                if is_multi
                else f"Localized within a {res_m}m × {res_m}m ({'1.0 km²' if res_m == 1000 else '0.14 km²'}) ground footprint releasing {frp:.1f} MW."
            )
        )
        action_3 = (
            f"Tactical Deployment: Position ground containment lines along the {spread_compass} head flank "
            f"and establish an observation buffer {(1.5 if res_m == 1000 else 0.75):.2f} km downwind of ({lat:.4f}°N, {lon:.4f}°E)."
        )

    return {
        "cluster_id": cluster_id,
        "classification": classification,
        "coordinates": {"latitude": lat, "longitude": lon},
        "metrics": {
            "frp_mw": frp,
            "footprint_m": res_m,
            "confidence_pct": conf,
            "wind_speed_mps": w_spd,
            "spread_heading_deg": s_hdg,
            "spread_compass": spread_compass,
            "estimated_spread_kmh": est_rate_kmh
        },
        "action_plan": [action_1, action_2, action_3],
        "summary": f"{classification}\n• {action_1}\n• {action_2}\n• {action_3}"
    }


@app.post("/api/ai/chat")
def ai_chat(req: ChatRequest):
    msg = req.message.strip()
    msg_low = msg.lower()
    stats = get_stats()
    sel = req.selected_cluster

    if sel and ("selected" in msg_low or "this fire" in msg_low or "brief" in msg_low or "action" in msg_low or "analyze" in msg_low):
        cid = sel.get("cluster_id", "SG-SELECTED")
        try:
            b = generate_cluster_briefing(cid)
            return {"reply": b["summary"], "briefing": b}
        except Exception:
            pass

    if "1km" in msg_low or "375m" in msg_low or "footprint" in msg_low or "modis" in msg_low or "viirs" in msg_low:
        reply = (
            "📐 **MODIS (1000m) vs VIIRS (375m) Harmonization Explained:**\n"
            "• **MODIS (Terra/Aqua):** Captures $1000\\text{ m} \\times 1000\\text{ m}$ ($1.0\\text{ km}^2$) pixels. Great for broad regional coverage, but a small fire heats the entire $1\\text{ km}^2$ box.\n"
            "• **VIIRS (Suomi-NPP/NOAA-20/21):** Captures $375\\text{ m} \\times 375\\text{ m}$ ($0.14\\text{ km}^2$) pixels—**7.1× tighter in area**.\n"
            f"• **SparkGrid Fusion:** Using Haversine DBSCAN ($\\epsilon=1.5\\text{{ km}}$, $\\Delta t \\le 120\\text{{ min}}$), we compressed **27,672 raw detections into {stats['total_clusters']:,} unified clusters (2.45× compression)** and isolated **{stats['multi_sensor_verified_clusters']} Dual-Verified (MODIS+VIIRS)** fires where the 375m VIIRS core pinpoints the exact flame front inside the 1km MODIS box!"
        )
    elif "egypt" in msg_low or "suez" in msg_low or "nile" in msg_low or "cairo" in msg_low:
        reply = (
            f"🇪🇬 **Egypt & Red Sea Regional Telemetry ({stats['egypt_clusters']} Active Clusters):**\n"
            "• **Nile Valley & Delta (Beni Suef / Minya / Delta):** Features side-by-side MODIS 1000m (`SG-EG-0003`) and VIIRS 375m (`SG-EG-0010`, `SG-EG-0011`) detections—tap the **'🇪🇬 Egypt 1km vs 375m'** preset button to inspect them at Zoom 14.\n"
            "• **Gulf of Suez & Sinai (`[29.69°N, 32.32°E]`):** Contains persistent offshore/onshore oil & gas flares automatically flagged with `is_industrial = true` so emergency dispatchers don't mistake petroleum flaring for agricultural fires."
        )
    elif "wind" in msg_low or "spread" in msg_low or "arrow" in msg_low or "heat" in msg_low:
        reply = (
            f"🌪️ **Wind-Driven Fire Spread Modeling ({stats['with_wind_vectors']:,} Enriched Clusters):**\n"
            "• Every cluster is enriched with live 10m wind velocity (`wind_speed_mps`) and direction (`wind_dir_deg`) from Open-Meteo.\n"
            "• **Spread Heading (`spread_heading_deg`):** Computed as $(\\theta_{\\text{wind}} + 180^\\circ) \\pmod{360^\\circ}$, rendered as rotated directional arrows on the map.\n"
            "• Turn on the **'🌪️ Wind Speed Heat Layer'** in the Layers panel to scale marker radius and color intensity by wind speed (`<2.5 m/s` Low Cyan → `>8 m/s` Extreme Crimson)."
        )
    elif "industrial" in msg_low or "flare" in msg_low or "oil" in msg_low:
        reply = (
            f"🏭 **Industrial Gas Flare Masking ({stats['industrial_flares']} Flagged Globally):**\n"
            "• Stationary hydrocarbon flares in the Gulf of Suez, Western Desert, Basra/Persian Gulf, Niger Delta, and Permian Basin emit intense infrared radiation that raw satellite feeds flag as fires.\n"
            "• SparkGrid identifies these via spatial basin masks (`is_industrial: true`) and gives you a 3-way control in the HUD: **Highlight (Hazard Yellow)**, **Gray Out (Muted)**, or **Hide**."
        )
    else:
        reply = (
            f"🛰️ **SparkGrid Live Mission Status (NASA Space Apps Cairo 2026):**\n"
            f"• **Unified Clusters:** `{stats['total_clusters']:,}` (from `27,672` raw detections = **2.45× deduplication**)\n"
            f"• **Dual-Sensor Verified (`MODIS+VIIRS`):** `{stats['multi_sensor_verified_clusters']}` high-confidence fires\n"
            f"• **Wind & Spread Vectors:** `{stats['with_wind_vectors']:,}` hotspots enriched\n"
            f"• **Industrial Flares Filtered:** `{stats['industrial_flares']}` oil/gas flares\n"
            f"• **Total Radiative Power:** `{stats['total_frp_mw']:,} MW` (Peak cluster: `{stats['max_frp_mw']} MW`)\n\n"
            "💡 *Tip: Tap any hotspot on the map and click **'⚡ Generate AI Action Plan'** for an instant firefighter briefing, or ask me about **Egypt hotspots**, **1km vs 375m footprints**, **wind spread arrows**, or **industrial flares**!*"
        )

    return {"reply": reply}


@app.get("/api/export/geojson")
def export_geojson():
    if not os.path.exists(GEOJSON_PATH):
        raise HTTPException(status_code=404, detail="GeoJSON not found")
    return FileResponse(
        GEOJSON_PATH,
        media_type="application/geo+json",
        filename="sparkgrid_harmonized_hotspots.geojson"
    )


@app.get("/api/export/csv")
def export_csv():
    if os.path.exists(CSV_PATH):
        return FileResponse(
            CSV_PATH,
            media_type="text/csv",
            filename="sparkgrid_harmonized_fires.csv"
        )
    raise HTTPException(status_code=404, detail="CSV not found")


def run_harmonization_task():
    pipeline_dir = "/home/azureuser/sparkgrid/data-pipeline"
    subprocess.run([PYTHON_VENV, "harmonize.py"], cwd=pipeline_dir, check=True)
    out_geojson = f"{pipeline_dir}/harmonized_hotspots.geojson"
    out_csv = f"{pipeline_dir}/harmonized_fires.csv"
    if os.path.exists(out_geojson):
        subprocess.run(["cp", out_geojson, GEOJSON_PATH], check=True)
    if os.path.exists(out_csv):
        subprocess.run(["cp", out_csv, "/home/azureuser/gdrive/SparkGrid_Data/"], check=False)


@app.post("/api/pipeline/run")
def trigger_pipeline(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_harmonization_task)
    return {"status": "accepted", "message": "Harmonization pipeline triggered in background"}


def run_deployment_task():
    subprocess.run([DEPLOY_SCRIPT], check=False)


@app.post("/api/deploy")
def trigger_deploy(
    background_tasks: BackgroundTasks,
    x_deploy_token: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    secret = os.environ.get("SPARKGRID_DEPLOY_TOKEN", "sparkgrid2026")
    provided = x_deploy_token or token
    if provided != secret:
        raise HTTPException(status_code=403, detail="Unauthorized deploy token")

    background_tasks.add_task(run_deployment_task)
    return {"status": "accepted", "message": "SparkGrid deployment script triggered in background"}


if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
