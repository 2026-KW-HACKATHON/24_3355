#!/usr/bin/env bash
# GCP 시험 환경의 클라우드 자원을 만듭니다(docs/gcp.md, D-36). 관리자가 자기 gcloud 로그인으로 저장소 루트에서 실행합니다.
#   bash infra/gcp/setup.sh --alert-email <받을 주소> [--api-env-file <파일>] [--db-password-file <파일>]
# 여러 번 실행해도 됩니다. 이미 있는 자원은 그대로 두고, 권한·수명 주기 같은 설정만 다시 맞춥니다.
# 비밀값은 이 스크립트에 없습니다. 비밀(Secret Manager)은 빈 채로 만들고, 파일을 넘기면 그 내용을 새 버전으로만 올립니다
# (처음 배포는 deploy.sh가 서버 파일을 옮기거나 새로 만들어 올립니다). 출력은 자원 이름뿐입니다.
# VM·고정 IP·방화벽·Artifact Registry는 이미 있다고 봅니다. AWS 쪽은 건드리지 않습니다.
set -euo pipefail

PROJECT="${GCP_PROJECT:-wolgyeham-kw2026}"
REGION="${GCP_REGION:-us-west1}"
ZONE="${GCP_ZONE:-us-west1-b}"
VM="${GCP_VM:-wolgyeham}"
SA="wolgyeham-vm@$PROJECT.iam.gserviceaccount.com"
PHOTOS="$PROJECT-photos"
BACKUPS="$PROJECT-backups"
SECRET_API_ENV="wolgyeham-api-env"
SECRET_DB_PASSWORD="wolgyeham-db-password"
SNAPSHOT_POLICY="wolgyeham-daily"
UPTIME_NAME="wolgyeham-api-health"
POLICY_NAME="wolgyeham-api-health-alert"

usage() {
  echo "사용: bash infra/gcp/setup.sh --alert-email <주소> [--api-env-file <파일>] [--db-password-file <파일>]" >&2
  exit 2
}
ALERT_EMAIL=""
API_ENV_FILE=""
DB_PASSWORD_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --alert-email) ALERT_EMAIL="${2:-}"; shift 2 ;;
    --api-env-file) API_ENV_FILE="${2:-}"; shift 2 ;;
    --db-password-file) DB_PASSWORD_FILE="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "$ALERT_EMAIL" == *@*.* ]] || usage
for file in "$API_ENV_FILE" "$DB_PASSWORD_FILE"; do
  if [ -n "$file" ] && [ ! -s "$file" ]; then echo "파일이 없거나 비었습니다: $file" >&2; exit 2; fi
done
G=(--project "$PROJECT" --quiet)

IP="$(gcloud compute addresses describe wolgyeham-ip --region "$REGION" "${G[@]}" --format='value(address)')"
SITE_HOST="${SITE_HOST:-gcp.${IP//./-}.sslip.io}"

echo "== API"
gcloud services enable secretmanager.googleapis.com storage.googleapis.com monitoring.googleapis.com \
  compute.googleapis.com "${G[@]}"

echo "== 버킷"
lifecycle="$(mktemp)"
trap 'rm -f "$lifecycle" "${policy_file:-}"' EXIT
for bucket in "$PHOTOS" "$BACKUPS"; do
  if ! gcloud storage buckets describe "gs://$bucket" "${G[@]}" --format='value(name)' >/dev/null 2>&1; then
    gcloud storage buckets create "gs://$bucket" --location "$REGION" --default-storage-class STANDARD \
      --uniform-bucket-level-access --public-access-prevention "${G[@]}" >/dev/null
  fi
  # 이미 있던 버킷도 같은 설정으로 맞춥니다.
  gcloud storage buckets update "gs://$bucket" --uniform-bucket-level-access --public-access-prevention \
    "${G[@]}" >/dev/null
  echo "gs://$bucket"
done
# 백업은 14일 뒤 지웁니다(무료 5GB 안에 둡니다).
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":14}}]}' >"$lifecycle"
gcloud storage buckets update "gs://$BACKUPS" --lifecycle-file "$lifecycle" "${G[@]}" >/dev/null

echo "== 버킷 권한($SA)"
# 사진: 객체 쓰기·읽기·목록·삭제. 백업: 새로 쓰기와 읽기(덮어쓰기·삭제 없음, --no-clobber 확인에 읽기가 필요).
gcloud storage buckets add-iam-policy-binding "gs://$PHOTOS" --member "serviceAccount:$SA" \
  --role roles/storage.objectAdmin "${G[@]}" >/dev/null
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  gcloud storage buckets add-iam-policy-binding "gs://$BACKUPS" --member "serviceAccount:$SA" \
    --role "$role" "${G[@]}" >/dev/null
done
echo "gs://$PHOTOS objectAdmin, gs://$BACKUPS objectCreator+objectViewer"

echo "== 비밀"
for secret in "$SECRET_API_ENV" "$SECRET_DB_PASSWORD"; do
  if ! gcloud secrets describe "$secret" "${G[@]}" --format='value(name)' >/dev/null 2>&1; then
    gcloud secrets create "$secret" --replication-policy user-managed --locations "$REGION" \
      --labels app=wolgyeham "${G[@]}" >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$secret" --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor "${G[@]}" >/dev/null
  echo "$secret"
