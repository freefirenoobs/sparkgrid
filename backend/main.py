import json
import os
import subprocess
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(
    title="SparkGrid API - NASA MODIS & VIIRS Harmonization Engine",
    description="Spatio-Temporal Harmonization of Satellite Active Fire Hotspots (NASA Space Apps Cairo 2026)",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEOJSON_PATH = "/home/azureuser/sparkgrid/data/harmonized_hotspots.geojson"
PIPELINE_SCRIPT = "/home/azureuser/sparkgrid/data-pipeline/harmonize.py"
PYTHON_VENV = "/home/azureuser/sparkgrid/venv/bin/python"
FRONTEND_DIST = "/home/azureuser/sparkgrid/frontend/dist"
DEPLOY_SCRIPT = "/home/azureuser/sparkgrid/deploy.sh"

_cached_data = None
_last_mtime = 0

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

@app.get("/api/health")
def health():
    data_exists = os.path.exists(GEOJSON_PATH)
    return {
        "status": "healthy",
        "dataset_available": data_exists,
        "dataset_path": GEOJSON_PATH
    }

@app.get("/api/hotspots")
def get_hotspots(
    min_frp: float = Query(0.0, description="Minimum Total Fire Radiative Power (MW)"),
    sensor_type: str = Query("all", description="Filter by sensor type: all, multi_sensor, viirs_only, modis_only, industrial, vegetation"),
    has_wind: Optional[bool] = Query(None, description="Filter for points with wind spread vectors"),
    limit: Optional[int] = Query(5000, description="Max number of features to return")
):
    raw_data = get_geojson_data()
    features = raw_data.get("features", [])
    
    filtered = []
    for f in features:
        props = f.get("properties", {})
        frp = float(props.get("total_frp_mw") or props.get("frp_mw") or 0.0)
        if frp < min_frp:
            continue
            
        is_multi = props.get("is_multi_sensor", False)
        instrument = props.get("instrument", "")
        sensors = props.get("sensors", [instrument] if instrument else [])
        is_ind = str(props.get("is_industrial", "")).lower() == "true"
        
        if sensor_type == "multi_sensor" and not is_multi:
            continue
        elif sensor_type == "viirs_only" and (is_multi or (instrument != "VIIRS" and "VIIRS" not in sensors)):
            continue
        elif sensor_type == "modis_only" and (is_multi or (instrument != "MODIS" and "MODIS" not in sensors)):
            continue
        elif sensor_type == "industrial" and not is_ind:
            continue
        elif sensor_type == "vegetation" and is_ind:
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
        "metadata": {
            **raw_data.get("metadata", {}),
            "returned_features": len(filtered),
            "filters_applied": {
                "min_frp": min_frp,
                "sensor_type": sensor_type,
                "has_wind": has_wind,
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
    
    multi_sensor = sum(1 for f in features if f["properties"].get("is_multi_sensor"))
    viirs_count = sum(1 for f in features if f["properties"].get("instrument") == "VIIRS" or "VIIRS" in f["properties"].get("sensors", []))
    modis_count = sum(1 for f in features if f["properties"].get("instrument") == "MODIS" or "MODIS" in f["properties"].get("sensors", []))
    with_wind = sum(1 for f in features if f["properties"].get("spread_heading_deg") is not None)
    industrial_count = sum(1 for f in features if str(f["properties"].get("is_industrial", "")).lower() == "true")
    
    total_frp = sum(float(f["properties"].get("total_frp_mw") or f["properties"].get("frp_mw") or 0.0) for f in features)
    max_frp = max((float(f["properties"].get("total_frp_mw") or f["properties"].get("frp_mw") or 0.0) for f in features), default=0.0)
    
    return {
        "total_clusters": len(features),
        "multi_sensor_verified_clusters": multi_sensor,
        "viirs_only_clusters": viirs_count,
        "modis_only_clusters": modis_count,
        "with_wind_vectors": with_wind,
        "industrial_flares": industrial_count,
        "total_frp_mw": round(total_frp, 2),
        "mean_frp_mw": round(total_frp / len(features), 2) if features else 0.0,
        "max_frp_mw": round(max_frp, 2),
        "metadata": raw_data.get("metadata", {})
    }

def run_harmonization_task():
    pipeline_dir = "/home/azureuser/sparkgrid/data-pipeline"
    subprocess.run([PYTHON_VENV, "harmonize.py"], cwd=pipeline_dir, check=True)
    # Copy outputs
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
def trigger_deploy(background_tasks: BackgroundTasks, x_deploy_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    secret = os.environ.get("SPARKGRID_DEPLOY_TOKEN", "sparkgrid2026")
    provided = x_deploy_token or token
    if provided != secret:
        raise HTTPException(status_code=403, detail="Unauthorized deploy token")
    
    background_tasks.add_task(run_deployment_task)
    return {"status": "accepted", "message": "SparkGrid deployment script triggered in background"}

# Mount frontend build at /
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")