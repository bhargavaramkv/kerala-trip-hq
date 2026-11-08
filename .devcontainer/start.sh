#!/usr/bin/env bash
# Starts Kerala Trip HQ inside this Codespace and makes its port public. Needs no secrets or settings.
export PORT=8080 DATA_DIR=/workspaces/trip-data
mkdir -p "$DATA_DIR"
export BASE_URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
pkill -f "node server.js" 2>/dev/null
nohup node server.js > "$DATA_DIR/server.log" 2>&1 &
sleep 3
gh codespace ports visibility 8080:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || echo "NOTE: set port 8080 to Public in the Ports tab"
echo; echo "=========== KERALA TRIP HQ ==========="; grep -E "ADMINISTRATOR|admin/|Invite link" "$DATA_DIR/server.log"; echo "======================================"
