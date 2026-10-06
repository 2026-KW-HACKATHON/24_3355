# 배포와 운영

팀원 모두가 자기 작업을 어디서 보고, 배포가 언제 일어나고, 문제가 생기면 어떻게 되돌리는지 정리합니다. 구조는 [architecture.md](architecture.md), AWS 준비는 [aws-setup.md](aws-setup.md)를 봅니다.

- 기준: [CONTRIBUTING.md](../CONTRIBUTING.md)(브랜치·PR), [.github/workflows/deploy-api.yml](../.github/workflows/deploy-api.yml), [amplify.yml](../amplify.yml), [infra/server/](../infra/server/)
- 담당: 공통 계약·인프라·통합 영역. 배포 자체는 사람이 하지 않고 PR 병합이 대신합니다.

## 내 작업을 보는 곳

| 보고 싶은 것 | 주소 | 비고 |
|---|---|---|
| 내 컴퓨터에서 | `pnpm dev` → 웹 `http://localhost:5173`, API 문서 `http://localhost:5173/api/swagger` | DB는 `pnpm db:up` |
| 내 PR의 화면 | Amplify가 PR에 남기는 미리 보기 주소 | 웹만 PR 코드. API는 dev를 씀. 카카오 로그인 안 됨 |
| 팀이 합친 결과 | https://main.d3oykk6yk6i4p7.amplifyapp.com | `main` 반영 후 몇 분 안 |
| dev API 문서 | `<dev 웹 주소>/api/swagger`, `/api/docs` | 백엔드 PR이 병합되면 바로 반영 |
| 실제 서비스 | https://release.dfldu21sxhojf.amplifyapp.com | 관리자가 `release`를 올릴 때만 바뀜 |

dev는 GitHub에 연결된 Amplify 앱입니다. prod는 같은 저장소의 `release`를 GitHub Actions에서 빌드해 정적 결과물만 올립니다. GitHub 연결 토큰을 복제하거나 새 서버를 만들지 않습니다.

## 배포가 일어나는 때

| 일 | 웹 (Amplify) | API (GitHub Actions) |
|---|---|---|
| PR을 열거나 커밋을 올림 | dev 앱이 미리 보기를 만듦 | `ci.yml`만 실행 (배포 없음) |
| `main`에 병합 | dev 앱이 빌드·배포 | `apps/api`, `packages/contracts`, `infra/server`가 바뀌었으면 `pnpm check` → 이미지 빌드 → dev 배포 |
| 관리자가 `release`를 올림 | API 배포 성공 뒤 Actions에서 빌드·배포 | 같은 과정으로 prod 배포 |
| 수동 실행 | Amplify 콘솔에서 다시 배포 | Actions의 Deploy API → Run workflow → dev 선택 (prod는 `release`에서만) |

`release`는 관리자만 올립니다.

dev·prod는 서버 설정과 태그 파일을 공유하므로 배포 워크플로 전체를 한 번에 하나씩 실행합니다. 뒤에 온 배포는 앞선 배포가 끝날 때까지 기다립니다. release에서 dev를 수동 배포해도 prod 웹은 바뀌지 않습니다.

prod 웹 배포에 필요한 저장소 변수는 `PROD_WEB_APP_ID=dfldu21sxhojf`, `PROD_WEB_BASE_URL=https://release.dfldu21sxhojf.amplifyapp.com`입니다. 배포 역할에는 `infra/aws/prod-web-deploy-policy.json`의 두 자리표시자를 실제 값으로 바꾼 정책을 추가합니다. 권한은 prod 앱의 release 브랜치 업로드·배포·상태 조회로 제한합니다.

자동 배포가 막혔을 때 웹만 올리는 명령은 다음과 같습니다. 서명된 업로드 URL은 스크립트가 출력하지 않습니다.

```bash
VITE_PUBLIC_ORIGIN=https://release.dfldu21sxhojf.amplifyapp.com pnpm --filter @wolgyeham/web build
bash infra/amplify/deploy-web.sh dfldu21sxhojf release apps/web/dist
```

