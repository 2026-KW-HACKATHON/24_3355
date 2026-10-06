# AWS 준비 절차 (관리자용)

관리자가 한 번 따라 하면 dev·prod 배포가 돌아가도록 순서대로 적었습니다. 팀원은 3단계에서 받은 초대만 수락하면 됩니다. 구조는 [architecture.md](architecture.md), 매일 쓰는 방법은 [deploy.md](deploy.md)를 봅니다.

- 담당: 관리자(@kyowon1108). 이 절차의 명령은 계정·권한·비용을 바꾸므로 관리자가 직접 실행합니다. AI 도구에게 대신 실행시키지 않습니다.
- 리전: 서울 `ap-northeast-2`. 모든 리소스에 `Project=wolgyeham` 태그를 붙입니다.
- 정책 파일: [infra/aws/](../infra/aws/). `<ACCOUNT_ID>`, `<OPS_BUCKET>`, `<ALERT_EMAIL>` 같은 자리는 실행 전에 바꿉니다.

## 스크립트로 한 번에

아래 단계는 스크립트 세 개로 묶여 있습니다. 관리자가 저장소 루트에서 직접 실행합니다. 이미 있는 리소스는 건너뛰므로 다시 실행해도 됩니다.

```bash
aws login                                                     # 처음 한 번은 루트로
bash infra/aws/setup-iam.sh <관리자 이름> <개발자 이름> <개발자 이름>   # 3단계 (3-B 방식)
aws login                                                     # 이제 관리자 IAM 사용자로
bash infra/aws/setup-infra.sh <예산 알림 이메일>                # 2·4~8단계 (원본 HTTPS 포함)
# 콘솔에서 Amplify 앱 두 개를 GitHub에 연결 (9단계 표)
bash infra/aws/setup-amplify.sh <dev 앱 ID> <prod 앱 ID>        # 9단계 나머지
```

아래는 각 단계가 무엇을 하는지와 수동으로 할 때의 명령입니다. 이미 원본이 HTTP로 돌고 있는 환경을 HTTPS로 옮기는 절차는 [7-A](#7-a-원본-https로-옮기기-이미-돌고-있는-환경)입니다.

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

## 3. 팀원 계정

지금은 **3-B(IAM 사용자 + 콘솔 비밀번호 + MFA, 액세스 키 없음)**로 합니다. 이 계정은 Organizations를 쓰지 않아 Identity Center를 켜려면 조직부터 만들어야 하기 때문입니다. 나중에 조직을 만들면 아래 Identity Center 방식으로 옮길 수 있습니다.

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
  put /wolgyeham/$e/ORIGIN_VERIFY_SECRET "$(openssl rand -hex 32)"   # 7단계, 없으면 deploy.sh가 멈춤
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

# 보안 그룹: CloudFront에서 오는 443(caddy)과 인증서 발급용 80만 허용, SSH 없음
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group --group-name wolgyeham-app --vpc-id $VPC_ID \
  --description "Wolgyeham API from CloudFront only" --query GroupId --output text)
