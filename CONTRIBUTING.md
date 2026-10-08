# 협업 가이드

세 명이 AI 도구(Claude Code, Codex, ChatGPT)와 함께 한 저장소에서 일하기 위한 규칙입니다. 무엇을 왜 만드는지는 [README.md](README.md), 함께 일하는 방법은 이 문서를 따릅니다. AI 도구는 [AGENTS.md](AGENTS.md)를 공통 지침으로 읽습니다.

## 한눈에 보기

1. **이슈**를 만들고 담당자·검토자·수정할 파일을 적습니다.
2. 최신 `main`에서 **`타입/이슈번호-설명`** 브랜치를 만듭니다.
3. **`타입(범위): 요약`** 형식으로 작게 커밋합니다.
4. 코드는 `pnpm check`, 문서·자산은 링크와 이미지를 확인하고 결과를 PR에 붙입니다.
5. **다른 팀원 1명 승인 + CI 통과** 뒤 Squash merge합니다.
6. 결정은 기준 문서나 이슈에 남깁니다. AI 대화나 개인 메시지에만 있는 결정은 팀 결정이 아닙니다.

---

## 1. 어디에 무엇을 두나

| 내용 | 기준 문서 |
|---|---|
| 서비스 소개·데모·기술 요약 | [README.md](README.md) |
| 제품 기획 상세 (문제·근거·요구사항·검증) | [docs/product.md](docs/product.md) |
| 화면 흐름, 화면 목록, 개발 계약 (권한·데이터·상태) | [lofi/screens.md](lofi/screens.md), [lofi/board.html](lofi/board.html) |
| 로파이 제작 방법 | [lofi/README.md](lofi/README.md) |
| 함이 외형·사용 규칙 / 생성 프롬프트와 검토 상태 | [design/characters/hami/README.md](design/characters/hami/README.md) / [PROMPTS.md](design/characters/hami/PROMPTS.md) |
| 프론트엔드·백엔드가 공유하는 API 계약 | `packages/contracts` |
| 개발 방법 (구조·백엔드·DB·프론트·인터랙션·배포) | [docs/](docs/README.md) |
| 구조·도구를 정한 이유 | [docs/decisions.md](docs/decisions.md) |
| 작업 단위·담당·완료 조건 | GitHub 이슈 |
| AI 도구 공통 지침 | [AGENTS.md](AGENTS.md) |

- 같은 설명을 여러 문서에 복제하지 않고 기준 문서에 링크합니다.
- 문서끼리 어긋나면 위 표의 기준 문서를 먼저 고치고, 다른 곳은 링크로 바꿉니다.
- Notion·Manyfast·발표 자료는 기준 문서에서 옮긴 사본입니다. 옮길 때 어느 버전에서 가져왔는지 적습니다.

## 2. 담당 영역

세 명은 이슈에 담당자·검토자·수정할 파일을 적고 진행합니다. **같은 파일을 동시에 수정하지 않습니다.**

| 영역 | 경로 | 담당 | 먼저 읽을 문서 |
|---|---|---|---|
| 프론트엔드 | `apps/web` | @bborang | [frontend.md](docs/frontend.md), [interaction.md](docs/interaction.md) |
| 백엔드 | `apps/api` | @dlwldn4824 | [backend.md](docs/backend.md), [database.md](docs/database.md) |
| 공통 계약 | `packages/contracts` | 프론트·백엔드 담당 함께 | [backend.md](docs/backend.md) |
| 인프라·배포·통합 | `infra`, `.github`, `amplify.yml`, 루트 설정 | @kyowon1108 | [architecture.md](docs/architecture.md), [deploy.md](docs/deploy.md) |
| 제안서·화면설계·디자인 | `README.md`, `lofi/`, `design/` | @kyowon1108 | [lofi/screens.md](lofi/screens.md) |

- 검토자는 담당이 아닌 사람 중 한 명입니다. `packages/contracts`를 바꾸는 PR은 프론트·백엔드 담당이 모두 확인합니다.
- 잠금 파일(`pnpm-lock.yaml`)과 루트 설정은 @kyowon1108이 합쳐서 반영합니다.
- 프론트엔드는 백엔드 내부 코드 대신 `packages/contracts`를 사용합니다.

