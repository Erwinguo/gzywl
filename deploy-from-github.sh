#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/gzywl}"
REPO_URL="${REPO_URL:-https://github.com/Erwinguo/gzywl.git}"
BRANCH="${BRANCH:-main}"

mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/data"
test -f "$APP_DIR/data/messages.json" || echo '[]' > "$APP_DIR/data/messages.json"
pm2 delete gzywl >/dev/null 2>&1 || true
cd "$APP_DIR"
ADMIN_USER="${ADMIN_USER:-admin}" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}" \
CAPTCHA_SECRET="${CAPTCHA_SECRET:?CAPTCHA_SECRET is required}" \
PORT="${PORT:-3000}" pm2 start server.js --name gzywl
pm2 save
systemctl restart nginx
echo "DEPLOY_FROM_GITHUB_OK"
