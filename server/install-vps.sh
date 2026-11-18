#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash server/install-vps.sh" >&2
  exit 1
fi

APP_USER=user
APP_HOME=/home/user

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y caddy sqlite3

install -d -o "$APP_USER" -g "$APP_USER" /opt/asli /var/lib/asli
install -d -m 755 /etc/asli
cp -a "$APP_HOME/asli/." /opt/asli/
chown -R "$APP_USER:$APP_USER" /opt/asli /var/lib/asli

install -d -o root -g root -m 755 /opt/node-24
cp -a "$APP_HOME/.local/node-24/." /opt/node-24/
chown -R root:root /opt/node-24

if [[ ! -f "$APP_HOME/ariana-encryption.env" ]]; then
  /opt/node-24/bin/node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("/home/user/ariana-encryption.env", "CONFIG_ENCRYPTION_KEY=" + randomBytes(32).toString("hex") + "\n", { mode: 0o600 });'
  chown "$APP_USER:$APP_USER" "$APP_HOME/ariana-encryption.env"
  chmod 600 "$APP_HOME/ariana-encryption.env"
fi

install -m 644 /opt/asli/server/asli.service /etc/systemd/system/asli.service
install -m 644 /opt/asli/server/Caddyfile /etc/caddy/Caddyfile
if [[ ! -f /etc/asli/runtime.conf ]]; then
  printf 'SCHEDULER=off\n' > /etc/asli/runtime.conf
fi
chmod 644 /etc/asli/runtime.conf
if [[ ! -f /var/lib/asli/asli.sqlite ]]; then
  cp -a "$APP_HOME/ariana-data/asli-pre-migration.sqlite" /var/lib/asli/asli.sqlite
  chown "$APP_USER:$APP_USER" /var/lib/asli/asli.sqlite
fi

ufw --force allow 80/tcp
ufw --force allow 443/tcp
systemctl daemon-reload
systemctl enable asli caddy
systemctl restart asli caddy
systemd-analyze verify /etc/systemd/system/asli.service
systemctl is-active asli caddy
/opt/node-24/bin/node --version
caddy version