## 3. 시작하기

Node 24와 pnpm 10.28.2를 사용합니다.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm db:up     # PostgreSQL (Docker)
pnpm dev       # 웹과 API 동시 실행
pnpm check     # lint → typecheck → test → build (CI와 같음)
```

로파이 PNG는 `python3 lofi/scripts/export.py`로 다시 만듭니다(Python Playwright와 로컬 Chrome 필요). 각 영역의 개발 방법은 [docs/](docs/README.md)에 있습니다.

---

## 4. 작업 흐름

1. **이슈** — 작업 템플릿으로 목표, 담당자/검토자, 수정할 파일·폴더, 완료 조건, 검증 방법을 적습니다.
2. **브랜치** — 최신 `main`에서 만듭니다.
3. **작업** — 하루 한 번 이상 `main`을 받아 충돌을 일찍 풉니다. 다른 사람의 미커밋 작업을 덮어쓰지 않습니다.
   ```bash
   git fetch origin
   git rebase origin/main
   ```
4. **PR** — 진행 상황을 보이도록 초안(Draft) PR을 일찍 엽니다. 템플릿을 채웁니다.
5. **병합** — 승인 1명과 CI 통과 뒤 Squash merge하고 브랜치를 지웁니다. `Closes #번호`로 이슈가 함께 닫힙니다.

## 5. 브랜치 규칙

**`main`은 항상 실행·시연 가능한 상태로 둡니다.** `main`에 직접 push하거나 force push하지 않고, 모든 변경은 PR로 병합합니다. 지금 저장소 요금제에서는 GitHub 브랜치 보호를 켤 수 없어서 팀 약속으로 지킵니다.

| 타입 | 용도 | 예 |
|---|---|---|
| `feat` | 새 기능 | `feat/12-guide-publish` |
| `fix` | 버그 수정 | `fix/18-join-code-paste` |
| `refactor` | 동작을 바꾸지 않는 코드 정리 | `refactor/20-report-service` |
| `design` | 로파이·디자인 자산 | `design/21-first-guide-end` |
| `docs` | 문서 | `docs/9-contributing` |
| `chore` | 설정·의존성·CI | `chore/5-biome-rules` |
| `hotfix` | 본선·시연 중 긴급 수정 | `hotfix/31-demo-reset` |

`release`는 prod 배포용 특별 브랜치입니다. 작업하지 않고, @kyowon1108이 `main`의 검증된 상태를 올릴 때만 바뀝니다([docs/deploy.md](docs/deploy.md)).

- 이름은 `타입/이슈번호-짧은-설명`, 영문 소문자·숫자·하이픈만 씁니다.
- 1~2일 안에 병합할 크기로 자릅니다. 큰 기능은 [구현 순서](lofi/screens.md)처럼 세로로 잘라 여러 PR로 나눕니다.
- **한 브랜치 = 한 이슈 = 한 AI 세션**입니다.
- 병합한 브랜치는 지웁니다.
- 발표·제출 시점의 `main`에는 태그를 붙입니다(예: `midterm-2026-09-28`, `final-2026-10-09`).

## 6. 커밋 규칙

```text
타입(범위): 요약

본문 — 무엇을 왜 바꿨는지, 어떻게 확인했는지 (선택)

Refs #12
```

| 항목 | 규칙 |
|---|---|
| 타입 | `feat` `fix` `refactor` `test` `docs` `design` `chore` `ci` `build` |
| 범위 | `web` `api` `contracts` `infra` `lofi` `hami` `proposal` `repo`. `docs/` 문서는 다루는 영역을 범위로 씁니다(예: `docs(api)`) |
| 요약 | 한국어, 50자 안팎, 마침표 없이, 바뀐 결과를 씁니다. "수정함", "업데이트" 같은 말만 쓰지 않습니다 |
| 본문 | 이유와 확인 방법. 한 줄 요약으로 충분하면 생략합니다 |
| 이슈 | 관련 커밋은 `Refs #번호`, 이슈를 끝내는 PR은 `Closes #번호` |

