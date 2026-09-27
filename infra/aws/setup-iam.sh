#!/usr/bin/env bash
# 팀원 IAM 사용자를 만듭니다. 관리자가 자기 터미널에서 직접 실행합니다(AI 도구가 대신 실행하지 않음).
#   bash infra/aws/setup-iam.sh <관리자 이름> <개발자 이름> [<개발자 이름> ...]
#   예) bash infra/aws/setup-iam.sh wh-kyowon wh-jiwoo wh-jiyeon
# - 관리자: wolgyeham-admins(AdministratorAccess) + wolgyeham-devs
# - 개발자: wolgyeham-devs(로그 보기, 배포 상태 보기, 앱 서버 SSM 접속, 자기 비밀번호·MFA 관리)
# - 액세스 키는 만들지 않습니다. 콘솔은 초기 비밀번호로 들어가 바로 바꾸고, CLI는 `aws login`을 씁니다.
# - 초기 비밀번호는 이 터미널에만 한 번 출력됩니다. 채팅·이슈에 붙이지 말고 본인에게 따로 전달합니다.
set -euo pipefail

ADMIN="${1:?관리자 사용자 이름}"
shift
[ "$#" -ge 1 ] || { echo "개발자 사용자 이름을 하나 이상 주세요" >&2; exit 2; }
DEVS=("$@")

export AWS_PAGER=""
DIR="$(cd "$(dirname "$0")" && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fill() { sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" "$1"; }

ensure_group() {
  aws iam get-group --group-name "$1" >/dev/null 2>&1 || aws iam create-group --group-name "$1" >/dev/null
}

create_user() {
  local user="$1" pw
  if aws iam get-user --user-name "$user" >/dev/null 2>&1; then
    echo "  $user: 이미 있음"
    return
  fi
  aws iam create-user --user-name "$user" --tags Key=Project,Value=wolgyeham >/dev/null
  pw="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)Aa1!"
  aws iam create-login-profile --user-name "$user" --password "$pw" --password-reset-required >/dev/null
  printf '  %-16s 초기 비밀번호: %s\n' "$user" "$pw"
}

echo "== 비밀번호 정책"
aws iam update-account-password-policy --minimum-password-length 14 \
  --require-symbols --require-numbers --require-uppercase-characters --require-lowercase-characters \
  --allow-users-to-change-password

echo "== 그룹"
ensure_group wolgyeham-admins
ensure_group wolgyeham-devs
aws iam attach-group-policy --group-name wolgyeham-admins --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
aws iam put-group-policy --group-name wolgyeham-devs --policy-name wolgyeham-developer \
  --policy-document "$(fill "$DIR/developer-permission-set.json")"

echo "== 사용자 (초기 비밀번호는 첫 로그인 때 바꿔야 합니다)"
create_user "$ADMIN"
aws iam add-user-to-group --user-name "$ADMIN" --group-name wolgyeham-admins
aws iam add-user-to-group --user-name "$ADMIN" --group-name wolgyeham-devs
for d in "${DEVS[@]}"; do
  create_user "$d"
  aws iam add-user-to-group --user-name "$d" --group-name wolgyeham-devs
done

cat <<EOF

콘솔 로그인 주소: https://$ACCOUNT_ID.signin.aws.amazon.com/console
각자 할 일
  1. 위 주소로 로그인해 새 비밀번호를 정합니다.
  2. 오른쪽 위 이름 → 보안 자격 증명 → MFA 할당(인증 앱)
  3. CLI: aws login  (리전 ap-northeast-2)
관리자는 이제 루트 대신 '$ADMIN'으로 로그인해 나머지 설정을 합니다.
MFA가 없는 사용자 확인: aws iam list-users --query 'Users[].UserName' 후 aws iam list-mfa-devices --user-name <이름>
EOF
