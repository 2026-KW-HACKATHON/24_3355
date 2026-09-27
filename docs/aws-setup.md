# AWS 준비 절차 (관리자용)

관리자가 한 번 따라 하면 dev·prod 배포가 돌아가도록 순서대로 적었습니다. 팀원은 3단계에서 받은 초대만 수락하면 됩니다. 구조는 [architecture.md](architecture.md), 매일 쓰는 방법은 [deploy.md](deploy.md)를 봅니다.

- 담당: 관리자(@kyowon1108). 이 절차의 명령은 계정·권한·비용을 바꾸므로 관리자가 직접 실행합니다. AI 도구에게 대신 실행시키지 않습니다.
- 리전: 서울 `ap-northeast-2`. 모든 리소스에 `Project=wolgyeham` 태그를 붙입니다.
- 정책 파일: [infra/aws/](../infra/aws/). `<ACCOUNT_ID>`, `<OPS_BUCKET>`, `<ALERT_EMAIL>` 같은 자리는 실행 전에 바꿉니다.

## 0. 준비

```bash
aws login
aws sts get-caller-identity
export AWS_REGION=ap-northeast-2
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export OPS_BUCKET=wolgyeham-ops-$ACCOUNT_ID
fill() { sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s/<OPS_BUCKET>/$OPS_BUCKET/g" "$1"; }
```

**계정 플랜 확인.** 콘솔의 Billing and Cost Management → Free Tier에서 확인합니다. 2025년 7월 이후 만든 계정은 크레딧 방식(무료 플랜, 6개월)이고, 그 전 계정은 12개월 프리 티어입니다. 무료 플랜 계정은 일부 서비스(예: Organizations)에 제한이 있을 수 있습니다. 3단계에서 막히면 3-B로 갑니다.

## 1. 계정 보호

- 루트 계정에 MFA를 켭니다(콘솔 → 보안 자격 증명).
- 루트 액세스 키가 없어야 합니다. 아래 값이 `0`이어야 합니다.
  ```bash
  aws iam get-account-summary --query 'SummaryMap.AccountAccessKeysPresent'
  ```

## 2. 비용 알림

`infra/aws/budget-notifications.json`의 `<ALERT_EMAIL>`을 바꾼 뒤 실행합니다. 월 5달러 예산에서 실제 비용이 1달러(20%)를 넘거나 예상 비용이 5달러를 넘으면 메일이 옵니다.

```bash
aws budgets create-budget --account-id $ACCOUNT_ID \
  --budget file://infra/aws/budget.json \
  --notifications-with-subscribers file://infra/aws/budget-notifications.json
```

## 3. 팀원 계정 — IAM Identity Center

사람마다 IAM 사용자와 액세스 키를 만들지 않고 Identity Center(SSO)를 씁니다. 무료이고, CLI도 짧게 쓰는 자격증명을 받습니다.

1. 콘솔 → IAM Identity Center → 활성화. AWS Organizations를 만들라고 하면 만듭니다(무료).
2. 사용자 3명을 추가하고 각자 이메일로 초대합니다. 설정에서 **MFA를 필수**로 합니다.
3. 그룹 두 개를 만듭니다: `wolgyeham-admins`(관리자), `wolgyeham-devs`(3명 모두).
4. 권한 세트 두 개를 만듭니다.
   - `AdministratorAccess` (AWS 관리형) → `wolgyeham-admins`
   - `WolgyehamDeveloper` (인라인 정책 = `fill infra/aws/developer-permission-set.json`, 세션 8시간) → `wolgyeham-devs`
5. 두 그룹을 이 AWS 계정에 할당합니다.
6. 팀원은 초대 메일로 비밀번호와 MFA를 설정한 뒤 CLI를 연결합니다.
   ```bash
   aws configure sso --profile wolgyeham    # 시작 URL은 관리자가 공유, 리전 ap-northeast-2
   aws sso login --profile wolgyeham
   ```

`WolgyehamDeveloper`로 할 수 있는 것: 로그 보기, Amplify·배포 상태 보기, 앱 서버에 SSM으로 접속. 인프라 변경, 권한 변경, 비밀값 수정은 할 수 없습니다.

### 3-B. Identity Center를 쓸 수 없을 때

IAM 사용자 3명을 만들되 **콘솔 비밀번호 + MFA만** 주고 액세스 키는 만들지 않습니다. CLI는 각자 `aws login`으로 콘솔 로그인 정보를 씁니다. 권한은 그룹 `wolgyeham-devs`에 같은 개발자 정책을 붙여 줍니다.

## 4. 공용 리소스