```bash
git fetch origin
git push origin origin/main:release   # main의 현재 상태를 prod로
```

## API 배포 순서

[deploy-api.yml](../.github/workflows/deploy-api.yml)이 아래를 차례로 합니다. 하나라도 실패하면 멈춥니다.

1. `pnpm check`
2. OIDC로 AWS 역할을 받음 (저장소에 키 없음)
3. `apps/api/Dockerfile`로 이미지를 만들어 ECR에 `커밋 SHA` 태그로 올림
4. `infra/server/`를 S3에 올리고, SSM Run Command로 EC2에서 [deploy.sh](../infra/server/deploy.sh) 실행
5. deploy.sh: SSM의 비밀값으로 환경 파일 작성 → caddy 설정 확인·반영 → 이미지 받기 → DB 마이그레이션(있으면) → 새 컨테이너 시작 → `/api/health` 확인. 실패하면 직전 태그로 자동으로 되돌림
6. 공개 주소로 `/api/health` 한 번 더 확인

## 관리자가 직접 배포하기 (자동 배포를 쓸 수 없을 때)

GitHub Actions가 역할을 받지 못하는 등 자동 배포가 막혔을 때 관리자가 로컬에서 같은 순서를 밟습니다. 개발자 권한으로는 할 수 없습니다(ECR push·SSM Run Command 필요). 웹(Amplify)은 git 연결이라 이 방법으로 올릴 수 없습니다.

```bash
aws login                                   # 관리자 세션
ACCT=$(aws sts get-caller-identity --query Account --output text)
REG=$ACCT.dkr.ecr.ap-northeast-2.amazonaws.com
TAG=manual-$(date +%Y%m%d-%H%M)
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t $REG/wolgyeham-api:$TAG --load .   # EC2는 x86_64
aws ecr get-login-password | docker login --username AWS --password-stdin $REG
docker push $REG/wolgyeham-api:$TAG
aws s3 sync infra/server s3://wolgyeham-ops-$ACCT/server --delete --only-show-errors
aws ssm send-command --instance-ids <인스턴스 ID> --document-name AWS-RunShellScript \
  --parameters "commands=[\"aws s3 sync s3://wolgyeham-ops-$ACCT/server /opt/wolgyeham --only-show-errors\",\"chmod +x /opt/wolgyeham/*.sh /opt/wolgyeham/postgres-init/*.sh\",\"/opt/wolgyeham/deploy.sh dev $TAG\"]"
curl https://<dev 도메인>/api/health
```

- 태그는 커밋 SHA 대신 날짜 태그를 씁니다. `deploy.sh`가 직전 태그를 기록하므로 `--rollback`은 그대로 동작합니다.
- 배포된 마이그레이션 파일은 이름과 내용을 바꾸지 않습니다. 나중에 커밋을 나눠 올릴 때도 같은 파일을 씁니다.

## 배포 순서와 주의