```text
feat(api): 안내를 공개하면 건물 상태를 open으로 변경
fix(web): 가입코드 6자리를 한 번에 붙여넣도록 수정
design(lofi): 첫날 카드 마지막 장에 연결 제안 추가
docs(proposal): 발표 자료 기준으로 문제 정의 갱신
chore(repo): pnpm 잠금 파일 갱신
```

- **한 커밋에는 한 가지 변경만** 담습니다. 서식 정리와 기능 변경을 섞지 않습니다.
- 생성물은 원본과 같은 커밋에 넣습니다(예: `lofi/screens/*.html`을 고치면 `lofi/out/` PNG도 함께).
- 이미 `main`에 들어간 커밋은 `git revert`로 되돌립니다. amend와 rebase는 내 브랜치에서만 씁니다.
- **커밋 작성자는 실제로 작업한 사람입니다.** 다른 팀원 이름으로 커밋하지 않습니다. 함께 작업했으면 본문 끝에 `Co-authored-by: 이름 <GitHub noreply 메일>`을 적습니다.
- **커밋하지 않는 것:** `.env`·키·토큰, 설문 원본·실명·연락처·실제 가입코드, `node_modules`·`dist`, 도구 상태 폴더(`.omc`, `.omx`, `.codegraph`), `.DS_Store`

## 7. PR과 리뷰

- **PR 제목은 커밋 형식과 같게** 씁니다. Squash merge하면 PR 제목이 그대로 `main`의 커밋이 됩니다.
- 변경은 400줄 안팎(생성물·잠금 파일 제외)을 권장합니다. 더 크면 나눕니다.
- 템플릿의 검증 칸에는 **실제로 실행한 명령과 결과**를 붙입니다. UI 변경은 모바일 폭 스크린샷을 붙입니다.
- 리뷰는 당일 안에, 본선 기간에는 1시간 안에 답합니다.
- 충돌은 PR 작성자가 `main` 위로 rebase해 풉니다. `packages/contracts`와 잠금 파일 충돌은 통합 담당자와 함께 풉니다.

**리뷰어가 보는 것**

- 이슈의 완료 조건을 채웠는가
- 권한을 버튼 숨김이 아니라 서버에서 검사하는가
- `packages/contracts` 변경이 웹과 API 양쪽에 반영됐는가
- 비밀·개인정보가 코드, 로그, 스크린샷에 없는가
- 화면과 기준 문서(lofi/screens.md)가 어긋나지 않는가

## 8. AI 도구와 함께 일하기

AI는 작업을 빠르게 하는 도구이고, **변경에 대한 책임은 PR 작성자에게 있습니다.**

| 구분 | 규칙 |
|---|---|
| 공통 지침 | Claude Code와 Codex는 `AGENTS.md`를 읽습니다. 팀 규칙이 바뀌면 `AGENTS.md`와 이 문서를 같은 PR에서 고칩니다. 개인 설정에만 팀 규칙을 두지 않습니다. |
| 작업 지시 | 이슈 번호, 범위, 수정할 파일, 완료 조건, 참고할 기준 문서를 함께 줍니다. 한 세션은 한 브랜치에서만 일하게 합니다. 두 세션이 같은 파일을 동시에 고치지 않게 하고, 필요하면 `git worktree`로 폴더를 나눕니다. |
| 검토 | AI가 만든 diff는 사람이 모두 읽고 설명할 수 있어야 커밋합니다. "AI가 통과했다고 했다"는 검증이 아닙니다. 직접 실행한 결과를 PR에 붙입니다. |
| 결정 기록 | AI와 정한 화면·정책·용어는 기준 문서나 이슈로 옮깁니다. 대화 기록에만 있으면 다른 팀원과 다른 AI 세션이 알 수 없습니다. |
| 상태 구분 | AI 제안은 제안 → 검토 → 확정 순서로 다룹니다. 기준 문서와 다르면 차이와 이유를 남기고, 로컬 수정만으로 Notion·Manyfast에 반영됐다고 표시하지 않습니다. |
| 사람이 할 일 | `main` 병합, force push, `release` 올리기, DB 초기화, 외부 서비스에 게시하는 일은 사람이 직접 하거나 명시적으로 승인합니다. AWS 계정·권한·비용을 바꾸는 명령은 AI가 실행하지 않고 관리자가 [절차서](docs/aws-setup.md)대로 실행합니다. |
| 보안 | 비밀키·토큰·설문 원본·실명·실제 가입코드를 프롬프트나 첨부로 넣지 않습니다. AI가 추가한 의존성은 이름·버전·라이선스를 확인합니다. |
| 공개 | PR의 "AI 사용" 칸에 어떤 도구로 무엇을 만들었는지 한 줄 적습니다. |

