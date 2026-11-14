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
    version="2.2.0"
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
        "version": "2.2.0"
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

    # God's Eye View Navigation & Voice Explanation Engine
    if any(k in msg_low for k in ["egypt", "nile", "beni suef", "cairo", "delta"]):
        camera_action = {
            "center": [29.0172, 31.2038],
            "zoom": 14,
            "basemap": "satellite",
            "showFootprints": True,
            "showSpreadArrows": True,
            "showWindHeat": False,
            "industrialMode": "HIGHLIGHT",
            "cluster_id": "SG-EG-0010",
            "location_title": "🇪🇬 Beni Suef, Nile Valley, Egypt (Zoom 14)"
        }
        speech = (
            "Flying to the Nile Valley in Beni Suef, Egypt at Zoom 14. "
            "Notice how the large orange 1,000 meter MODIS square overlaps with the tight 375 meter VIIRS squares right beside the agricultural fields. "
            "SparkGrid fuses these overlapping passes into a single Dual-Verified cluster with 98 percent confidence, showing a southward fire spread driven by 4.6 meter per second winds."
        )
        reply = (
            "👁️ **God's Eye Navigation ➔ Beni Suef, Nile Valley, Egypt (`[29.0172°N, 31.2038°E]`, Zoom 14)**\n\n"
            "• **What You Are Seeing:** We switched to high-resolution **Satellite Imagery** and enabled **1km vs 375m Footprint Polygons**.\n"
            "• **MODIS (`SG-EG-0003`):** The large orange square ($1000\\text{ m} \\times 1000\\text{ m} = 1.0\\text{ km}^2$) averages thermal energy across the entire square kilometer.\n"
            "• **VIIRS (`SG-EG-0010` & `SG-EG-0011`):** The tight crimson and violet squares ($375\\text{ m} \\times 375\\text{ m} = 0.14\\text{ km}^2$) pinpoint the exact burning field **7.1× more tightly**, with directional arrows pointing toward $150^\\circ$ SSE!"
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if any(k in msg_low for k in ["suez", "sinai", "sokhna", "industrial", "flare", "oil", "refinery", "basra"]):
        is_basra = "basra" in msg_low or "persian" in msg_low or "iraq" in msg_low
        center = [30.70, 47.55] if is_basra else [29.6915, 32.3225]
        zoom = 10 if is_basra else 14
        loc_title = "🛢️ Basra Oil Fields, Persian Gulf" if is_basra else "🏭 Gulf of Suez / Ain Sokhna, Egypt"
        camera_action = {
            "center": center,
            "zoom": zoom,
            "basemap": "satellite",
            "showFootprints": True,
            "showSpreadArrows": True,
            "showWindHeat": False,
            "industrialMode": "HIGHLIGHT",
            "cluster_id": "SG-EG-0002" if not is_basra else None,
            "location_title": loc_title
        }
        speech = (
            f"Navigating to {loc_title}. "
            f"Satellites detect intense infrared radiation from stationary oil and gas flares, often causing false wildfire alarms. "
            f"SparkGrid flags {stats['industrial_flares']} industrial flares globally in hazard yellow, and lets emergency dispatchers gray them out or hide them with one click."
        )
        reply = (
            f"👁️ **God's Eye Navigation ➔ {loc_title} (Zoom {zoom})**\n\n"
            f"• **Industrial Thermal Noise Solved:** Stationary petroleum flares emit $300\\text{{ K}} - 400\\text{{ K}}$ mid-infrared spikes that raw satellite feeds misclassify as wildfires.\n"
            f"• **SparkGrid Basin Masking:** We automatically tag **{stats['industrial_flares']} persistent oil/gas flares** (`is_industrial = true`) across the Gulf of Suez, Western Desert, Basra, and Niger Delta.\n"
            "• **Try It:** Toggle **'🏭 Gray Out Industrial Flares'** in the HUD to mute these yellow markers so real wildfires stand out immediately!"
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if any(k in msg_low for k in ["megafire", "biggest", "largest", "dual", "multi-sensor", "africa", "chad", "sudan", "2006"]):
        camera_action = {
            "center": [12.315, 20.492],
            "zoom": 13,
            "basemap": "dark",
            "showFootprints": True,
            "showSpreadArrows": True,
            "showWindHeat": False,
            "industrialMode": "HIGHLIGHT",
            "location_title": "🔥 2,006 MW Dual-Sensor Verified Megafire (Zoom 13)"
        }
        speech = (
            "Taking you to Central Africa at Zoom 13 to inspect a massive 2,006 Megawatt Dual-Sensor Verified wildfire. "
            "Here, a dashed 1,000 meter MODIS square wraps around a nested 375 meter violet VIIRS core, confirming an active savanna fire front advancing northward at 359 degrees."
        )
        reply = (
            "👁️ **God's Eye Navigation ➔ 2,006 MW Dual-Verified Megafire (`[12.315°N, 20.492°E]`, Zoom 13)**\n\n"
            "• **Nested Multi-Sensor Verification:** Notice the **outer dashed 1000m MODIS square** containing the **inner 375m violet VIIRS core** (`MODIS+VIIRS`).\n"
            "• **Why It Matters:** When both NASA's Terra/Aqua (MODIS) and Suomi-NPP/NOAA-20 (VIIRS) detect the same blaze within a 120-minute orbital window, Bayesian fusion elevates confidence above **98%** and anchors the centroid to the highest radiative power ($2,006\\text{ MW}$)."
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if any(k in msg_low for k in ["wind", "heat", "speed", "storm", "arrow", "spread", "fast"]):
        camera_action = {
            "center": [12.315, 20.492],
            "zoom": 7,
            "basemap": "dark",
            "showFootprints": False,
            "showSpreadArrows": True,
            "showWindHeat": True,
            "industrialMode": "GRAY_OUT",
            "location_title": "🌪️ Wind Speed Thermal Risk & Spread Vectors (Zoom 7)"
        }
        speech = (
            "Activating the Wind Speed Heat Layer and Fire-Spread Direction Arrows across the regional burn belt. "
            "Hotspot size and thermal color now reflect live 10-meter wind velocity from Open-Meteo, while rotated arrows point directly along the downwind fire spread azimuth."
        )
        reply = (
            f"👁️ **God's Eye Navigation ➔ Wind Speed Heat Layer Activated ({stats['with_wind_vectors']:,} Wind-Enriched Clusters)**\n\n"
            "• **Dynamic Thermal Sizing (`wind_speed_mps`):** Marker radius and halo glow now scale with wind speed (`<2.5 m/s` Low Cyan ➔ `2.5–5 m/s` Moderate Yellow ➔ `5–8 m/s` High Orange ➔ `>8 m/s` Extreme Crimson).\n"
            "• **Spread Azimuth (`spread_heading_deg`):** Every arrow is rotated to $\\theta_{\\text{spread}} = (\\theta_{\\text{wind}} + 180^\\circ) \\pmod{360^\\circ}$, showing first responders which settlements lie directly downwind."
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if any(k in msg_low for k in ["1km", "375m", "footprint", "modis", "viirs", "square", "polygon", "resolution"]):
        camera_action = {
            "center": [29.0172, 31.2038],
            "zoom": 14,
            "basemap": "satellite",
            "showFootprints": True,
            "showSpreadArrows": True,
            "showWindHeat": False,
            "industrialMode": "HIGHLIGHT",
            "cluster_id": "SG-EG-0010",
            "location_title": "📐 1000m MODIS vs 375m VIIRS Footprint Comparison (Zoom 14)"
        }
        speech = (
            "Zooming in to level 14 to compare sensor footprints at true ground scale. "
            "A single 1,000 meter by 1,000 meter MODIS pixel covers 1.0 square kilometer, whereas a 375 meter by 375 meter VIIRS pixel covers just 0.14 square kilometers—making VIIRS 7.1 times sharper in area."
        )
        reply = (
            "👁️ **God's Eye View ➔ 1000m MODIS vs 375m VIIRS Pixel Footprints (`Zoom 14`)**\n\n"
            "• **MODIS (Terra/Aqua):** $1000\\text{ m} \\times 1000\\text{ m} = 1.00\\text{ km}^2$ (Orange squares).\n"
            "• **VIIRS (S-NPP/NOAA-20/21):** $375\\text{ m} \\times 375\\text{ m} = 0.14\\text{ km}^2$ (Crimson squares — **7.1× tighter area**).\n"
            f"• **Harmonization Result:** Across our global run, Spatiotemporal Haversine DBSCAN ($\epsilon=1.5\\text{{ km}}$) compressed **27,672 raw points into {stats['total_clusters']:,} unified clusters (2.45× deduplication)** and verified **{stats['multi_sensor_verified_clusters']} Dual-Sensor fires**."
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if any(k in msg_low for k in ["world", "global", "planet", "overview", "reset", "all"]):
        camera_action = {
            "center": [22.0, 25.0],
            "zoom": 3,
            "basemap": "dark",
            "showFootprints": False,
            "showSpreadArrows": True,
            "showWindHeat": False,
            "industrialMode": "HIGHLIGHT",
            "location_title": "🌍 Global Planetary View (11,505 Harmonized Clusters)"
        }
        speech = (
            f"Pulling back to Planetary God's Eye View at Zoom 3. "
            f"SparkGrid is currently tracking {stats['total_clusters']} harmonized wildfire clusters worldwide, compressed from 27,672 raw NASA satellite detections—a 2.45 times reduction in emergency dispatch clutter."
        )
        reply = (
            f"👁️ **God's Eye Navigation ➔ Planetary Overview (`Zoom 3`)**\n\n"
            f"• **Total Harmonized Clusters:** `{stats['total_clusters']:,}` (from `27,672` raw detections = **2.45× compression**)\n"
            f"• **Dual-Sensor Verified (`MODIS+VIIRS`):** `{stats['multi_sensor_verified_clusters']}`\n"
            f"• **Wind Vector Coverage:** `{stats['with_wind_vectors']:,}` clusters enriched via Open-Meteo\n"
            f"• **Industrial Flares Masked:** `{stats['industrial_flares']}`\n"
            f"• **Total Radiative Power:** `{stats['total_frp_mw']:,} MW`"
        )
        return {"reply": reply, "speech": speech, "camera_action": camera_action}

    if sel:
        cid = sel.get("cluster_id", "SG-SELECTED")
        try:
            b = generate_cluster_briefing(cid)
            lat = float(sel.get("latitude", 29.0172))
            lon = float(sel.get("longitude", 31.2038))
            camera_action = {
                "center": [lat, lon],
                "zoom": 14,
                "basemap": "satellite",
                "showFootprints": True,
                "showSpreadArrows": True,
                "cluster_id": cid,
                "location_title": f"🎯 Target Cluster {cid} ({lat:.3f}°N, {lon:.3f}°E)"
            }
            speech = f"Focusing on cluster {cid}. {b['action_plan'][0]} {b['action_plan'][1]}"
            return {"reply": b["summary"], "speech": speech, "briefing": b, "camera_action": camera_action}
        except Exception:
            pass

    speech = (
        f"SparkGrid God's Eye AI is online. We are tracking {stats['total_clusters']} harmonized clusters and {stats['multi_sensor_verified_clusters']} dual-sensor verified wildfires. "
        "Ask me to take you to Egypt, the Gulf of Suez flares, the 2,006 Megawatt megafire, or ask me to activate the Wind Speed Heat Layer!"
    )
    reply = (
        f"👁️ **SparkGrid God's Eye AI Commander Online:**\n"
        f"• **Unified Clusters:** `{stats['total_clusters']:,}` (**2.45× deduplication** from 27,672 raw points)\n"
        f"• **Dual-Sensor Verified (`MODIS+VIIRS`):** `{stats['multi_sensor_verified_clusters']}`\n\n"
        "🎙️ **Try saying or clicking:**\n"
        "• *\"Take me to Egypt 1km vs 375m footprints\"*\n"
        "• *\"Show me the Gulf of Suez industrial flares\"*\n"
        "• *\"Fly to the biggest Dual-Sensor Megafire\"*\n"
        "• *\"Activate the Wind Speed Heat Layer\"*"
    )
    return {"reply": reply, "speech": speech}


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