- **API를 먼저, 웹을 나중에** 배포합니다. 웹은 새 응답 필드(`termsUpToDate`, `confirmedAt` 등)를 기대하므로, 이전 API와 새 웹이 만나면 일부 화면이 불러오기 오류가 날 수 있습니다(웹은 한 번의 배포 사이 동안 빠진 필드를 모르는 값으로 넘기도록 되어 있지만, 순서를 지키는 것이 기본입니다). PR 미리 보기는 dev API를 쓰므로 새 필드가 필요한 PR은 API가 dev에 먼저 올라간 뒤 확인합니다.
- **마이그레이션 0009(건물 확인·약관 동의)를 처음 배포한 뒤에는** dev에서 시연 데이터를 한 번 되돌립니다. 백필 때문에 이전 시연에서 관리자가 생긴 새봄하우스가 ‘확인됨’이 되어 초대 → 23 흐름이 건너뛰어지기 때문입니다: SSM 세션에서 `docker compose --env-file server.env --env-file .deploy.env run --rm --no-deps api-dev node seed.mjs --reset-demo`.
- CloudFront → EC2 구간은 서버의 caddy가 HTTPS로 받습니다(D-31). 이미 돌던 환경은 관리자가 [aws-setup.md 7-A](aws-setup.md#7-a-원본-https로-옮기기-이미-돌고-있는-환경)를 끝내기 전까지 HTTP입니다. 브라우저 → CloudFront는 HTTPS입니다.
- `infra/server/caddy/Caddyfile`과 caddy 서비스는 dev·prod가 같이 씁니다. `main` 병합(dev 배포)으로 바뀐 Caddyfile은 prod 요청에도 바로 적용되므로, 이 파일을 고치는 PR은 관리자가 리뷰합니다.

## 원본 HTTPS(caddy)

서버에서 밖으로 열린 입구는 caddy 컨테이너 하나입니다. 443은 CloudFront에서만 받고 `dev.<ORIGIN_DOMAIN>` → api-dev, `prod.<ORIGIN_DOMAIN>` → api-prod로 넘기며, `X-Origin-Verify`가 그 환경 값과 다르면 403입니다. 80은 인증서 발급 확인과 HTTPS 안내만 합니다. API 포트 8081·8082는 서버 안(127.0.0.1)에서만 열려 deploy.sh의 상태 확인에 씁니다. 원본 이름(`ORIGIN_DOMAIN`, 기본 `<탄력적 IP>.sslip.io`)과 인증서 연락 주소(`ACME_EMAIL`)는 `server.env`에 있고, deploy.sh가 이 값과 SSM `ORIGIN_VERIFY_SECRET`으로 `env/caddy.env`(root만 읽음)를 만듭니다.

- 배포 때 deploy.sh는 버리는 컨테이너에서 `caddy validate`로 설정을 먼저 확인하고(실패하면 API를 건드리지 않고 멈춤), `env/caddy.env`가 바뀌었으면 caddy를 다시 만들고, 바뀐 Caddyfile은 `caddy reload`로 끊김 없이 읽힙니다. 잘못된 Caddyfile로 reload하면 이전 설정이 그대로 돕니다.
- 인증서는 `caddy-data` 볼륨에 남고 만료 전에 caddy가 갱신합니다. 이 볼륨을 지우면 다시 발급받으므로 지우지 않습니다.
- caddy는 접근 로그를 남기지 않습니다(클라이언트 주소를 로그에 두지 않음). 시작·인증서 발급·갱신 로그만 있고 CloudWatch가 아니라 서버의 Docker 로그(10MB × 3)에 남습니다.

SSM 세션에서 상태를 봅니다.

```bash
cd /opt/wolgyeham
docker compose --env-file server.env --env-file .deploy.env ps caddy
docker compose --env-file server.env --env-file .deploy.env logs --tail 100 caddy
docker compose --env-file server.env --env-file .deploy.env logs caddy | grep -iE 'certificate obtained|renew|error'
```

| 로그 | 뜻 | 할 일 |
|---|---|---|
| `certificate obtained successfully` (이름마다 한 번) | 발급 성공 | 없음 |
| `challenge failed`, `connection refused`/`timeout` (http-01) | 80번이 밖에서 안 닿음 | 보안 그룹의 80 전체 허용 규칙, `ORIGIN_DOMAIN`이 탄력적 IP를 가리키는지(`dig +short dev.<ORIGIN_DOMAIN>`) 확인 |
| `rateLimited`, `too many certificates` | Let's Encrypt 한도 | caddy가 ZeroSSL로 넘어갑니다. ZeroSSL도 실패하면 `ACME_EMAIL`을 확인. caddy는 최대 하루 간격으로 30일까지 다시 시도합니다 |
| `no such host`(api-dev·api-prod) 또는 응답 502 | 그 API 컨테이너가 없음·멈춤 | 그 환경을 배포 |

caddy만 다시 띄우려면 `docker compose --env-file server.env --env-file .deploy.env up -d --no-deps --force-recreate caddy`(dev·prod 모두 1~2초 끊김).

## 로그 보기

개발자 권한으로 CloudWatch Logs를 볼 수 있습니다.

```bash
aws logs tail /wolgyeham/dev --follow --profile wolgyeham
```

콘솔의 Logs Insights에서는 이렇게 찾습니다.

```text
fields @timestamp, level, event, requestId
| filter level = "error"
| sort @timestamp desc
| limit 50
```

로그에는 이름, 카카오 계정 번호, 토큰, 제보·팁·메모 본문을 남기지 않습니다([backend.md](backend.md)).

## 서버에 들어가기

SSH를 쓰지 않고 SSM Session Manager로 들어갑니다(22번 포트를 열지 않음). 로컬에 Session Manager 플러그인이 필요합니다.

```bash
aws ssm start-session --target <인스턴스 ID> --profile wolgyeham
sudo -i
cd /opt/wolgyeham
docker compose --env-file server.env --env-file .deploy.env ps
```

서버 안에서 API를 직접 부를 때는 `curl http://127.0.0.1:8081/api/health`(prod 8082)입니다. 서버에서 파일을 직접 고치지 않습니다. 다음 배포 때 덮어써집니다. 바꿀 것은 `infra/server/`에서 PR로 고칩니다.

dev 시연 데이터(햇살빌라·새봄하우스)를 처음 상태로 되돌리려면 위 세션에서 `docker compose --env-file server.env --env-file .deploy.env run --rm --no-deps api-dev node seed.mjs --reset-demo`를 실행합니다(dev의 `DEMO_MODE=true`일 때만 동작, 다른 건물은 건드리지 않음. [database.md §8](database.md#8-시드시연-데이터)).

## 환경 변수 추가하기

1. `apps/api/src/lib/env.ts`의 zod 스키마와 `apps/api/.env.example`에 키를 추가합니다(값은 샘플).
2. PR 본문에 "새 환경 변수: KEY (dev·prod 값 필요)"라고 적습니다.
3. 관리자가 병합 전에 SSM에 값을 넣습니다.
   ```bash
   aws ssm put-parameter --name /wolgyeham/dev/KEY --type SecureString --value '<값>' --overwrite
   ```
4. 병합하면 deploy.sh가 새 값을 읽어 컨테이너를 다시 띄웁니다.

웹에서 쓰는 값은 `VITE_`로 시작하고 브라우저에 공개됩니다. 비밀값을 넣지 않습니다. Amplify 콘솔의 환경 변수에 넣습니다.

| 웹 값 | dev | prod | 용도 |
|---|---|---|---|
| `VITE_PUBLIC_ORIGIN` | `https://main.d3oykk6yk6i4p7.amplifyapp.com` | `https://release.dfldu21sxhojf.amplifyapp.com` | 인쇄하는 QR·입주 카드·공유 링크에 넣는 공개 주소. 비우면 지금 창의 주소를 씁니다(PR 미리 보기 주소가 QR에 박히지 않게 dev·prod에는 꼭 넣습니다) |

Amplify 환경 변수는 앱 단위로 통째로 바뀌므로, CLI로 넣을 때는 기존 값을 읽어 합친 뒤 넣습니다: `aws amplify get-app --app-id <앱 ID> --query app.environmentVariables`로 확인하고 `aws amplify update-app --app-id <앱 ID> --environment-variables <기존 값>,VITE_PUBLIC_ORIGIN=<주소>`. 콘솔(앱 설정 → 환경 변수)에서 하나만 추가해도 됩니다.

웹 푸시 키(VAPID)는 환경마다 따로 만들고, 개인키가 화면·로그에 남지 않게 바로 SSM에 넣습니다. 셋 중 하나라도 없으면 API는 알림을 보내지 않고(`publicKey: null`), 웹은 ‘알림을 보내지 않고 있어요’ 분기를 보여줍니다.

```bash
ENV=dev   # 또는 prod
KEYS=$(pnpm --filter @wolgyeham/api exec web-push generate-vapid-keys --json)
aws ssm put-parameter --name /wolgyeham/$ENV/VAPID_PUBLIC_KEY --type SecureString --overwrite --value "$(echo "$KEYS" | jq -r .publicKey)"
aws ssm put-parameter --name /wolgyeham/$ENV/VAPID_PRIVATE_KEY --type SecureString --overwrite --value "$(echo "$KEYS" | jq -r .privateKey)"
aws ssm put-parameter --name /wolgyeham/$ENV/VAPID_SUBJECT --type SecureString --overwrite --value 'mailto:<팀 연락 주소>'
unset KEYS
```

`RECONFIRM_INTERVAL_DAYS`(재확인 주기, 기본 365)는 기본값을 쓰면 SSM에 넣지 않습니다. 시연에서 짧게 보여줄 때만 dev에 넣습니다.

## DB 마이그레이션

- 마이그레이션 파일은 [database.md](database.md)의 규칙대로 PR에 함께 올립니다.
- 배포 때 새 API가 뜨기 전에 이미지 안의 `migrate.mjs`가 `drizzle/`의 SQL을 적용합니다.
- dev는 `DEMO_MODE=true`라서 마이그레이션 뒤 `seed.mjs`로 시연 데이터(가상 건물 햇살빌라·새봄하우스)를 넣습니다. prod에는 넣지 않습니다.
- 집주인 초대는 관리자가 SSM 세션에서 발급합니다. 토큰이 한 번만 출력되므로 Run Command가 아니라 세션 안에서 실행합니다: `docker compose --env-file server.env --env-file .deploy.env run --rm api-prod node invite.mjs <건물 ID>`
- 컬럼 삭제·이름 변경처럼 되돌리기 어려운 변경은 두 번에 나눠 배포하고, PR에 적습니다.
- 신고된 생활 팁 검토(LF-19, 운영자)는 웹 화면 없이 SSM 세션에서 합니다: `docker compose --env-file server.env --env-file .deploy.env run --rm api-prod node moderate.mjs list`, 가리기 `… moderate.mjs hide <팁 ID> [사유]`, 복원 `… moderate.mjs restore <팁 ID>`. 가리거나 복원하면 그 팁의 신고가 검토 완료로 바뀝니다.

## 되돌리기

| 상황 | 방법 |
|---|---|
| 병합한 변경이 문제 | 그 PR을 `git revert`하는 PR을 만들어 병합합니다. 자동으로 다시 배포됩니다 |
| 배포 직후 API가 안 뜸 | deploy.sh가 직전 이미지로 자동으로 되돌립니다 |
| 급하게 직전 이미지로 | 관리자가 SSM으로 `sudo /opt/wolgyeham/deploy.sh <dev\|prod> --rollback` |
| 배포가 caddy 단계에서 멈춤 | 돌던 API·caddy는 그대로입니다. 출력의 `caddy validate` 오류를 보고 Caddyfile을 고치는 PR(또는 revert)을 병합합니다 |
| 원본 HTTPS가 안 됨(인증서 만료·sslip.io 장애 등) | 관리자가 `bash infra/aws/switch-origin-tls.sh rollback`으로 CloudFront를 예전 HTTP 원본으로 돌립니다(API 포트 공개·보안 그룹 8081~8082 포함). 고친 뒤 `switch` → `cleanup`([aws-setup.md 7-A](aws-setup.md#7-a-원본-https로-옮기기-이미-돌고-있는-환경)) |
| 데이터 복구 | S3의 백업으로 복구합니다. 방법은 [backup.sh](../infra/server/backup.sh) 맨 위 주석. 복구 전에 팀에 알립니다 |

## 본선·전시 전 체크리스트

- [ ] 전날 백업 파일이 S3에 있고, dev에 복구해 봤다
- [ ] 시연 2시간 전부터 `main` 동결 ([CONTRIBUTING.md](../CONTRIBUTING.md)). 시연은 dev에서, 파일럿 사용자는 prod에서
- [ ] prod `/api/health` 정상, 카카오 로그인·공지 알림을 실제 휴대폰으로 확인
- [ ] dev의 시연용 건물 데이터를 처음 상태로 되돌리는 방법 확인 (시연 모드)
- [ ] 예산 알림 메일이 오지 않았다

## 바꿀 때

배포 방식을 바꾸면 이 문서, 워크플로, `infra/server/`를 같은 PR에서 고치고 [decisions.md](decisions.md)에 기록합니다.
