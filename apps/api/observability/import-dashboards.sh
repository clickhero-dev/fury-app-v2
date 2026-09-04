#!/usr/bin/env bash
# Importa os dashboards as-code (apps/api/observability/dashboards/*.json)
# para o Grafana LGTM via HTTP API. Idempotente (overwrite por UID).
#
# Uso:
#   GRAFANA_API_TOKEN=<service account token> ./import-dashboards.sh
#   # opcional: GRAFANA_URL=https://clickhero-grafana-otel-lgtm.u7pe19.easypanel.host
set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-https://clickhero-grafana-otel-lgtm.u7pe19.easypanel.host}"
GRAFANA_API_TOKEN="${GRAFANA_API_TOKEN:?Defina GRAFANA_API_TOKEN (service account do Grafana)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dashboards"

for f in "$DIR"/*.json; do
  name="$(basename "$f")"
  payload=$(python3 - "$f" <<'PY'
import json, sys
with open(sys.argv[1]) as fh:
    d = json.load(fh)
print(json.dumps({"dashboard": d, "overwrite": True, "folderUid": ""}))
PY
)
  echo "→ Importando $name"
  curl -s -X POST "$GRAFANA_URL/api/dashboards/db" \
    -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload"
  echo ""
done

echo "✅ Feito. Confira em $GRAFANA_URL/dashboards"