```bash
# 서버 파일·백업 버킷 (공개 차단, 백업 14일 보관)
aws s3api create-bucket --bucket $OPS_BUCKET --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-public-access-block --bucket $OPS_BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-tagging --bucket $OPS_BUCKET --tagging 'TagSet=[{Key=Project,Value=wolgyeham}]'
aws s3api put-bucket-lifecycle-configuration --bucket $OPS_BUCKET --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-backups","Filter":{"Prefix":"backups/"},"Status":"Enabled","Expiration":{"Days":14}}]}'

# API 이미지 저장소 (최근 10개만 보관)
aws ecr create-repository --repository-name wolgyeham-api \
  --image-scanning-configuration scanOnPush=true --tags Key=Project,Value=wolgyeham
aws ecr put-lifecycle-policy --repository-name wolgyeham-api --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"description":"keep last 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}'

# 로그 그룹 (14일 보관)
for e in dev prod; do
  aws logs create-log-group --log-group-name /wolgyeham/$e --tags Project=wolgyeham
  aws logs put-retention-policy --log-group-name /wolgyeham/$e --retention-in-days 14
done
```

## 5. 비밀값 (SSM Parameter Store)

값은 명령 안에서 만들고 화면에 출력하지 않습니다. **DB 비밀번호는 EC2를 만들기 전에** 넣어야 합니다(처음 부팅 때 DB 계정을 만듦).

```bash
put() { aws ssm put-parameter --name "$1" --type SecureString --value "$2" --overwrite >/dev/null; }
put /wolgyeham/db/POSTGRES_PASSWORD "$(openssl rand -hex 24)"
for e in dev prod; do
  put /wolgyeham/$e/DB_PASSWORD "$(openssl rand -hex 24)"
  put /wolgyeham/$e/SESSION_SECRET "$(openssl rand -hex 32)"
done
```

카카오·웹 푸시 값은 발급한 뒤 같은 방식으로 넣습니다: `APP_ORIGIN`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (각각 `/wolgyeham/dev/`, `/wolgyeham/prod/` 아래).

## 6. 앱 서버 (EC2)

```bash
# 인스턴스 역할
aws iam create-role --role-name wolgyeham-ec2 --tags Key=Project,Value=wolgyeham --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name wolgyeham-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name wolgyeham-ec2 --policy-name wolgyeham-app \
  --policy-document "$(fill infra/aws/ec2-instance-policy.json)"
aws iam create-instance-profile --instance-profile-name wolgyeham-ec2
aws iam add-role-to-instance-profile --instance-profile-name wolgyeham-ec2 --role-name wolgyeham-ec2

# 보안 그룹: CloudFront에서 오는 8081~8082만 허용, SSH 없음
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group --group-name wolgyeham-app --vpc-id $VPC_ID \
  --description "Wolgyeham API from CloudFront only" --query GroupId --output text)
CF_PL=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --ip-permissions "IpProtocol=tcp,FromPort=8081,ToPort=8082,PrefixListIds=[{PrefixListId=$CF_PL}]"

# 인스턴스 (Amazon Linux 2023, t3.micro, 암호화된 20GB, IMDSv2)
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)
INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --iam-instance-profile Name=wolgyeham-ec2 --security-group-ids $SG_ID \
  --user-data file://infra/server/bootstrap.sh --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Project,Value=wolgyeham},{Key=Role,Value=app},{Key=Name,Value=wolgyeham-app}]' \
    'ResourceType=volume,Tags=[{Key=Project,Value=wolgyeham}]' \
  --query 'Instances[0].InstanceId' --output text)

# 고정 주소 (CloudFront 원본이 바뀌지 않게)
ALLOC=$(aws ec2 allocate-address --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Project,Value=wolgyeham}]' \
  --query AllocationId --output text)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC
aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicDnsName' --output text
```

역할을 만든 직후 `run-instances`가 실패하면 10초쯤 뒤 다시 실행합니다. 마지막 줄의 퍼블릭 DNS(`ec2-…compute.amazonaws.com`)를 7단계에서 씁니다.

서버 설정 파일을 만듭니다(비밀값 아님, [server.env.example](../infra/server/server.env.example)).

```bash
aws ssm send-command --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript --parameters \
  "commands=[\"printf 'AWS_REGION=$AWS_REGION\\nAPI_IMAGE=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/wolgyeham-api\\nOPS_BUCKET=$OPS_BUCKET\\n' > /opt/wolgyeham/server.env\"]"
```

## 7. API용 CloudFront (dev, prod 두 개)

[cloudfront-api.json](../infra/aws/cloudfront-api.json)은 dev용입니다. prod는 `CallerReference`와 `Comment`를 prod로, `HTTPPort`를 `8082`로 바꿔 한 번 더 만듭니다. 캐시를 끄고(`CachingDisabled`), Host를 뺀 모든 헤더·쿠키를 원본에 넘깁니다(`AllViewerExceptHostHeader`).

