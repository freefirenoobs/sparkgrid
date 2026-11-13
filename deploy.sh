#!/usr/bin/env bash
set -e

export HOME="/home/azureuser"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SPARKGRID_DIR="/home/azureuser/sparkgrid"
LOG_FILE="$SPARKGRID_DIR/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$SPARKGRID_DIR"

# Check if git remote is set
if ! git remote get-url origin >/dev/null 2>&1; then
    log "[SKIP] No git remote 'origin' configured yet."
    exit 0
fi

log "Fetching origin main..."
git fetch origin main >/dev/null 2>&1 || { log "[ERROR] git fetch origin main failed"; exit 1; }

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ] && [ "$1" != "--force" ]; then
    log "[INFO] Already up-to-date ($LOCAL_HASH). Nothing to deploy."
    exit 0
fi

log "[DEPLOY] Updating: $LOCAL_HASH -> $REMOTE_HASH"

# Reset to latest remote main
git reset --hard origin/main

# Backend updates
if [ -f "backend/requirements.txt" ]; then
    log "[BACKEND] Installing Python dependencies..."
    "$SPARKGRID_DIR/venv/bin/pip" install -q -r backend/requirements.txt || true
fi

# Frontend build
log "[FRONTEND] Building React bundle..."
cd "$SPARKGRID_DIR/frontend"
npm install --silent >/dev/null 2>&1 || true
npm run build
cd "$SPARKGRID_DIR"

# Restart systemd services
log "[SYSTEMD] Restarting sparkgrid services..."
sudo systemctl restart sparkgrid-backend.service sparkgrid-frontend.service

NEW_HASH=$(git rev-parse HEAD)
log "[SUCCESS] SparkGrid deployed successfully at commit $NEW_HASH."