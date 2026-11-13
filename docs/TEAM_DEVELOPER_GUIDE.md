# 🛠️ SparkGrid — Team Developer & Onboarding Guide
> **Everything you need to clone, code, test, and deploy to SparkGrid.**

---

## 🔗 Quick Links
- **GitHub Repo:** [https://github.com/freefirenoobs/sparkgrid](https://github.com/freefirenoobs/sparkgrid)
- **Live App (Frontend):** [https://sparkgrid.masarat.app](https://sparkgrid.masarat.app)
- **API Swagger Docs:** [https://sparkgrid-api.masarat.app/docs](https://sparkgrid-api.masarat.app/docs)
- **Team AI Coding Hub (Open WebUI):** [https://sparkgrid-ai.masarat.app](https://sparkgrid-ai.masarat.app)

---

## 1. Getting Started (Clone & Setup)

```bash
# 1. Clone the repository
git clone https://github.com/freefirenoobs/sparkgrid.git
cd sparkgrid

# 2. Setup Backend (Python 3.12)
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# 3. Setup Frontend (Node 20+)
cd frontend
npm install
npm run dev  # Starts local dev server at http://localhost:5173
```

---

## 2. Continuous Deployment (CI/CD) Workflow

You do NOT need server access to deploy! The server runs an **automatic continuous deployment pipeline**:

1. **Pushing to `main`:**
   Whenever you push a commit or merge a PR to `main`:
   ```bash
   git add .
   git commit -m "feat: your new feature"
   git push origin main
   ```
   The compute server (`RemoteDesktop-VM`) automatically checks `origin/main` every 2 minutes. When it sees your new commit, it automatically pulls, updates dependencies, rebuilds the React app, and restarts the backend and frontend services!

2. **Instant Zero-Delay Webhook Deployment:**
   If you want your commit live in 5 seconds instead of waiting for the 2-minute cron, run this in your terminal or browser:
   ```bash
   curl -X POST "https://sparkgrid-api.masarat.app/api/deploy?token=sparkgrid2026"
   ```

---

## 3. Directory Responsibilities by Role

| Folder | Tech Stack | Role Owner & Mission |
| :--- | :--- | :--- |
| `/data-pipeline` | Python, Pandas, GeoPandas, Scikit-Learn | **Role 2 (Data Pipeline):** Enhance `harmonize.py`, add gas flare exclusion filtering, calculate fire spread vectors. |
| `/frontend` | React 18, Vite, Leaflet, CSS HUD | **Role 3 & 4 (Frontend Leads):** Add time-slider scrubber, sensor footprint polygons (1km vs 375m), GeoJSON download button. |
| `/backend` | Python, FastAPI, Uvicorn | **Role 5 (AI Tactical Briefings):** Implement Open-Meteo weather integration and AI incident response plans. |
| `/docs` | Markdown, Presentation, Slides | **Role 6 (NASA Pitch & Video):** Slide deck, video recording, submission answers. |

---

## 4. Google Drive Data Access
All raw and processed datasets are synchronized in real time to the team Google Drive under:
`SparkGrid_Data/`
- `MODIS_C6_1_Northern_and_Central_Africa_24h.csv`
- `J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv`
- `harmonized_hotspots.geojson`