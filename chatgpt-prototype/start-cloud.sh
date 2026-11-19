#!/bin/bash
set -euo pipefail
: "${CAMPUS_SUPABASE_URL:?}" "${CAMPUS_SUPABASE_SECRET:?}" "${CAMPUS_USER_ID:?}"
: "${CAMPUS_NOTION_DATA_SOURCE:?}" "${CONTROL_PLANE_API_KEY:?}" "${CONTROL_PLANE_TUNNEL_ID:?}"
export PORT=8788 CAMPUS_STATE_DIR=/var/data/campus CAMPUS_NOTION_CREDENTIALS=/var/data/notion-credentials.json
umask 077
if [[ ! -s "$CAMPUS_NOTION_CREDENTIALS" ]]; then
  install -m 600 /etc/secrets/notion-credentials.json "$CAMPUS_NOTION_CREDENTIALS"
fi
node /app/chatgpt-prototype/server.mjs &
server=$!
tunnel=
trap 'kill "$server" ${tunnel:+"$tunnel"} 2>/dev/null || true; wait || true' EXIT
trap 'exit 143' TERM INT
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:8788/ >/dev/null 2>&1; then break; fi
  kill -0 "$server"
  sleep 1
done
curl -fsS http://127.0.0.1:8788/ >/dev/null
tunnel-client-runtime run --control-plane.api-key env:CONTROL_PLANE_API_KEY \
  --mcp.server-url http://127.0.0.1:8788/mcp &
tunnel=$!
wait -n "$server" "$tunnel"
exit 1
