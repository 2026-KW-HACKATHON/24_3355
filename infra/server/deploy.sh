#!/usr/bin/env bash
# 사용: deploy.sh <dev|prod> <이미지 태그>   또는   deploy.sh <dev|prod> --rollback
# GitHub Actions가 SSM Run Command로 부릅니다. 관리자는 SSM 세션에서 직접 실행할 수 있습니다.
set -euo pipefail

ENV_NAME="${1:?dev 또는 prod}"
TARGET="${2:?이미지 태그 또는 --rollback}"
case "$ENV_NAME" in
  dev) PORT=8081 ;;
  prod) PORT=8082 ;;
  *) echo "알 수 없는 환경: $ENV_NAME" >&2; exit 2 ;;
esac

ROOT=/opt/wolgyeham
cd "$ROOT"
source "$ROOT/server.env"   # AWS_REGION, API_IMAGE, ORIGIN_DOMAIN, ACME_EMAIL (관리자가 만든 파일)
# 원본 HTTPS(caddy)에 필요한 값이 없으면 아무것도 바꾸지 않고 멈춥니다(지금 돌고 있는 컨테이너는 그대로).
if [ -z "${ORIGIN_DOMAIN:-}" ] || [ -z "${ACME_EMAIL:-}" ]; then
  echo "server.env에 ORIGIN_DOMAIN·ACME_EMAIL이 없습니다. docs/aws-setup.md 7-A의 prepare를 먼저 실행하세요" >&2
  exit 1
fi
mkdir -p env
chmod 700 env

# SSM Parameter Store(/wolgyeham/<env>/*)의 값을 KEY=VALUE 파일로 씁니다.
render_env() {
  local path="$1" out="$2"
  aws ssm get-parameters-by-path --region "$AWS_REGION" --path "$path" --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text |
    awk -F'\t' '{ n=$1; sub(/.*\//, "", n); print n "=" $2 }' > "$out.tmp"
  chmod 600 "$out.tmp"
  mv "$out.tmp" "$out"
}

render_env "/wolgyeham/db" env/db.env      # POSTGRES_PASSWORD
render_env "/wolgyeham/dev" env/dev.env    # DB_PASSWORD, KAKAO_*, SESSION_SECRET ...
render_env "/wolgyeham/prod" env/prod.env
{
  echo "POSTGRES_USER=postgres"
  sed -n 's/^DB_PASSWORD=/DEV_DB_PASSWORD=/p' env/dev.env
  sed -n 's/^DB_PASSWORD=/PROD_DB_PASSWORD=/p' env/prod.env
} >> env/db.env
for f in dev prod; do
  pw=$(sed -n 's/^DB_PASSWORD=//p' "env/$f.env")
  if [ -n "$pw" ]; then
    echo "DATABASE_URL=postgres://wolgyeham_$f:$pw@db:5432/wolgyeham_$f" >> "env/$f.env"
  fi
done

# caddy 값: 원본 이름·연락 주소(server.env)와 두 환경의 X-Origin-Verify(SSM). 값은 출력하지 않습니다.
DEV_VERIFY=$(sed -n 's/^ORIGIN_VERIFY_SECRET=//p' env/dev.env)
PROD_VERIFY=$(sed -n 's/^ORIGIN_VERIFY_SECRET=//p' env/prod.env)
# Caddyfile에 그대로 들어가므로 공백·따옴표·중괄호·*가 없는 32자 이상만 받습니다(SSM 값은 openssl rand -hex 32).
SECRET_RE='^[A-Za-z0-9._~+/=-]{32,}$'
DOMAIN_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'
for pair in "dev:$DEV_VERIFY" "prod:$PROD_VERIFY"; do
  if ! [[ "${pair#*:}" =~ $SECRET_RE ]]; then
    echo "SSM /wolgyeham/${pair%%:*}/ORIGIN_VERIFY_SECRET이 없거나 형식이 다릅니다" >&2
    exit 1
  fi
done
if ! [[ "$ORIGIN_DOMAIN" =~ $DOMAIN_RE ]] || ! [[ "$ACME_EMAIL" =~ $EMAIL_RE ]]; then
  echo "server.env의 ORIGIN_DOMAIN 또는 ACME_EMAIL 형식이 다릅니다" >&2
  exit 1
