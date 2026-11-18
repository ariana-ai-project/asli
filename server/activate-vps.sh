#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo" >&2
  exit 1
fi

systemctl stop asli
cp -a /home/user/asli/. /opt/asli/
chown -R user:user /opt/asli
install -m 644 /opt/asli/server/asli.service /etc/systemd/system/asli.service
install -m 644 /opt/asli/server/Caddyfile /etc/caddy/Caddyfile

if [[ ! -f /home/user/ariana-data/asli-final.sqlite ]]; then
  echo "Final database is missing" >&2
  systemctl start asli
  exit 1
fi
cp -a /home/user/ariana-data/asli-final.sqlite /var/lib/asli/asli-next.sqlite
if [[ -f /var/lib/asli/asli.sqlite ]]; then
  mv /var/lib/asli/asli.sqlite "/var/lib/asli/asli-before-final-$(date +%Y%m%d-%H%M%S).sqlite"
fi
rm -f /var/lib/asli/asli.sqlite-wal /var/lib/asli/asli.sqlite-shm
mv /var/lib/asli/asli-next.sqlite /var/lib/asli/asli.sqlite
chown user:user /var/lib/asli/asli.sqlite
printf 'SCHEDULER=on\n' > /etc/asli/runtime.conf
systemctl daemon-reload
systemctl restart caddy
systemctl start asli
sleep 3
systemctl is-active asli caddy
curl -fsS http://127.0.0.1:8787/tamin-poshtibani/api/health
