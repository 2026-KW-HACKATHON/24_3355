#!/usr/bin/env bash
# EC2(Amazon Linux 2023) 처음 만들 때 사용자 데이터로 한 번 실행합니다.
# Docker·compose 설치, 스왑 1GB, 작업 폴더, 백업 타이머를 준비합니다.
# 실행 뒤 관리자가 /opt/wolgyeham/server.env를 만들어야 첫 배포가 됩니다(docs/aws-setup.md).
set -euo pipefail

dnf install -y docker
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/wolgyeham/env
chmod 700 /opt/wolgyeham/env

cat > /etc/systemd/system/wolgyeham-backup.service <<'UNIT'
[Unit]
Description=Wolgyeham database backup to S3
After=docker.service

[Service]
Type=oneshot
ExecStart=/opt/wolgyeham/backup.sh
UNIT

cat > /etc/systemd/system/wolgyeham-backup.timer <<'UNIT'
[Unit]
Description=Daily Wolgyeham database backup

[Timer]
OnCalendar=*-*-* 19:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now wolgyeham-backup.timer