## 9. 완료 기준

| 변경 | 확인할 것 |
|---|---|
| 코드 | `pnpm check` 통과, 해당 흐름의 성공·실패·권한 경계, 필요한 테스트 추가 |
| UI | 모바일 폭, 크게 보기, 키보드, 로딩·오류 상태, 스크린샷 |
| API 계약 | `packages/contracts`를 고치면 웹과 API 양쪽 빌드 |
| DB | 마이그레이션 파일. 데이터 삭제·초기화는 영향을 공유한 뒤 실행 |
| 문서·자산 | 링크, 파일 존재, 이미지 열림, 원본 복사 무결성. 코드 변경이 없으면 전체 빌드를 반복하지 않음 |
| 로파이 | PNG 재생성, board와 screens.md 반영, 화면 ID(LF-xx) 유지 |

---

## 10. 코드와 보안 기준

- TypeScript strict와 Biome를 사용합니다. 잠금 파일은 pnpm 하나만 유지합니다.
- 비밀키·실제 가입코드·개인정보를 코드·로그·이슈에 넣지 않습니다. `.env.example`에는 샘플 값만 적습니다.
- 요청과 응답은 경계에서 검증하고, 실제 권한은 서버에서 검사합니다.
- UI의 디자인 값은 기존 CSS 토큰을 씁니다.
- 기능 변경에는 동작·실패·권한 경계 테스트를 추가합니다. 문구만 바꿨을 때 문장 일치 테스트를 만들지 않습니다.
- 구현, 시연 데이터, 검증 완료를 구분해서 말합니다.
- 현재 쓰는 문서·캐릭터 원본·로파이는 보존합니다. 정리 요청을 전체 삭제로 넓히지 않고, 삭제할 때는 대상과 참조 영향을 PR에 적습니다.

## 11. 디자인·로파이 협업

- 함이 이미지 원본과 후보는 `design/characters/hami/images/`에서만 관리합니다. 편집·재생성은 새 이름으로 저장하고 출처, 변경 내용, 검토 상태를 설명 문서에 남깁니다.
- 함이 외형·사용 규칙은 [함이 가이드](design/characters/hami/README.md), 현재 생성 프롬프트와 결과·검토 상태는 [PROMPTS.md](design/characters/hami/PROMPTS.md)에서 관리합니다. 폐기한 과거 프롬프트와 버전 폴더는 쌓아 두지 않습니다.
- 개별 캐릭터는 1:1 정사각형, 실제 알파 투명 PNG로 만듭니다. `lofi/assets/hami/`에는 현재 쓰는 이미지 사본만 두고, 원본과 적용본의 대응은 함이 가이드에 적습니다.
- 로파이 작업 전 [제작 규칙](lofi/README.md)과 [화면 목록](lofi/screens.md)을 확인합니다. 같은 화면을 두 사람이 동시에 고치지 않도록 이슈에서 조율합니다.
- 실서비스에는 검토한 자산만 가져옵니다. 디자인 시트 전체를 UI에 쓰거나 로파이 시연을 실제 기능 검증으로 보지 않습니다.

## 12. 해커톤 일정 운영

| 시점 | 규칙 |
|---|---|
| 9.28 중간발표 | 발표 자료와 README의 문제 정의를 맞추고 `main`에 태그 |
| ~10.7 개발·파일럿 | CORE 구현 순서(A→D)를 먼저. 매일 dev에서 시연 흐름을 한 번 돌려 봄. 파일럿 전에 `release`로 prod 첫 배포 |
| 10.8~9 본선 | 시연 2시간 전부터 `main` 동결. `hotfix/`만 받고 두 명이 확인한 뒤 병합. 최종 제출 커밋에 태그 |
| 10.11~13 전시 | 시연 데이터 초기화는 시연 모드에서만 |
