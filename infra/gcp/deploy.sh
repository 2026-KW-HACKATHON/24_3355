#!/usr/bin/env bash
# GCP 시험 환경에 배포합니다. 저장소 루트에서 실행합니다: bash infra/gcp/deploy.sh (먼저 setup.sh, docs/gcp.md)
# 1) API 이미지(linux/amd64)를 Artifact Registry에 올리고 2) 웹을 빌드해 3) IAP SSH로 서버에 보낸 뒤
# 4) 서버의 server.sh가 Secret Manager에서 비밀을 받아 마이그레이션·시연 시드를 하고 compose를 올립니다.
# 비밀(wolgyeham-api-env, wolgyeham-db-password)에 버전이 없으면 처음 한 번만 채웁니다: 서버에 예전 파일
# (/opt/wolgyeham/api.env, .env)이 있으면 그 내용을 그대로 옮기고(VAPID 키·DB 비밀번호 유지), 없으면 여기서 새로 만듭니다.
# 비밀값은 출력하지 않고 파이프로만 넘깁니다. AWS 쪽(infra/server, infra/aws)은 건드리지 않습니다.
set -euo pipefail
PROJECT="${GCP_PROJECT:-wolgyeham-kw2026}"
REGION="${GCP_REGION:-us-west1}"
ZONE="${GCP_ZONE:-us-west1-b}"
VM="${GCP_VM:-wolgyeham}"
IP="$(gcloud compute addresses describe wolgyeham-ip --region "$REGION" --project "$PROJECT" --format='value(address)')"
SITE_HOST="${SITE_HOST:-gcp.${IP//./-}.sslip.io}"
TAG="$(git rev-parse --short HEAD)"
# 추적하지 않은 새 파일도 바뀐 것으로 봅니다(같은 커밋의 깨끗한 이미지와 이름이 겹치지 않게).
[ -z "$(git status --porcelain -- apps packages)" ] || TAG="$TAG-dirty"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/wolgyeham/api:$TAG"
SSH=(gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" --tunnel-through-iap --quiet --command)

echo "== API 이미지 $IMAGE"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t "$IMAGE" --push . >/dev/null

echo "== 웹 빌드"
pnpm --filter @wolgyeham/web build >/dev/null
bundle="$(mktemp -d)"
cp infra/gcp/compose.yaml infra/gcp/Caddyfile infra/gcp/server.sh infra/gcp/startup.sh infra/gcp/backup.sh "$bundle/"
cp -R infra/gcp/systemd "$bundle/systemd"
cp -R apps/web/dist "$bundle/web"
# macOS tar의 ._* 메타 파일과 임시 폴더 권한(700)이 서버로 넘어가지 않게 합니다.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$bundle.tgz" -C "$bundle" .
gcloud compute scp "$bundle.tgz" "$VM:/tmp/wolgyeham-bundle.tgz" --zone "$ZONE" --project "$PROJECT" --tunnel-through-iap --quiet
rm -rf "$bundle" "$bundle.tgz"

echo "== 비밀(처음 한 번)"
G=(--project "$PROJECT" --quiet)
has_version() {
  gcloud secrets describe "$1" "${G[@]}" --format='value(name)' >/dev/null 2>&1 ||
    { echo "비밀 $1이 없습니다. 먼저 bash infra/gcp/setup.sh를 실행합니다." >&2; exit 1; }
  [ -n "$(gcloud secrets versions list "$1" "${G[@]}" --filter='state=ENABLED' --limit=1 --format='value(name)')" ]
}
digest() { openssl dgst -sha256 -r | cut -d' ' -f1; }
# 서버 검사 결과: 0이면 있음, 1이면 없음. SSH 자체가 실패하면(255 등) 새 비밀을 만들지 않고 멈춥니다.
# 그러지 않으면 기존 DB 볼륨의 비밀번호와 VAPID 키가 새 값으로 바뀝니다.
remote_has() { # <서버 명령>
  local rc=0
  "${SSH[@]}" "$1" || rc=$?
  [ "$rc" -le 1 ] || { echo "서버 확인 실패(SSH 종료 코드 $rc): 비밀을 만들지 않고 멈춥니다" >&2; exit 1; }
  return "$rc"
}
# 서버 파일을 SSH 표준 출력으로 받아 그대로 새 버전에 넣고, 양쪽 해시가 같은지 확인합니다(값은 화면에 나오지 않음).
migrate() { # <비밀> <서버에서 내용을 내보내는 명령>
  "${SSH[@]}" "$2" | gcloud secrets versions add "$1" --data-file=- "${G[@]}" >/dev/null
  [ "$("${SSH[@]}" "$2 | openssl dgst -sha256 -r | cut -d' ' -f1")" = \
    "$(gcloud secrets versions access latest --secret "$1" --out-file /dev/stdout "${G[@]}" | digest)" ] ||
    { echo "$1 옮기기 확인 실패: 방금 올린 버전을 사용 중지(gcloud secrets versions disable)한 뒤 다시 실행합니다" >&2; exit 1; }
  echo "$1: 서버 파일에서 옮김"
}
if ! has_version wolgyeham-api-env; then
  if remote_has "sudo test -s /opt/wolgyeham/api.env"; then
    migrate wolgyeham-api-env "sudo cat /opt/wolgyeham/api.env"
  else
    keys="$(apps/api/node_modules/.bin/web-push generate-vapid-keys --json)"
    {
      echo "APP_ORIGIN=https://$SITE_HOST"
      echo "DEMO_MODE=true"
      echo "SESSION_SECRET=$(openssl rand -hex 32)"
      # 키를 명령 인자로 넘기지 않고(ps에 보임) 표준 입력으로 넘깁니다.
      printf '%s' "$keys" | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{const k=JSON.parse(s);console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`)})'
      echo "VAPID_SUBJECT=mailto:wolgyeham-gcp@example.com"
    } | gcloud secrets versions add wolgyeham-api-env --data-file=- "${G[@]}" >/dev/null
    unset keys
    echo "wolgyeham-api-env: 새로 만듦"
  fi
fi
if ! has_version wolgyeham-db-password; then
  if remote_has "sudo test -f /opt/wolgyeham/.env"; then
    remote_has "sudo grep -q '^DB_PASSWORD=.' /opt/wolgyeham/.env" ||
      { echo "/opt/wolgyeham/.env에 DB_PASSWORD가 없습니다. 기존 DB 볼륨과 어긋나지 않게 직접 확인합니다" >&2; exit 1; }
    # 이미 만든 DB 볼륨이 이 비밀번호로 초기화되어 있으므로 바꾸지 않고 옮깁니다.
    migrate wolgyeham-db-password "sudo sed -n 's/^DB_PASSWORD=//p' /opt/wolgyeham/.env | tr -d '\\n'"
  else
    openssl rand -hex 24 | tr -d '\n' |
      gcloud secrets versions add wolgyeham-db-password --data-file=- "${G[@]}" >/dev/null
    echo "wolgyeham-db-password: 새로 만듦"
  fi
fi

echo "== 서버 반영"
"${SSH[@]}" "set -e
sudo tar --no-same-owner --no-same-permissions -xzf /tmp/wolgyeham-bundle.tgz -C /opt/wolgyeham && rm -f /tmp/wolgyeham-bundle.tgz
sudo chown -R root:root /opt/wolgyeham && sudo chmod 755 /opt/wolgyeham /opt/wolgyeham/web && sudo rm -rf /opt/wolgyeham/._*
sudo bash /opt/wolgyeham/server.sh '$IMAGE' '$SITE_HOST' '$PROJECT' '$REGION'
"

echo "== 확인 https://$SITE_HOST/api/health"
for i in $(seq 1 30); do
  if curl -fsS "https://$SITE_HOST/api/health" >/dev/null 2>&1; then echo "ok"; exit 0; fi
  sleep 5
done
echo "health 확인 실패" >&2
exit 1
