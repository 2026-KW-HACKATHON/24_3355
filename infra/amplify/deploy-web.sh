#!/usr/bin/env bash
set -euo pipefail
APP_ID="${1:?Amplify app id}"
BRANCH="${2:?Amplify branch}"
DIST="${3:?빌드 결과 디렉터리}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}" AWS_PAGER=""
[[ "$APP_ID" =~ ^[a-z0-9]+$ ]] || exit 2
[[ "$BRANCH" =~ ^[a-zA-Z0-9/-]+$ ]] || exit 2
[ -f "$DIST/index.html" ] || { echo "빌드 결과에 index.html이 없습니다" >&2; exit 2; }
ARCHIVE="$(mktemp -d)"
trap 'rm -rf "$ARCHIVE"' EXIT
chmod 700 "$ARCHIVE"
ARCHIVE="$(cd "$ARCHIVE" && pwd)"
(cd "$DIST" && zip -qr "$ARCHIVE/web.zip" .)
DEPLOYMENT="$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --output json)"
JOB_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$DEPLOYMENT")"
UPLOAD_URL="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["zipUploadUrl"])' <<<"$DEPLOYMENT")"
curl --silent --fail --upload-file "$ARCHIVE/web.zip" "$UPLOAD_URL" >/dev/null ||
  { echo "웹 빌드 업로드 실패" >&2; exit 1; }
unset DEPLOYMENT UPLOAD_URL
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
  --query 'jobSummary.{id:jobId,status:status}' --output json
for _ in $(seq 1 90); do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --query job.summary.status --output text)"
  case "$STATUS" in
    SUCCEED) echo "웹 배포 완료: $APP_ID/$BRANCH job=$JOB_ID"; exit 0 ;;
    FAILED|CANCELLED) echo "웹 배포 실패: $STATUS job=$JOB_ID" >&2; exit 1 ;;
  esac
  sleep 10
done
echo "웹 배포 확인 시간 초과: job=$JOB_ID" >&2
exit 1
