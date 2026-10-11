# 개발 문서

월계함을 어떻게 만들고 배포하는지 정리한 문서입니다. 서비스 소개는 [../README.md](../README.md), 화면과 권한·데이터 계약은 [../lofi/screens.md](../lofi/screens.md), 함께 일하는 규칙은 [../CONTRIBUTING.md](../CONTRIBUTING.md)가 기준입니다.

## 문서

| 문서 | 내용 | 주로 읽는 사람 |
|---|---|---|
| [architecture.md](architecture.md) | 시스템 구조, 환경(local·preview·dev·prod), AWS 구성, 한계 | 모두 |
| [backend.md](backend.md) | API 구조, contracts부터 쓰는 순서, 오류 형식, 로그인·권한, 로그, 테스트 | 백엔드 |
| [database.md](database.md) | Postgres·Drizzle 규칙, 테이블, 마이그레이션, 시드, 백업 | 백엔드 |
| [frontend.md](frontend.md) | 폴더 구조, 라우트와 화면 ID, 데이터 요청, 상태 화면, 접근성 | 프론트엔드 |
| [interaction.md](interaction.md) | 인터랙션·애니메이션 규칙, 모션 토큰, 3D·함이 사용 | 프론트엔드 |
| [deploy.md](deploy.md) | 내 작업 보는 곳, 배포 시점, 로그, 되돌리기, 본선 체크리스트 | 모두 |
| [aws-setup.md](aws-setup.md) | AWS를 처음 준비하는 절차 | 관리자 |
| [decisions.md](decisions.md) | 구조·규칙을 정한 이유와 대안 | 모두 |

## 처음 합류했다면

1. [../README.md](../README.md)로 서비스를 이해합니다.
2. [../lofi/board.html](../lofi/board.html)로 화면 흐름을 봅니다.
3. [../CONTRIBUTING.md](../CONTRIBUTING.md)의 브랜치·커밋 규칙과 [architecture.md](architecture.md)를 읽습니다.
4. 맡은 영역의 문서(백엔드 또는 프론트엔드)를 읽고 `pnpm dev`로 로컬을 띄웁니다.

## 테스트

- `pnpm check`: lint, 타입 검사, 단위·DB 테스트(vitest), 빌드. PR 전에 통과시킵니다. DB 테스트는 `pnpm db:up`이 필요합니다([backend.md](backend.md)).
- `pnpm e2e`: Playwright로 실제 화면 흐름을 390×844에서 돌립니다. `pnpm db:up && pnpm dev`가 떠 있어야 하고, 설치된 Chrome을 씁니다. 쓰기 테스트는 e2e 전용 건물(테스트빌라·준비빌라, 실제 건물 역할의 실제빌라)과 e2e 계정만 씁니다. 발표 시연 계정·건물은 둘러보기 전용이라(D-35) 막히는지만 봅니다. 실제빌라와 e2e 거주자 세션은 `e2e/support/dev-db.ts`가 `apps/api/.env`의 로컬 DB에만 만들고, 로컬 DB가 아니면 멈춥니다. 시연 건물에 쌓인 데이터는 `pnpm db:seed -- --reset-demo`로 되돌립니다. `pnpm check`에는 들어 있지 않습니다.
- e2e는 로컬 DB와 시연 계정을 함께 쓰므로 한 번에 하나만 돌립니다. 비회원 제보 반복 제한(IP당 시간당 10건)에 걸리거나 A·B 연결 상태가 엇갈리면 `pnpm db:seed -- --reset-demo` 뒤 다시 돌립니다. 새 집주인 흐름(준비빌라)은 리셋 뒤 첫 실행에서만 돌고, `E2E_RESET_DEMO=1 pnpm e2e`는 실행이 끝난 뒤 시연 데이터를 되돌립니다.
- e2e는 `apps/api/.env`의 `DEMO_MODE=true`와 `E2E_LOGIN=true`가 있어야 합니다. `E2E_LOGIN`이 꺼져 있으면 쓰기 테스트용 집주인(`demo-e2e-landlord`)의 시연 로그인이 404이고 `/api/dev/demo`에 e2e 건물·계정이 나오지 않습니다(시드는 그대로 넣음). 로컬에서 준비 조건(시드 상태, 사진 저장소)이 맞지 않는 테스트는 이유를 적고 건너뛰고, CI(`CI` 환경 변수)에서는 실패합니다.
- CI: `.github/workflows/ci.yml`이 PR과 main에서 `pnpm check`를 돌립니다(문서·`design/`·`lofi/`만 바뀌면 건너뜀). `.github/workflows/e2e.yml`은 코드(`apps/`·`packages/`·`e2e/`)가 바뀌면 새 Postgres에 `pnpm db:migrate`·`pnpm db:seed`를 하고 `pnpm dev`를 띄워 `pnpm e2e`를 돌립니다. 이때 `DEMO_MODE=true`·`E2E_LOGIN=true`, 실행마다 새로 만든 VAPID 키, `PHOTO_STORE=local`을 씁니다. 실패하면 Playwright 결과(trace·스크린샷)와 서버 로그를 아티팩트로 올립니다.

## 문서를 고칠 때

- 코드와 문서가 어긋나면 같은 PR에서 둘 다 고칩니다.
- 구조나 도구를 바꾸면 [decisions.md](decisions.md)에 새 항목을 추가합니다.
- 같은 내용을 여러 문서에 복제하지 않고 링크합니다.
- "(아직 구현 전)" 표시는 구현하면서 지웁니다.
