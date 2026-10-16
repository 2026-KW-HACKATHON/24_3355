#!/usr/bin/env bash
# DB를 하루 한 번 GCS 백업 버킷에 올립니다(systemd wolgyeham-backup.timer, docs/gcp.md). 서버에서 root로 돕니다.
# pg_dump -Fc(사용자 지정 형식, 자체 압축)라 따로 gzip하지 않고 pg_restore로 바로 되돌립니다.
# 백업 버킷 권한은 새로 쓰기·읽기뿐이라 같은 날 두 번째 실행은 덮어쓰지 않고 건너뜁니다(14일 뒤 버킷 수명 주기로 지움).
set -euo pipefail
BUCKET="${BACKUP_BUCKET:-wolgyeham-kw2026-backups}"
cd /opt/wolgyeham
day="$(date -u +%F)"
dump="$(mktemp /var/tmp/wolgyeham-db.XXXXXX)"
trap 'rm -f "$dump"' EXIT
docker compose exec -T db pg_dump -U wolgyeham -d wolgyeham -Fc >"$dump"
# 빈 파일이나 형식이 틀린 덤프는 올리지 않습니다(-Fc 파일은 PGDMP로 시작).
[ "$(head -c 5 "$dump")" = "PGDMP" ] || { echo "pg_dump 결과가 올바르지 않습니다" >&2; exit 1; }
# 큰 파일을 조각으로 나눠 올리면(병렬 합치기) 지우기 권한이 필요하므로 끕니다.
CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False \
  gcloud storage cp --no-clobber --quiet "$dump" "gs://$BUCKET/db/$day.dump"
echo "backup gs://$BUCKET/db/$day.dump $(stat -c %s "$dump") bytes"
