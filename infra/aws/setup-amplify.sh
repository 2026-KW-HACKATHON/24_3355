#!/usr/bin/env bash
# Amplify 앱 두 개를 콘솔에서 GitHub에 연결한 뒤 실행합니다(docs/aws-setup.md 9단계).
#   bash infra/aws/setup-amplify.sh <dev 앱 ID> <prod 앱 ID>
# /api 프록시 규칙, 모노레포 환경 변수, PR 미리 보기를 설정하고, 웹 주소를 SSM APP_ORIGIN에 넣습니다.
set -euo pipefail

DEV_APP="${1:?dev 앱 ID}"
PROD_APP="${2:?prod 앱 ID}"
export AWS_REGION=ap-northeast-2 AWS_PAGER=""
cd "$(git rev-parse --show-toplevel)"

cf_domain() {
  aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='wolgyeham api $1'].DomainName | [0]" --output text
}

setup_app() {
  local app="$1" env="$2" branch="$3" cf rules origin
  cf="$(cf_domain "$env")"
  [ "$cf" != "None" ] || { echo "$env CloudFront가 없습니다. setup-infra.sh를 먼저 실행하세요" >&2; exit 1; }
  rules="$(sed "s/<$(echo "$env" | tr '[:lower:]' '[:upper:]')_API_CLOUDFRONT_DOMAIN>/$cf/" "infra/amplify/rewrites.$env.json")"
  aws amplify update-app --app-id "$app" --custom-rules "$rules" \
    --environment-variables AMPLIFY_MONOREPO_APP_ROOT=apps/web >/dev/null
  if [ "$env" = dev ]; then
    aws amplify update-branch --app-id "$app" --branch-name "$branch" --enable-pull-request-preview >/dev/null
  fi
  origin="https://$branch.$(aws amplify get-app --app-id "$app" --query app.defaultDomain --output text)"
  aws ssm put-parameter --name "/wolgyeham/$env/APP_ORIGIN" --type SecureString --value "$origin" --overwrite >/dev/null
  echo "$env 웹: $origin  (API: https://$cf)"
  echo "  카카오 Redirect URI: $origin/api/auth/kakao/callback"
}

setup_app "$DEV_APP" dev main
setup_app "$PROD_APP" prod release
