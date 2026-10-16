#!/usr/bin/env bash
# 서버(VM)에서 root로 실행하는 배포 단계입니다. deploy.sh가 묶음을 /opt/wolgyeham에 푼 뒤 부릅니다.
#   bash /opt/wolgyeham/server.sh <API 이미지> <SITE_HOST> <프로젝트> <리전>
# 1) Secret Manager에서 api.env와 DB 비밀번호를 받아 .env·api.env(600)를 만들고 2) 예전 로컬 사진을 GCS로 한 번 옮기고
# 3) 마이그레이션·시연 시드 뒤 compose를 올리고 4) DB 백업 타이머를 설치합니다. 비밀값은 출력하지 않습니다.
# gcloud는 VM 서비스 계정(메타데이터 서버)으로 인증합니다. 필요한 권한은 setup.sh가 줍니다.
set -euo pipefail
IMAGE="$1"
SITE_HOST="$2"
PROJECT="$3"
REGION="$4"
DIR=/opt/wolgyeham
cd "$DIR"

bash "$DIR/startup.sh" >/dev/null

# 비밀은 임시 파일(600)에 받은 뒤 바꿔 넣어, 받다 실패해도 이전 파일이 남습니다.
umask 077
gcloud secrets versions access latest --secret wolgyeham-api-env --project "$PROJECT" --out-file api.env.new
[ -s api.env.new ] || { echo "wolgyeham-api-env가 비었습니다" >&2; exit 1; }
mv api.env.new api.env
password="$(gcloud secrets versions access latest --secret wolgyeham-db-password --project "$PROJECT")"
[ -n "$password" ] || { echo "wolgyeham-db-password가 비었습니다" >&2; exit 1; }
printf 'DB_PASSWORD=%s\nAPI_IMAGE=%s\nSITE_HOST=%s\n' "$password" "$IMAGE" "$SITE_HOST" >.env.new
unset password
mv .env.new .env
chmod 600 .env api.env
umask 022

gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev" >/dev/null
docker compose pull -q
docker compose up -d db

# 예전 배포(PHOTO_STORE=local)의 사진 볼륨이 있으면 한 번만 GCS(gcp/)로 옮깁니다. 볼륨은 지우지 않습니다.
photos="$(docker volume inspect wolgyeham_photos --format '{{.Mountpoint}}' 2>/dev/null || true)"
if [ -n "$photos" ] && [ -d "$photos/buildings" ] && [ ! -f "$DIR/.photos-migrated" ]; then
  gcloud storage rsync --recursive --quiet "$photos/buildings" "gs://$PROJECT-photos/gcp/buildings"
  touch "$DIR/.photos-migrated"
  echo "local photos copied to gs://$PROJECT-photos/gcp/"
fi

docker compose run --rm api node migrate.mjs
docker compose run --rm api node seed.mjs
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

install -m 644 "$DIR/systemd/wolgyeham-backup.service" "$DIR/systemd/wolgyeham-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wolgyeham-backup.timer >/dev/null 2>&1
echo "backup timer: $(systemctl show wolgyeham-backup.timer --property=NextElapseUSecRealtime --value)"