```bash
EC2_DNS=<6단계의 퍼블릭 DNS>
sed "s/<EC2_PUBLIC_DNS>/$EC2_DNS/" infra/aws/cloudfront-api.json > /tmp/cf-dev.json
aws cloudfront create-distribution --distribution-config file:///tmp/cf-dev.json \
  --query 'Distribution.[Id,DomainName]' --output text
```

두 도메인(`d…cloudfront.net`)을 적어 둡니다. 배포가 끝나면(몇 분) 확인합니다: `curl https://<dev 도메인>/api/health`는 첫 API 배포 뒤에 `ok`를 돌려줍니다.

## 8. GitHub 배포 권한 (OIDC)

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
aws iam create-role --role-name wolgyeham-github-deploy --tags Key=Project,Value=wolgyeham \
  --assume-role-policy-document "$(fill infra/aws/github-oidc-trust.json)"
aws iam put-role-policy --role-name wolgyeham-github-deploy --policy-name deploy \
  --policy-document "$(fill infra/aws/github-deploy-policy.json)"
```

신뢰 정책은 이 저장소의 `main`과 `release`에서 실행한 워크플로만 역할을 받게 합니다. 저장소 변수를 넣습니다.

```bash
R=2026-KW-HACKATHON/24_3355
gh variable set AWS_DEPLOY_ROLE_ARN --repo $R --body arn:aws:iam::$ACCOUNT_ID:role/wolgyeham-github-deploy
gh variable set ECR_REPOSITORY --repo $R --body wolgyeham-api
gh variable set OPS_BUCKET --repo $R --body $OPS_BUCKET
gh variable set DEV_API_BASE_URL --repo $R --body https://<dev CloudFront 도메인>
gh variable set PROD_API_BASE_URL --repo $R --body https://<prod CloudFront 도메인>
```

## 9. 웹 (Amplify 앱 두 개)

콘솔 → Amplify → 새 앱 → GitHub 연결(조직 `2026-KW-HACKATHON` 접근 승인) → 저장소 `24_3355`.

| 앱 | 브랜치 | 설정 |
|---|---|---|
| `wolgyeham-dev` | `main` | 모노레포, 앱 루트 `apps/web`. 환경 변수 `AMPLIFY_MONOREPO_APP_ROOT=apps/web`. **미리 보기(Previews) 켜기** |
| `wolgyeham-prod` | `release` | 같은 설정, 미리 보기 끄기 |

빌드 설정은 저장소의 [amplify.yml](../amplify.yml)을 씁니다. `/api` 프록시 규칙을 넣습니다.

```bash
sed "s/<DEV_API_CLOUDFRONT_DOMAIN>/<dev CloudFront 도메인>/" infra/amplify/rewrites.dev.json > /tmp/rw-dev.json
aws amplify update-app --app-id <dev 앱 ID> --custom-rules file:///tmp/rw-dev.json
# prod도 rewrites.prod.json으로 같은 방식
```

처음 한 번 `release` 브랜치를 만듭니다: `git push origin origin/main:release`

## 10. 카카오 로그인

카카오 디벨로퍼스에서 앱을 만들고 도메인과 Redirect URI를 등록합니다.

| 환경 | 사이트 도메인 | Redirect URI |
|---|---|---|
| local | `http://localhost:5173` | `http://localhost:5173/api/auth/kakao/callback` |
| dev | dev Amplify 주소 | `<dev 주소>/api/auth/kakao/callback` |
| prod | prod Amplify 주소 | `<prod 주소>/api/auth/kakao/callback` |

PR 미리 보기 주소는 매번 달라서 등록하지 않습니다. 발급한 키는 5단계처럼 SSM에 넣습니다.

## 11. 첫 배포 확인

- [ ] Actions → Deploy API → Run workflow(dev)가 성공한다
- [ ] `https://<dev CloudFront>/api/health`가 `ok`
- [ ] dev 웹 주소에서 화면이 뜨고 `<dev 웹>/api/swagger`가 열린다 (Amplify 프록시 확인)
- [ ] dev 웹에서 카카오 로그인 후 새로고침해도 로그인이 유지된다 (프록시로 쿠키가 오가는지 확인)
- [ ] `aws logs tail /wolgyeham/dev`에 요청 로그가 보인다
- [ ] 다음 날 S3 `backups/`에 dump 파일이 생겼다
- [ ] 팀원이 `aws sso login --profile wolgyeham` 후 로그를 볼 수 있다

## 12. 정리 (전시가 끝난 뒤)

prod 백업을 받아 둔 뒤 역순으로 지웁니다: Amplify 앱 2개 → CloudFront 2개(비활성화 후 삭제) → EC2와 탄력적 IP → ECR 저장소 → S3 버킷 → SSM 파라미터 `/wolgyeham/*` → 로그 그룹 → IAM 역할·OIDC 공급자 → Identity Center 사용자. 예산은 마지막 청구서를 확인한 뒤 지웁니다. 실제 사용자 데이터가 남은 백업은 보관 기간이 지나면 지웁니다.
