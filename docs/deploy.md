# 배포와 운영

팀원 모두가 자기 작업을 어디서 보고, 배포가 언제 일어나고, 문제가 생기면 어떻게 되돌리는지 정리합니다. 구조는 [architecture.md](architecture.md), AWS 준비는 [aws-setup.md](aws-setup.md)를 봅니다.

- 기준: [CONTRIBUTING.md](../CONTRIBUTING.md)(브랜치·PR), [.github/workflows/deploy-api.yml](../.github/workflows/deploy-api.yml), [amplify.yml](../amplify.yml), [infra/server/](../infra/server/)
- 담당: 공통 계약·인프라·통합 영역. 배포 자체는 사람이 하지 않고 PR 병합이 대신합니다.

## 내 작업을 보는 곳

| 보고 싶은 것 | 주소 | 비고 |
|---|---|---|
| 내 컴퓨터에서 | `pnpm dev` → 웹 `http://localhost:5173`, API 문서 `http://localhost:5173/api/swagger` | DB는 `pnpm db:up` |
| 내 PR의 화면 | Amplify가 PR에 남기는 미리 보기 주소 | 웹만 PR 코드. API는 dev를 씀. 카카오 로그인 안 됨 |
| 팀이 합친 결과 | dev 웹 주소 (Amplify dev 앱) | `main` 병합 후 몇 분 안 |
| dev API 문서 | `<dev 웹 주소>/api/swagger`, `/api/docs` | 백엔드 PR이 병합되면 바로 반영 |
| 실제 서비스 | prod 웹 주소 (Amplify prod 앱) | 관리자가 `release`를 올릴 때만 바뀜 |

실제 주소는 AWS 준비가 끝나면 이 표와 저장소 설명(About)에 적습니다.

## 배포가 일어나는 때

| 일 | 웹 (Amplify) | API (GitHub Actions) |
|---|---|---|
| PR을 열거나 커밋을 올림 | dev 앱이 미리 보기를 만듦 | `ci.yml`만 실행 (배포 없음) |
| `main`에 병합 | dev 앱이 빌드·배포 | `apps/api`, `packages/contracts`, `infra/server`가 바뀌었으면 `pnpm check` → 이미지 빌드 → dev 배포 |
| 관리자가 `release`를 올림 | prod 앱이 빌드·배포 | 같은 과정으로 prod 배포 |
| 수동 실행 | Amplify 콘솔에서 다시 배포 | Actions의 Deploy API → Run workflow → dev 선택 (prod는 `release`에서만) |

`release`는 관리자만 올립니다.

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
5. deploy.sh: SSM의 비밀값으로 환경 파일 작성 → 이미지 받기 → DB 마이그레이션(있으면) → 새 컨테이너 시작 → `/api/health` 확인. 실패하면 직전 태그로 자동으로 되돌림
6. 공개 주소로 `/api/health` 한 번 더 확인

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

서버에서 파일을 직접 고치지 않습니다. 다음 배포 때 덮어써집니다. 바꿀 것은 `infra/server/`에서 PR로 고칩니다.

## 환경 변수 추가하기

1. `apps/api/src/lib/env.ts`의 zod 스키마와 `apps/api/.env.example`에 키를 추가합니다(값은 샘플).
2. PR 본문에 "새 환경 변수: KEY (dev·prod 값 필요)"라고 적습니다.
3. 관리자가 병합 전에 SSM에 값을 넣습니다.
   ```bash
   aws ssm put-parameter --name /wolgyeham/dev/KEY --type SecureString --value '<값>' --overwrite
   ```
4. 병합하면 deploy.sh가 새 값을 읽어 컨테이너를 다시 띄웁니다.

웹에서 쓰는 값은 `VITE_`로 시작하고 브라우저에 공개됩니다. 비밀값을 넣지 않습니다. Amplify 콘솔의 환경 변수에 넣습니다.

## DB 마이그레이션

- 마이그레이션 파일은 [database.md](database.md)의 규칙대로 PR에 함께 올립니다.
- 배포 때 새 API가 뜨기 전에 자동으로 실행됩니다. 이미지 안의 `migrate.mjs`를 실행하는 구조이며, 마이그레이션을 구현할 때 Dockerfile에 이 파일과 SQL 폴더를 추가합니다(아직 구현 전).
- 컬럼 삭제·이름 변경처럼 되돌리기 어려운 변경은 두 번에 나눠 배포하고, PR에 적습니다.

## 되돌리기

| 상황 | 방법 |
|---|---|
| 병합한 변경이 문제 | 그 PR을 `git revert`하는 PR을 만들어 병합합니다. 자동으로 다시 배포됩니다 |
| 배포 직후 API가 안 뜸 | deploy.sh가 직전 이미지로 자동으로 되돌립니다 |
| 급하게 직전 이미지로 | 관리자가 SSM으로 `sudo /opt/wolgyeham/deploy.sh <dev\|prod> --rollback` |
| 데이터 복구 | S3의 백업으로 복구합니다. 방법은 [backup.sh](../infra/server/backup.sh) 맨 위 주석. 복구 전에 팀에 알립니다 |

## 본선·전시 전 체크리스트

- [ ] 전날 백업 파일이 S3에 있고, dev에 복구해 봤다
- [ ] 시연 2시간 전부터 `main` 동결 ([CONTRIBUTING.md](../CONTRIBUTING.md)). 시연은 dev에서, 파일럿 사용자는 prod에서
- [ ] prod `/api/health` 정상, 카카오 로그인·공지 알림을 실제 휴대폰으로 확인
- [ ] dev의 시연용 건물 데이터를 처음 상태로 되돌리는 방법 확인 (시연 모드)
- [ ] 예산 알림 메일이 오지 않았다

## 바꿀 때

배포 방식을 바꾸면 이 문서, 워크플로, `infra/server/`를 같은 PR에서 고치고 [decisions.md](decisions.md)에 기록합니다.