CF_PL=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --ip-permissions \
  "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$CF_PL,Description=CloudFront to Caddy}]" \
  "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=ACME HTTP-01 and redirect only}]"

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
EIP=$(aws ec2 describe-addresses --allocation-ids $ALLOC --query 'Addresses[0].PublicIp' --output text)
ORIGIN_DOMAIN=${EIP//./-}.sslip.io   # 예: 13-124-0-10.sslip.io. 팀 도메인이 있으면 그 하위 이름
```

역할을 만든 직후 `run-instances`가 실패하면 10초쯤 뒤 다시 실행합니다. CloudFront 목록은 보안 그룹 규칙 55개로 세고 기본 한도가 60이라, 이 목록을 쓰는 규칙은 하나만 둡니다.

서버 설정 파일을 만듭니다(비밀값 아님, [server.env.example](../infra/server/server.env.example)). `AWS_REGION`, `API_IMAGE`, `OPS_BUCKET`에 더해 원본 이름 `ORIGIN_DOMAIN`과 인증서 연락 주소 `ACME_EMAIL`이 있어야 deploy.sh가 돕니다. `setup-infra.sh`의 "서버 설정 파일" 단계가 SSM Run Command로 이 파일을 씁니다(연락 주소는 예산 알림 이메일).

**원본 이름(`ORIGIN_DOMAIN`)과 인증서.** CloudFront는 IP를 원본으로 받지 않고, HTTPS 원본에는 이름에 맞는 공인 인증서가 필요합니다. 도메인을 사지 않으므로 [sslip.io](https://sslip.io)를 씁니다: `<무엇이든>.<a-b-c-d>.sslip.io`를 IP `a.b.c.d`로 풀어 주는 공개 DNS입니다(`dev.13-124-0-10.sslip.io` → `13.124.0.10`, TTL 1시간). 서버의 caddy가 `dev.<ORIGIN_DOMAIN>`, `prod.<ORIGIN_DOMAIN>` 인증서를 Let's Encrypt에서 HTTP-01(80번)로 받고 알아서 갱신합니다.

- **외부 의존:** sslip.io(개인 두 명이 운영, nip.io와 통합)의 DNS가 멈추면 CloudFront가 원본을 찾지 못하고 인증서 갱신도 실패합니다. 이름을 IP에서 만들므로 탄력적 IP를 바꾸면 이름도 바뀝니다.
- **발급 한도:** sslip.io는 공개 접미사 목록(PSL)에 없어 모든 사용자가 Let's Encrypt의 `sslip.io` 도메인 한도를 함께 씁니다(기본 주 50장을 sslip.io는 25만 장까지 늘려 받음). 한도에 걸리면 caddy가 ZeroSSL로 받습니다(`ACME_EMAIL` 필요, 이 주소가 ZeroSSL 계정으로 등록됨).
- **팀 도메인으로 바꾸기:** 코드 변경 없이 이름만 바꿉니다. 도메인의 DNS에 `dev.<원본 이름>`, `prod.<원본 이름>` A 레코드를 탄력적 IP로 넣은 뒤 `switch-origin-tls.sh`를 `rollback` → `ORIGIN_DOMAIN=<원본 이름> … prepare <이메일>` → Deploy API(dev, caddy가 새 이름으로 인증서를 받음) → `ORIGIN_DOMAIN=<원본 이름> … switch` → `… cleanup` 순서로 실행합니다. 먼저 `rollback`으로 CloudFront를 HTTP 원본으로 돌려 두는 이유는, 배포한 caddy가 예전 이름의 인증서를 더 내주지 않아 `switch`까지 몇 분 동안 끊기기 때문입니다.

## 7. API용 CloudFront (dev, prod 두 개)

[cloudfront-api.json](../infra/aws/cloudfront-api.json)은 dev용입니다. 원본은 `https://dev.<ORIGIN_DOMAIN>`(443, `https-only`, TLS 1.2)이고, prod는 `CallerReference`와 `Comment`를 prod로, `DomainName`을 `prod.<ORIGIN_DOMAIN>`으로 바꿔 한 번 더 만듭니다. 캐시를 끄고(`CachingDisabled`), Host를 뺀 모든 헤더·쿠키를 원본에 넘깁니다(`AllViewerExceptHostHeader`). 그래서 caddy가 받는 Host는 원본 이름이고, 그 이름으로 dev·prod를 나눕니다.

```bash
SECRET=$(aws ssm get-parameter --name /wolgyeham/dev/ORIGIN_VERIFY_SECRET --with-decryption --query Parameter.Value --output text)
(umask 077; sed -e "s/<ORIGIN_HOST>/dev.$ORIGIN_DOMAIN/" -e "s/<ORIGIN_VERIFY_SECRET>/$SECRET/" \
  infra/aws/cloudfront-api.json > /tmp/cf-dev.json)
aws cloudfront create-distribution --distribution-config file:///tmp/cf-dev.json \
  --query 'Distribution.[Id,DomainName]' --output text
rm /tmp/cf-dev.json; unset SECRET
```

두 도메인(`d…cloudfront.net`)을 적어 둡니다. 배포가 끝나면(몇 분) 확인합니다: `curl https://<dev 도메인>/api/health`는 첫 API 배포 뒤 caddy가 인증서를 받으면 `ok`를 돌려줍니다.

원본 확인 헤더: CloudFront는 EC2로 넘길 때 `X-Origin-Verify` 헤더에 SSM `/wolgyeham/<env>/ORIGIN_VERIFY_SECRET` 값을 붙입니다. caddy는 값이 그 환경과 다르면 403으로 막고(다른 사람의 CloudFront 배포로 들어오는 요청), API는 이 헤더가 맞을 때만 `X-Forwarded-For`를 믿습니다([decisions.md](decisions.md) D-23). caddy는 CloudFront가 만든 `X-Forwarded-For`를 그대로 넘기므로 API가 보는 체인 모양은 원본이 HTTP일 때와 같습니다. `setup-infra.sh`는 새로 만들 때 헤더를 넣습니다.

비밀값을 바꿀 때는 `aws ssm put-parameter --overwrite`로 새 값을 넣고 `bash infra/aws/add-origin-verify.sh`(CloudFront에 반영)와 Deploy API(dev, prod)를 이어서 실행합니다. CloudFront가 새 값을 보내기 시작한 때부터 배포가 끝날 때까지 몇 분 동안 caddy가 403을 돌려주므로 사용자가 적은 때에 합니다.

## 7-A. 원본 HTTPS로 옮기기 (이미 돌고 있는 환경)

[D-31](decisions.md) 반영 절차입니다. 새로 만드는 환경은 위 6·7단계가 처음부터 HTTPS로 만들므로 필요 없습니다. [switch-origin-tls.sh](../infra/aws/switch-origin-tls.sh)를 단계마다 실행하며, 모든 단계는 `--dry-run`으로 먼저 바꿀 내용을 볼 수 있고 다시 실행해도 됩니다. 원본 이름은 탄력적 IP로 만든 `<a-b-c-d>.sslip.io`가 기본입니다(팀 도메인은 `ORIGIN_DOMAIN=<원본 이름>`을 앞에 붙임).

1. **준비 (caddy 변경을 병합하기 전에).** 이 단계 없이 배포하면 deploy.sh가 아무것도 바꾸지 않고 멈춥니다.
   ```bash
   bash infra/aws/switch-origin-tls.sh prepare <인증서 연락 이메일> --dry-run
   bash infra/aws/switch-origin-tls.sh prepare <인증서 연락 이메일>
   ```
   SSM `ORIGIN_VERIFY_SECRET`(dev·prod)이 없으면 만들고, 지금 CloudFront(아직 HTTP)에 `X-Origin-Verify` 헤더를 붙이고, 보안 그룹의 CloudFront 규칙을 `8081-8082` → `443-8082`로 넓히고(규칙을 새로 더하면 한도 60을 넘음) 80을 전체에 엽니다. 서버 `server.env`에는 `ORIGIN_DOMAIN`, `ACME_EMAIL`, 옮기는 동안만 쓰는 `API_BIND_ADDRESS=0.0.0.0`(API 포트를 지금처럼 공개해 HTTP 원본이 계속 동작)을 씁니다.
2. **caddy 배포.** caddy가 들어간 변경을 `main`에 병합합니다(dev 배포). 병합이 늦으면 Actions → Deploy API → dev를 수동 실행합니다. dev 배포 한 번이 dev·prod 원본 이름의 인증서를 모두 받습니다.
3. **인증서 확인.** SSM 세션에서 두 이름이 모두 보여야 합니다(보통 1분 안).
   ```bash
   cd /opt/wolgyeham && docker compose --env-file server.env --env-file .deploy.env logs caddy | grep -i 'certificate obtained'
   ```
4. **CloudFront 전환.** 서버 안에서 `https://<env>.<ORIGIN_DOMAIN>`이 헤더 없이 403, 헤더와 함께 200(아직 배포하지 않은 환경은 502)인지 먼저 확인하고, 아니면 아무것도 바꾸지 않습니다. 맞으면 두 CloudFront의 원본을 `https-only`·443·원본 이름으로 바꾸고 반영을 기다린 뒤 `/api/health`를 확인합니다.
   ```bash
   bash infra/aws/switch-origin-tls.sh switch --dry-run
   bash infra/aws/switch-origin-tls.sh switch
   ```
5. **확인.** dev·prod 웹 주소의 `/api/health`(Amplify 경유), 카카오 로그인 뒤 새로고침, dev의 `/api/dev/whoami`에서 `mode`가 `origin-verify`이고 `forwardedFor`가 예전과 같은 모양(직접 `[나]`, Amplify `[나, CloudFront, 서울 EC2]`)인지 봅니다.
6. **정리.** `server.env`에서 `API_BIND_ADDRESS`를 지우고 API 컨테이너를 다시 만들어 8081·8082를 서버 안(127.0.0.1)에서만 열고, 보안 그룹의 CloudFront 규칙을 443만 남깁니다. 몇 초 끊깁니다.
   ```bash
   bash infra/aws/switch-origin-tls.sh cleanup
   ```

4·5단계에서 문제가 있으면 `bash infra/aws/switch-origin-tls.sh rollback`이 보안 그룹을 `443-8082`로 넓히고 API 포트를 다시 공개한 뒤 CloudFront를 예전 HTTP 원본(EC2 퍼블릭 DNS 8081·8082)으로 되돌립니다. caddy와 80 규칙은 남겨 두고, 원인을 고친 뒤 `switch`를 다시 실행합니다. 6단계 뒤에도 같은 명령으로 되돌릴 수 있습니다.

## 8. GitHub 배포 권한 (OIDC)

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
aws iam create-role --role-name wolgyeham-github-deploy --tags Key=Project,Value=wolgyeham \
  --assume-role-policy-document "$(fill infra/aws/github-oidc-trust.json)"
aws iam put-role-policy --role-name wolgyeham-github-deploy --policy-name deploy \
  --policy-document "$(fill infra/aws/github-deploy-policy.json)"
```

신뢰 정책은 이 저장소의 `main`과 `release`에서 실행한 워크플로만 역할을 받게 합니다. 이 저장소는 GitHub OIDC의 불변 식별자 형식(`use_immutable_subject`)을 써서 토큰의 `sub`가 `repo:2026-KW-HACKATHON@329474081/24_3355@1373145913:ref:refs/heads/main`처럼 조직·저장소 ID를 포함합니다. 신뢰 정책에는 이 형식과 이름만 쓰는 형식을 둘 다 넣어 둡니다. 형식은 `gh api repos/2026-KW-HACKATHON/24_3355/actions/oidc/customization/sub`로 확인하고, 정책을 고쳤으면 `aws iam update-assume-role-policy --role-name wolgyeham-github-deploy --policy-document "$(fill infra/aws/github-oidc-trust.json)"`로 반영합니다.

저장소 변수를 넣습니다.

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
- [ ] caddy 로그에 `dev.<ORIGIN_DOMAIN>`, `prod.<ORIGIN_DOMAIN>`의 `certificate obtained`가 있다(7-A 3번 명령)
- [ ] `https://<dev CloudFront>/api/health`가 `ok`
- [ ] dev 웹 주소에서 화면이 뜨고 `<dev 웹>/api/swagger`가 열린다 (Amplify 프록시 확인)
- [ ] dev 웹에서 카카오 로그인 후 새로고침해도 로그인이 유지된다 (프록시로 쿠키가 오가는지 확인)
- [ ] `aws logs tail /wolgyeham/dev`에 요청 로그가 보인다
- [ ] 다음 날 S3 `backups/`에 dump 파일이 생겼다
- [ ] 팀원이 `aws sso login --profile wolgyeham` 후 로그를 볼 수 있다

## 12. 정리 (전시가 끝난 뒤)

prod 백업을 받아 둔 뒤 역순으로 지웁니다: Amplify 앱 2개 → CloudFront 2개(비활성화 후 삭제) → EC2와 탄력적 IP → ECR 저장소 → S3 버킷 → SSM 파라미터 `/wolgyeham/*` → 로그 그룹 → IAM 역할·OIDC 공급자 → Identity Center 사용자. 예산은 마지막 청구서를 확인한 뒤 지웁니다. 실제 사용자 데이터가 남은 백업은 보관 기간이 지나면 지웁니다.
