#!/usr/bin/env bash
# 서버·배포 리소스를 준비합니다(docs/aws-setup.md 2·4~8단계). 관리자가 자기 터미널에서 직접 실행합니다.
#   bash infra/aws/setup-infra.sh <예산 알림 이메일>
# 이미 있는 리소스는 건너뛰므로 여러 번 실행해도 됩니다. 비밀값은 새로 만들 때만 생성하고 덮어쓰지 않습니다.
set -euo pipefail

ALERT_EMAIL="${1:?예산 알림을 받을 이메일}"
export AWS_REGION=ap-northeast-2 AWS_PAGER=""
cd "$(git rev-parse --show-toplevel)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OPS_BUCKET="wolgyeham-ops-$ACCOUNT_ID"
REPO="2026-KW-HACKATHON/24_3355"
TAG='Key=Project,Value=wolgyeham'
fill() {
  sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s/<OPS_BUCKET>/$OPS_BUCKET/g" -e "s/<ALERT_EMAIL>/$ALERT_EMAIL/g" "$1"
}
step() { printf '\n== %s\n' "$1"; }

step "예산 알림 (월 5달러, 실제 1달러·예상 5달러 초과 시 메일)"
if ! aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name wolgyeham-monthly >/dev/null 2>&1; then
  aws budgets create-budget --account-id "$ACCOUNT_ID" --budget file://infra/aws/budget.json \
    --notifications-with-subscribers "$(fill infra/aws/budget-notifications.json)"
fi

step "공용 리소스 (S3·ECR·로그)"
aws s3api head-bucket --bucket "$OPS_BUCKET" 2>/dev/null ||
  aws s3api create-bucket --bucket "$OPS_BUCKET" --create-bucket-configuration LocationConstraint=$AWS_REGION >/dev/null
aws ecr describe-repositories --repository-names wolgyeham-api >/dev/null 2>&1 ||
  aws ecr create-repository --repository-name wolgyeham-api --image-scanning-configuration scanOnPush=true --tags "$TAG" >/dev/null
for e in dev prod; do
  aws logs create-log-group --log-group-name "/wolgyeham/$e" --tags Project=wolgyeham 2>/dev/null || true
  aws logs put-retention-policy --log-group-name "/wolgyeham/$e" --retention-in-days 14
done

step "비밀값 (SSM, 없을 때만 생성)"
put_new() {
  aws ssm get-parameter --name "$1" >/dev/null 2>&1 ||
    aws ssm put-parameter --name "$1" --type SecureString --value "$2" --tags "$TAG" >/dev/null
}
put_new /wolgyeham/db/POSTGRES_PASSWORD "$(openssl rand -hex 24)"
for e in dev prod; do
  put_new "/wolgyeham/$e/DB_PASSWORD" "$(openssl rand -hex 24)"
  put_new "/wolgyeham/$e/SESSION_SECRET" "$(openssl rand -hex 32)"
done
put_new /wolgyeham/dev/DEMO_MODE true
put_new /wolgyeham/prod/DEMO_MODE false

step "EC2 역할"
if ! aws iam get-role --role-name wolgyeham-ec2 >/dev/null 2>&1; then
  aws iam create-role --role-name wolgyeham-ec2 --tags "$TAG" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name wolgyeham-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
fi
aws iam put-role-policy --role-name wolgyeham-ec2 --policy-name wolgyeham-app \
  --policy-document "$(fill infra/aws/ec2-instance-policy.json)"
if ! aws iam get-instance-profile --instance-profile-name wolgyeham-ec2 >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name wolgyeham-ec2 >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name wolgyeham-ec2 --role-name wolgyeham-ec2
  sleep 10
fi

step "보안 그룹 (CloudFront에서 오는 8081~8082만, SSH 없음)"
VPC_ID="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 describe-security-groups --filters Name=group-name,Values=wolgyeham-app Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text)"
if [ "$SG_ID" = "None" ]; then
  SG_ID="$(aws ec2 create-security-group --group-name wolgyeham-app --vpc-id "$VPC_ID" \
    --description "Wolgyeham API from CloudFront only" --query GroupId --output text)"
  aws ec2 create-tags --resources "$SG_ID" --tags "$TAG"
  CF_PL="$(aws ec2 describe-managed-prefix-lists \
    --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' --output text)"
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=8081,ToPort=8082,PrefixListIds=[{PrefixListId=$CF_PL}]" >/dev/null
fi

step "EC2 인스턴스 (t3.micro, Amazon Linux 2023)"
INSTANCE_ID="$(aws ec2 describe-instances \
  --filters Name=tag:Project,Values=wolgyeham Name=tag:Role,Values=app Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
