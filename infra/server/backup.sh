#!/usr/bin/env bash
# dev·prod 데이터베이스를 S3로 백업합니다. systemd 타이머가 매일 한 번 실행합니다.
# 복구: aws s3 cp s3://<버킷>/backups/prod/<날짜>.dump - |
#   docker compose --env-file server.env --env-file .deploy.env exec -T db pg_restore -U postgres -d wolgyeham_prod --clean
set -euo pipefail

cd /opt/wolgyeham
source server.env   # AWS_REGION, OPS_BUCKET
DAY=$(date +%F)

for db in dev prod; do
  docker compose --env-file server.env --env-file .deploy.env exec -T db \
    pg_dump -U postgres -Fc "wolgyeham_$db" |
    aws s3 cp - "s3://$OPS_BUCKET/backups/$db/$DAY.dump" --region "$AWS_REGION" --only-show-errors
done
echo "백업 완료: $DAY"
