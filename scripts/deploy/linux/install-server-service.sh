#!/usr/bin/env bash
# PET server — install/update the Linux (or macOS) office/VPS deployment.
#
#   sudo ./scripts/deploy/linux/install-server-service.sh           # install + start
#   sudo ./scripts/deploy/linux/install-server-service.sh --update   # pull, build, restart
#   ./scripts/deploy/linux/install-server-service.sh --status        # what is live?
#
# Runs the server under systemd as an unprivileged user, serves the PET app at
# /app/, and rebuilds on every start (so a stale bundle cannot be served).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVICE_NAME="${PET_SERVICE_NAME:-pet}"
RUN_USER="${PET_USER:-pet}"
DATA_DIR="${PET_DATA_DIR:-/var/lib/pet}"
ENV_FILE="$REPO_DIR/.env.production"

MODE="install"
case "${1:-}" in
  --update) MODE="update" ;;
  --status) MODE="status" ;;
  --uninstall) MODE="uninstall" ;;
  --install|"") MODE="install" ;;
  *) echo "usage: $0 [--install|--update|--status|--uninstall]" >&2; exit 64 ;;
esac

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
note() { printf '  %s\n' "$1"; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 77; fi
}

status() {
  bold "PET server status"
  systemctl status "$SERVICE_NAME" --no-pager 2>/dev/null | head -12 || echo "  service not installed"
  echo
  bold "What is actually being served"
  node "$REPO_DIR/scripts/verify-live.mjs" || true
}

case "$MODE" in
  status) status; exit 0 ;;

  uninstall)
    need_root
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    echo "Removed $SERVICE_NAME (data in $DATA_DIR is untouched)."
    exit 0 ;;
esac

need_root

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE is missing."
  echo "   Copy .env.production.example → .env.production and fill it in first,"
  echo "   otherwise the server refuses to start in production mode."
  exit 78
fi

if [ "$MODE" = "update" ]; then
  bold "Pulling the latest code"
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" pull --ff-only
fi

bold "Installing dependencies"
( cd "$REPO_DIR" && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi )

bold "Building the current source"
( cd "$REPO_DIR" && npm run build && npm run check:build )

bold "Preparing data directories"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups" "$DATA_DIR/logs"
id -u "$RUN_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$RUN_USER"
chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR"
# The app only needs to read its own source; data lives outside the repo.
chown -R "$RUN_USER:$RUN_USER" "$REPO_DIR/server/public"

bold "Writing /etc/systemd/system/$SERVICE_NAME.service"
cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Purvanchal Education Trust platform (PET server)
Documentation=file://$REPO_DIR/docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
EnvironmentFile=$ENV_FILE
# start-pet.mjs rebuilds only when the bundle does not match the checkout,
# then execs the server in this same process (clean systemd lifecycle).
ExecStart=$(command -v node) $REPO_DIR/scripts/start-pet.mjs
Restart=always
RestartSec=3
TimeoutStopSec=20
# Hardening — the app writes only to its data dir.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR $REPO_DIR/server/public $REPO_DIR/logs

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "$REPO_DIR/logs"
chown "$RUN_USER:$RUN_USER" "$REPO_DIR/logs"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
sleep 5
status