if [ "$INSTANCE_ID" = "None" ]; then
  AMI="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)"
  INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI" --instance-type t3.micro \
    --iam-instance-profile Name=wolgyeham-ec2 --security-group-ids "$SG_ID" \
    --user-data file://infra/server/bootstrap.sh --metadata-options HttpTokens=required \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
    --tag-specifications \
      'ResourceType=instance,Tags=[{Key=Project,Value=wolgyeham},{Key=Role,Value=app},{Key=Name,Value=wolgyeham-app}]' \
      'ResourceType=volume,Tags=[{Key=Project,Value=wolgyeham}]' \
    --query 'Instances[0].InstanceId' --output text)"
fi
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

ALLOC="$(aws ec2 describe-addresses --filters Name=tag:Project,Values=wolgyeham --query 'Addresses[0].AllocationId' --output text)"
if [ "$ALLOC" = "None" ]; then
  ALLOC="$(aws ec2 allocate-address --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Project,Value=wolgyeham}]' \
    --query AllocationId --output text)"
fi
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC" >/dev/null
sleep 5
EC2_DNS="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicDnsName' --output text)"

step "서버 설정 파일 (SSM 연결을 기다립니다, 최대 5분)"
for _ in $(seq 1 60); do
  state="$(aws ssm describe-instance-information --filters Key=InstanceIds,Values="$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)"
  [ "$state" = "Online" ] && break
  sleep 5
done
SERVER_ENV_CMD="mkdir -p /opt/wolgyeham && printf 'AWS_REGION=%s\\nAPI_IMAGE=%s\\nOPS_BUCKET=%s\\n' $AWS_REGION $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/wolgyeham-api $OPS_BUCKET > /opt/wolgyeham/server.env"
aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --comment "write server.env" \
  --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$SERVER_ENV_CMD")" \
  --query 'Command.CommandId' --output text >/dev/null

step "API용 CloudFront (dev 8081, prod 8082)"
cf_domain() {
  aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='wolgyeham api $1'].DomainName | [0]" --output text
}
for e in dev prod; do
  if [ "$(cf_domain "$e")" = "None" ]; then
    port=8081; [ "$e" = prod ] && port=8082
    python3 - "$e" "$port" "$EC2_DNS" > "/tmp/wolgyeham-cf-$e.json" <<'PY'
import json, sys, time
env, port, dns = sys.argv[1], int(sys.argv[2]), sys.argv[3]
c = json.load(open("infra/aws/cloudfront-api.json"))
c["CallerReference"] = f"wolgyeham-api-{env}-{int(time.time())}"
c["Comment"] = f"wolgyeham api {env}"
o = c["Origins"]["Items"][0]
o["DomainName"] = dns
o["CustomOriginConfig"]["HTTPPort"] = port
print(json.dumps(c))
PY
    aws cloudfront create-distribution --distribution-config "file:///tmp/wolgyeham-cf-$e.json" >/dev/null
  fi
done
DEV_CF="$(cf_domain dev)"
PROD_CF="$(cf_domain prod)"

step "GitHub 배포 권한 (OIDC)"
OIDC_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1 ||
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com --tags "$TAG" >/dev/null
aws iam get-role --role-name wolgyeham-github-deploy >/dev/null 2>&1 ||
  aws iam create-role --role-name wolgyeham-github-deploy --tags "$TAG" \
    --assume-role-policy-document "$(fill infra/aws/github-oidc-trust.json)" >/dev/null
aws iam put-role-policy --role-name wolgyeham-github-deploy --policy-name deploy \
  --policy-document "$(fill infra/aws/github-deploy-policy.json)"

step "GitHub 저장소 변수"
gh variable set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "arn:aws:iam::$ACCOUNT_ID:role/wolgyeham-github-deploy"
gh variable set ECR_REPOSITORY --repo "$REPO" --body wolgyeham-api
gh variable set OPS_BUCKET --repo "$REPO" --body "$OPS_BUCKET"
gh variable set DEV_API_BASE_URL --repo "$REPO" --body "https://$DEV_CF"
gh variable set PROD_API_BASE_URL --repo "$REPO" --body "https://$PROD_CF"

cat <<EOF

완료
  EC2           $INSTANCE_ID ($EC2_DNS)
  dev API       https://$DEV_CF   (첫 배포 뒤 /api/health)
  prod API      https://$PROD_CF
다음: Amplify 앱 두 개를 콘솔에서 연결한 뒤  bash infra/aws/setup-amplify.sh <dev 앱 ID> <prod 앱 ID>
EOF
