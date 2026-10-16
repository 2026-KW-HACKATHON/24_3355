#!/usr/bin/env bash
# VM이 부팅할 때 실행합니다(메타데이터 startup-script). 배포 때 server.sh도 먼저 부릅니다. 여러 번 실행해도 됩니다.
# Docker와 compose 플러그인, gcloud(비밀·백업에 씀, Debian GCE 이미지에는 보통 들어 있음), 1GB 스왑을 준비합니다.
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi
if ! command -v gcloud >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y apt-transport-https ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor --yes -o /etc/apt/keyrings/cloud.google.gpg
  echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  apt-get update -y
  apt-get install -y google-cloud-cli
fi
# e2-micro(메모리 1GB)에서 빌드 없이 컨테이너 세 개만 돌리지만 여유를 위해 스왑을 둡니다.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
mkdir -p /opt/wolgyeham/web
touch /opt/wolgyeham/.startup-done