done
# 파일을 넘긴 경우에만 새 버전을 올립니다. 내용은 출력하지 않습니다.
if [ -n "$API_ENV_FILE" ]; then
  gcloud secrets versions add "$SECRET_API_ENV" --data-file "$API_ENV_FILE" "${G[@]}" --format='value(name)'
fi
if [ -n "$DB_PASSWORD_FILE" ]; then
  # 줄바꿈 없이 비밀번호만 올립니다.
  tr -d '\r\n' <"$DB_PASSWORD_FILE" |
    gcloud secrets versions add "$SECRET_DB_PASSWORD" --data-file - "${G[@]}" --format='value(name)'
fi

echo "== 디스크 스냅샷(매일, 7일 보관)"
if ! gcloud compute resource-policies describe "$SNAPSHOT_POLICY" --region "$REGION" "${G[@]}" >/dev/null 2>&1; then
  # 03:00 KST(18:00 UTC). 스냅샷은 같은 리전에 둡니다.
  gcloud compute resource-policies create snapshot-schedule "$SNAPSHOT_POLICY" --region "$REGION" \
    --daily-schedule --start-time 18:00 --max-retention-days 7 \
    --on-source-disk-delete keep-auto-snapshots --storage-location "$REGION" "${G[@]}" >/dev/null
fi
disk="$(gcloud compute instances describe "$VM" --zone "$ZONE" "${G[@]}" \
  --format='value(disks[0].source.basename())')"
attached="$(gcloud compute disks describe "$disk" --zone "$ZONE" "${G[@]}" --format='value(resourcePolicies)')"
if [[ "$attached" != *"/$SNAPSHOT_POLICY"* ]]; then
  gcloud compute disks add-resource-policies "$disk" --zone "$ZONE" --resource-policies "$SNAPSHOT_POLICY" \
    "${G[@]}" >/dev/null
fi
echo "$SNAPSHOT_POLICY -> disks/$disk"

echo "== 가동 확인(https://$SITE_HOST/api/health)"
# 알림 채널은 gcloud 정식판에 명령이 없어(beta 전용) Monitoring API를 직접 부릅니다. 토큰은 명령 인자에 두지 않습니다.
token="$(gcloud auth print-access-token)"
api="https://monitoring.googleapis.com/v3/projects/$PROJECT"
monitoring() { curl -fsS -H @<(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$token") "$@"; }
channel="$(monitoring "$api/notificationChannels?filter=type%3D%22email%22" |
  ALERT_EMAIL="$ALERT_EMAIL" python3 -c 'import json,os,sys
for c in json.load(sys.stdin).get("notificationChannels", []):
    if c.get("labels", {}).get("email_address") == os.environ["ALERT_EMAIL"]:
        print(c["name"]); break')"
if [ -z "$channel" ]; then
  channel="$(ALERT_EMAIL="$ALERT_EMAIL" python3 -c 'import json,os
print(json.dumps({"type":"email","displayName":"wolgyeham alert","labels":{"email_address":os.environ["ALERT_EMAIL"]}}))' |
    monitoring -X POST --data-binary @- "$api/notificationChannels" |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')"
fi
unset token
echo "$channel"

check="$(gcloud monitoring uptime list-configs "${G[@]}" --filter="displayName=$UPTIME_NAME" --format='value(name)' | head -n1)"
if [ -z "$check" ]; then
  gcloud monitoring uptime create "$UPTIME_NAME" --resource-type uptime-url \
    --resource-labels "host=$SITE_HOST,project_id=$PROJECT" --protocol https --path /api/health \
    --period 5 --timeout 10 "${G[@]}" >/dev/null
  check="$(gcloud monitoring uptime list-configs "${G[@]}" --filter="displayName=$UPTIME_NAME" --format='value(name)' | head -n1)"
fi
echo "$check"

if [ -z "$(gcloud monitoring policies list "${G[@]}" --filter="displayName=$POLICY_NAME" --format='value(name)')" ]; then
  policy_file="$(mktemp)"
  # 콘솔이 가동 확인에 만드는 기본 알림과 같습니다: 여러 지역 중 둘 이상이 실패하면 1분 뒤 메일.
  CHECK_ID="${check##*/}" CHANNEL="$channel" POLICY_NAME="$POLICY_NAME" python3 -c 'import json,os
f = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"%s\"" % os.environ["CHECK_ID"]
print(json.dumps({
  "displayName": os.environ["POLICY_NAME"], "combiner": "OR",
  "conditions": [{"displayName": "api health failed", "conditionThreshold": {
    "filter": f, "comparison": "COMPARISON_GT", "thresholdValue": 1, "duration": "60s",
    "trigger": {"count": 1},
    "aggregations": [{"alignmentPeriod": "1200s", "perSeriesAligner": "ALIGN_NEXT_OLDER",
      "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.*"]}]}}],
  "notificationChannels": [os.environ["CHANNEL"]]}))' >"$policy_file"
  gcloud monitoring policies create --policy-from-file "$policy_file" "${G[@]}" >/dev/null
fi
gcloud monitoring policies list "${G[@]}" --filter="displayName=$POLICY_NAME" --format='value(name)'
echo "끝"