fi
{
  echo "ORIGIN_DOMAIN=$ORIGIN_DOMAIN"
  echo "ACME_EMAIL=$ACME_EMAIL"
  echo "DEV_ORIGIN_VERIFY_SECRET=$DEV_VERIFY"
  echo "PROD_ORIGIN_VERIFY_SECRET=$PROD_VERIFY"
} > env/caddy.env.tmp
chmod 600 env/caddy.env.tmp
mv env/caddy.env.tmp env/caddy.env

# 태그 기록: .deploy.env에 현재 태그, .deploy.prev에 직전 태그
touch .deploy.env .deploy.prev
KEY=$(echo "${ENV_NAME}_TAG" | tr '[:lower:]' '[:upper:]')
CURRENT=$(sed -n "s/^$KEY=//p" .deploy.env)
if [ "$TARGET" = "--rollback" ]; then
  TAG=$(sed -n "s/^$KEY=//p" .deploy.prev)
  [ -n "$TAG" ] || { echo "되돌릴 이전 태그가 없습니다" >&2; exit 1; }
else
  TAG="$TARGET"
fi

set_tag() {
  local file="$1" value="$2"
  grep -v "^$KEY=" "$file" > "$file.tmp" || true
  if [ -n "$value" ]; then echo "$KEY=$value" >> "$file.tmp"; fi
  mv "$file.tmp" "$file"
}

compose() {
  docker compose --env-file server.env --env-file .deploy.env "$@"
}

# 오류 메시지에 비밀값이 섞여도 Actions 로그에 남지 않게 가린 뒤 끝부분만 보여줍니다.
quiet() {
  local out status=0
  out=$("$@" 2>&1) || status=$?
  if [ "$status" -ne 0 ]; then
    out=${out//"$DEV_VERIFY"/***}
    out=${out//"$PROD_VERIFY"/***}
    printf '%s\n' "$out" | tail -n 20 >&2
  fi
  return "$status"
}

# caddy: 설정을 버리는 컨테이너에서 먼저 확인하고, 띄우고(값이 바뀌었으면 다시 만듦), Caddyfile을 다시 읽힙니다.
# dev·prod가 같이 쓰므로 어느 환경을 배포하든 반영됩니다. 실패하면 API를 건드리기 전에 멈춥니다.
quiet compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile ||
  { echo "Caddy 설정 확인 실패" >&2; exit 1; }
compose up -d --no-deps caddy
for i in 1 2 3 4 5; do
  if quiet compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then break; fi
  [ "$i" = 5 ] && { echo "Caddy 설정을 다시 읽지 못했습니다" >&2; exit 1; }
  sleep 2
done

REGISTRY="${API_IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

set_tag .deploy.env "$TAG"
compose pull "api-$ENV_NAME"
compose up -d --wait db

# 이미지 안에 migrate.mjs가 있으면 새 API를 띄우기 전에 마이그레이션을 실행합니다.
if compose run --rm --no-deps --entrypoint sh "api-$ENV_NAME" -c 'test -f migrate.mjs'; then
  compose run --rm --no-deps "api-$ENV_NAME" node migrate.mjs
fi

# dev는 DEMO_MODE=true일 때 시연 데이터(가상 건물)를 넣습니다. 시드는 여러 번 실행해도 결과가 같습니다.
if [ "$ENV_NAME" = dev ] && grep -q '^DEMO_MODE=true' env/dev.env; then
  compose run --rm --no-deps api-dev node seed.mjs
fi

compose up -d "api-$ENV_NAME"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    if [ "$TAG" != "$CURRENT" ]; then set_tag .deploy.prev "$CURRENT"; fi
    echo "배포 완료: $ENV_NAME $TAG"
    exit 0
  fi
  sleep 2
done

echo "상태 확인 실패: 이전 태그($CURRENT)로 되돌립니다" >&2
if [ -n "$CURRENT" ]; then
  set_tag .deploy.env "$CURRENT"
  compose up -d "api-$ENV_NAME"
fi
exit 1
