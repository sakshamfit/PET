#!/usr/bin/env bash
# Publish the PET server on your domain through a free Cloudflare Tunnel.
#
#   sudo ./scripts/deploy/linux/cloudflare-tunnel.sh --token <TOKEN>          # dashboard-managed (recommended)
#   sudo ./scripts/deploy/linux/cloudflare-tunnel.sh --domain app.example.org # CLI-managed, fully scripted
#   ./scripts/deploy/linux/cloudflare-tunnel.sh --check --domain app.example.org
#
# Prerequisites: the domain is added to Cloudflare and its nameservers point at
# Cloudflare (free plan is enough). No port forwarding, no public IP needed.
set -euo pipefail

PORT="${PET_PORT:-8080}"
TUNNEL_NAME="${PET_TUNNEL_NAME:-pet-office}"
CLOUDFLARED_DIR="${CLOUDFLARED_DIR:-/etc/cloudflared}"
MODE=""
DOMAIN=""
TOKEN=""
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; MODE="token"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; MODE="domain"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

if [ "$CHECK_ONLY" = "1" ]; then
  bold "Tunnel status"
  cloudflared tunnel list || true
  systemctl status cloudflared --no-pager 2>/dev/null | head -8 || true
  echo
  bold "Origin (this machine)"
  curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null | head -c 400 || echo "  nothing on 127.0.0.1:$PORT — start the PET server first"
  echo
  if [ -n "$DOMAIN" ]; then
    bold "Public"
    echo "  https://$DOMAIN/health"
    curl -fsS "https://$DOMAIN/health" 2>/dev/null | head -c 400 || echo "  not reachable yet"
    echo
  fi
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 77; fi

# ── install cloudflared from Cloudflare's repository ──────────────────────
if ! command -v cloudflared >/dev/null 2>&1; then
  bold "Installing cloudflared"
  if command -v apt-get >/dev/null 2>&1; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      > /etc/apt/sources.list.d/cloudflared.list
    apt-get update && apt-get install -y cloudflared
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    curl -fsSL https://pkg.cloudflare.com/cloudflared.repo | tee /etc/yum.repos.d/cloudflared.repo >/dev/null
    (command -v dnf >/dev/null 2>&1 && dnf install -y cloudflared) || yum install -y cloudflared
  else
    echo "Unsupported distro — download cloudflared manually from" >&2
    echo "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/" >&2
    exit 1
  fi
fi
cloudflared --version

bold "Origin check"
if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "  PET server is answering on 127.0.0.1:$PORT ✅"
else
  echo "  ⚠️  nothing on 127.0.0.1:$PORT — install the service first:"
  echo "      sudo ./scripts/deploy/linux/install-server-service.sh"
fi

# ── mode A: dashboard-managed tunnel via token ────────────────────────────
if [ "$MODE" = "token" ]; then
  [ -n "$TOKEN" ] || { echo "--token requires the tunnel token from the dashboard." >&2; exit 64; }
  bold "Installing the connector service (dashboard-managed)"
  cloudflared service uninstall >/dev/null 2>&1 || true
  cloudflared service install "$TOKEN"
  systemctl enable --now cloudflared
  sleep 3
  systemctl status cloudflared --no-pager | head -8
  echo
  echo "✅ Connector running. Add the public hostname in the dashboard:"
  echo "   Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames → Add"
  echo "     Service: http://localhost:$PORT"
  exit 0
fi

[ -n "$DOMAIN" ] || { echo "Pass --token <TOKEN> or --domain app.example.org." >&2; exit 64; }

# ── mode B: locally-managed tunnel, fully scripted ────────────────────────
bold "Step 1/4 — Cloudflare sign-in (choose the zone that owns $DOMAIN)"
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  cloudflared tunnel login
else
  echo "  cert.pem already present — skipping"
fi

bold "Step 2/4 — create the tunnel"
if ! cloudflared tunnel list --output json 2>/dev/null | grep -q "\"name\":\"$TUNNEL_NAME\""; then
  cloudflared tunnel create "$TUNNEL_NAME" || true
fi
TUNNEL_ID="$(cloudflared tunnel list --output json | python3 -c "
import json,sys
for t in json.load(sys.stdin):
    if t.get('name') == '$TUNNEL_NAME': print(t['id']); break
")"
[ -n "$TUNNEL_ID" ] || { echo "could not determine the tunnel id" >&2; exit 1; }
echo "  tunnel id: $TUNNEL_ID"

bold "Step 3/4 — write $CLOUDFLARED_DIR/config.yml"
mkdir -p "$CLOUDFLARED_DIR"
CREDS_FILE="$HOME/.cloudflared/$TUNNEL_ID.json"
cat > "$CLOUDFLARED_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDS_FILE

ingress:
  - hostname: $DOMAIN
    service: http://127.0.0.1:$PORT
    originRequest:
      connectTimeout: 30s
  - service: http_status:404

loglevel: info
EOF
cloudflared tunnel ingress validate

bold "Step 4/4 — route DNS and install the service"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" || {
  echo "⚠️  DNS route failed (a record for $DOMAIN may already exist)."
  echo "    Delete the conflicting record in the Cloudflare dashboard and re-run."
}
cloudflared service install
systemctl enable --now cloudflared
sleep 3
systemctl status cloudflared --no-pager | head -8

echo
echo "✅ https://$DOMAIN now reaches this machine's PET server."
echo "   Verify: sudo ./scripts/deploy/linux/install-server-service.sh --status"
echo "   Optional (free): protect <domain>/admin* with Cloudflare Access."
