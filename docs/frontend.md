# 프론트엔드 개발 가이드

누가 lofi 화면을 구현해도 같은 폴더·라우트·상태·접근성 규칙을 따르도록 정한 팀 규칙입니다. 새 화면을 시작할 때 이 문서와 해당 화면의 lofi 카드를 함께 봅니다.

- 기준: [lofi/screens.md](../lofi/screens.md)(화면 목록·개발 계약), [lofi/board.html](../lofi/board.html)(흐름·카드별 조건), [함이 가이드](../design/characters/hami/README.md)(함이 배치)
- 담당 영역: 프론트엔드 = `apps/web`. 백엔드와는 `packages/contracts`로만 값을 주고받습니다.
- 함께 보기: [인터랙션](interaction.md) · [아키텍처](architecture.md) · [백엔드](backend.md) · [배포](deploy.md) · [결정 기록](decisions.md)

## 1. 스택

| 영역 | 사용 | 상태 |
|---|---|---|
| UI·빌드 | React 19.3, Vite 8.3 | 사용 중 |
| 언어 | TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 포함) | 사용 중 |
| 컴포넌트 | SEED Design `@seed-design/react` 2.5, `@seed-design/css` 2.8 | 사용 중 (`ActionButton`) |
| HTTP·계약 | `ky` 2.1, `@wolgyeham/contracts`의 zod 스키마·타입 | 사용 중 (`HealthResponse`) |
| 라우팅 | `react-router` 8.4 data mode (`createBrowserRouter`) | 사용 중 (`app/router.tsx`) |
| 서버 상태 | `@tanstack/react-query` 5.104 (로딩·오류·재시도·캐시) | 사용 중 |

- 화면 안 상태는 `useState`·`useReducer`로, 서버 데이터는 query 캐시로 다룹니다. 전역 스토어는 여러 화면이 같은 클라이언트 상태를 써야 할 때만 [decisions.md](decisions.md)에 이유를 남기고 추가합니다.
- 의존성 추가와 `pnpm-lock.yaml` 갱신은 통합 담당자 한 명이 합니다(CONTRIBUTING.md 2. 담당 영역).
- `main.tsx`는 `@seed-design/css/base.css`(토큰) → `styles/tokens.css` → `styles/global.css` 순서로 불러옵니다. SEED 컴포넌트 CSS는 컴포넌트를 import하면 함께 들어옵니다.

## 2. 실행과 API 호출

- `pnpm dev:web`(웹만) 또는 `pnpm dev`(웹 + API)로 실행하고, 브라우저에서는 **`http://localhost:5173`**으로 엽니다. Vite가 `127.0.0.1`로 안내해도 카카오에 등록한 주소와 쿠키가 `localhost` 기준이라 `localhost`로 엽니다.
- API는 항상 같은 출처의 상대 경로 `/api/...`로 부릅니다. 로컬에서는 Vite가 `/api`를 `API_PROXY_TARGET`(기본 `http://127.0.0.1:3001`)으로 넘기고, 배포 환경에서는 Amplify rewrite(`infra/amplify/rewrites.*.json`)가 넘깁니다. 확장자 없는 나머지 경로는 `index.html`로 가므로 새로고침해도 화면이 유지됩니다.
- 환경은 로컬(`pnpm dev`), PR 미리보기(Amplify, dev API 사용, 카카오 로그인 안 됨), dev, prod입니다. 브랜치 대응과 배포 절차는 [deploy.md](deploy.md)를 따릅니다.
- 로그인 세션은 API가 심는 HttpOnly 쿠키(`wh_session`)입니다. 웹은 세션 토큰을 읽거나 저장하지 않습니다.
- `VITE_` 값은 공개 번들에 들어갑니다. 비밀키·OAuth client secret·API 주소를 넣지 않습니다. 지금은 `VITE_DISABLE_REACT_DEVTOOLS` 하나만 씁니다.

```ts
// lib/api.ts
import { HealthResponse } from "@wolgyeham/contracts";
import ky from "ky";

export const api = ky.create({ timeout: 10_000, retry: 0 });

export function checkApi() {
  return api.get("/api/health").json(HealthResponse); // 스키마와 다르면 SchemaValidationError
}
```

- 응답은 contracts의 zod 스키마로 검증합니다. `json<T>()` 타입 단언만으로 받지 않습니다.
- 재시도는 react-query 한 곳에서만 합니다. 쓰기 요청(POST·PATCH·DELETE)은 자동으로 다시 보내지 않습니다.

## 3. 폴더 구조

```text
apps/web/src/
├── main.tsx            진입점
├── app/                providers(query·snackbar), router, 오류 경계
├── screens/<screen>/   lofi 화면 하나 = 폴더 하나. 그 화면의 시트·상태도 여기
├── features/<domain>/  buildings · guides · notices · reports · tips · occupancy · auth
│                       API 훅(useGuide 등)과 여러 화면이 쓰는 도메인 컴포넌트
├── components/         SEED 위에 만든 앱 공통 UI (화면 상태, 하단 CTA, 탭바, 함이 그림)
├── lib/                api, errors(오류 코드 → 문구), reportAccess, speech, pushEnv
├── styles/             tokens.css(--wh-*), global.css
└── assets/hami/        화면에서 실제로 쓰는 함이 사본만
```

구현 현황은 코드가 기준입니다. 폴더를 새로 만들 때 이 구조를 따릅니다.

- 화면 폴더는 kebab-case, 컴포넌트 파일은 PascalCase(`GuideDetailScreen.tsx`), 훅·유틸은 camelCase(`useGuide.ts`)로 짓습니다. 화면 컴포넌트 첫 줄에 LF ID와 lofi 번호를 적습니다: `// LF-02 기본 안내 상세 · lofi 11 12 13 14 44`
- 화면끼리는 서로 import하지 않습니다. 두 화면이 같이 쓰면 `features/`나 `components/`로 옮깁니다.
- 디자인 값은 `--wh-*`와 SEED 토큰(`--seed-*`)만 씁니다. 색·간격 숫자를 컴포넌트에 직접 적지 않습니다.
- 함이는 `design/characters/hami/images/`에서 같은 파일명으로 복사하고 `cmp`로 원본과 같은지 확인합니다.

**기본 스타일 (결정, [decisions.md](decisions.md) D-10)**

- lofi를 기준으로 합니다. 주 색은 남색 `#25355a`(lofi `--navy-600`), 보조는 달빛 `#c9a45c`(`--moon`), 글꼴은 Pretendard입니다. `styles/tokens.css`의 `--wh-*` 값을 lofi 값으로 맞춥니다.
- SEED 브랜드 색 기본값(당근 주황)은 `--seed-color-bg-brand-solid` 등을 덮어써 남색으로 바꿉니다. SEED가 브랜드 값을 `:root[data-seed-color-mode="light-only"]`에 두므로 `:root, :root[data-seed-color-mode="light-only"]` 선택자로 뒤에서 덮습니다(`styles/tokens.css`).
- 다크 모드는 설계하지 않았으므로 `<html data-seed-color-mode="light-only">`로 고정합니다.

**결정 필요**

- 함이 원본은 1254×1254 PNG(540~860KB)입니다. 표시 폭(40~300px)에 맞춘 파생본을 둘지 정합니다. 정하기 전에는 사본에 `width`·`height`를 지정해 씁니다.

## 4. 라우트 (결정)

건물 주소는 `/b/:buildingId` 하나로 씁니다. `buildingId`는 서버가 발급한 uuid이고 건물 이름·주소로 만들지 않습니다. QR에 인쇄되므로 바꾸지 않습니다. 더 짧은 공개 키는 [database.md](database.md)에서 정할 것으로 둡니다.

| URL | `screens/` | 화면 (lofi 번호) | 누가 |
|---|---|---|---|
| `/b/:buildingId` | `public-building` / `resident-home` | LF-01(01·30·28). 이 건물 거주자면 같은 주소에서 LF-05(03·10) | 누구나 |
| `/b/:buildingId/first` | `first-guide` | 처음 오셨나요(36·46) | 누구나 |
| `/b/:buildingId/guides/:guideId` | `guide-detail` | LF-02(11·14), 시트 12·13·44 | 누구나, 메모는 거주자 |
| `/b/:buildingId/notices/:noticeId` | `notice-detail` | LF-03(15) | 누구나 |
| `/b/:buildingId/connect` | `connect` | LF-04(02·16), 연결 뒤 시트 17 | 누구나 |
| `/b/:buildingId/tips` | `tips` | LF-06·07(04·18·19) | 거주자 |
| `/b/:buildingId/report` | `report-compose` | LF-10 직접 적기(05). 자주 쓰는 말 확인 시트 20은 01 안 | 누구나 |
| `/r/:reportId#t=<token>` | `report-status` | LF-11(06·31) | 확인 링크를 가진 사람 |
| `/me`, `/me/reports` | `me`, `sent-reports` | LF-09(45, 시트 40·08, 완료 09), LF-08(21) | 로그인 사용자 |
| `/invite#t=<inviteToken>` | `landlord-invite` | LF-12(41·23) | 초대받은 사람 |
| `/manage` | `manage-index` | 관리하는 건물의 관리 홈으로 이동(여러 건물 선택은 파일럿 이후) | 집주인 |
| `/manage/:buildingId/ready` | `setup-done` | LF-12 준비 완료(38) | 집주인 |
| `/manage/:buildingId` | `landlord-home` | LF-13(42·24) | 집주인 |
| `/manage/:buildingId/guides/new`, `…/:guideId/edit`, `…/:guideId/preview` | `guide-write`, `guide-preview` | LF-14(33, 43) | 집주인 |
| `/manage/:buildingId/notices/new` | `notice-write` | LF-15(34·37) | 집주인 |
| `/manage/:buildingId/inbox`, `…/reports/:reportId` | `report-inbox` | LF-16(07·35, 알림 32에서 진입) | 집주인 |
| `/manage/:buildingId/memos/:memoId` | `memo-review` | LF-17(25) | 집주인 |
| `/manage/:buildingId/qr` | `move-in-card` | LF-18(39·26) | 집주인 |
| `/demo` | `demo` | LF-20(29) | 시연자 |
| 그 밖 | `not-found` | 건물 없음(22) | 누구나 |

- `/`(홈 화면 아이콘으로 여는 주소)는 화면 없이 나누기만 합니다. 거주자는 스플래시(00) 뒤 `/b/:buildingId`, 집주인은 `/manage/:buildingId`로 보냅니다. 둘 다 아닌 사람에게 보여줄 화면은 결정 필요입니다.
- 하단 탭은 거주자 `우리 건물`·`내 정보`, 집주인 `건물 관리`·`받은 내용`·`설정`입니다. 설정 화면은 lofi에 없으므로 그린 뒤 라우트를 추가합니다.
- 화면 폴더마다 `route.tsx`에서 `Component`를 export하고, `app/router.tsx`가 `lazy`로 불러옵니다. 새 화면은 이 표와 라우터에 함께 추가합니다.
- 시트(08·12·13·17·20·40·44)에는 URL을 만들지 않습니다. 작성 중인 시트가 열린 채 뒤로 가면 `useBlocker`로 확인을 받습니다.
- 권한은 서버가 판정합니다. 라우트 guard는 로그인 이동과 권한 없음 표시에만 쓰고, 버튼 숨김으로 권한을 대신하지 않습니다.
- lofi에 있지만 아직 만들지 않은 행동은 숨기지 않고 비활성으로 두며, `aria-describedby`로 “다음 업데이트에서 열려요”를 연결합니다.
- `/demo`는 시연용 건물 데이터만 쓰고 실제 화면과 상태를 공유하지 않습니다. 실제 첫 화면에 `/demo` 링크를 두지 않습니다.

## 5. 데이터와 화면 상태

[개발 계약](../lofi/screens.md#개발-계약-초안)을 코드로 옮기는 규칙입니다. 아래 상태는 모두 다른 UI로 그립니다(screens.md §8).

| 상태 | 판정 | 보여줄 것 |
|---|---|---|
| 불러오는 중 | query pending | 300ms가 지나면 SEED `Skeleton`. 3D 자리는 정적 그림 |
| 빈 화면 | 성공했지만 0개 | 화면별 빈 상태(예: 14 “아직 등록된 안내가 없어요”) |
| 오류 | `NETWORK`·`INTERNAL_ERROR` | “불러오지 못했어요” + 다시 시도. 빈 화면으로 표시하지 않음 |
| 없음 | `NOT_FOUND` | 화면별 없음 상태(예: 22 “이 건물 페이지를 찾을 수 없어요”) |
| 권한 없음 | `NOT_BUILDING_MANAGER` / `FORBIDDEN` | “이 건물을 관리할 권한이 없어요” / 화면별 문구(초안) |
| 연결·재확인 필요 | `NOT_CONNECTED` / `RECONFIRM_NEEDED` | 연결 안내 시트(44) / 재확인 시트(40) |
| 로그인 필요 | `UNAUTHENTICATED` | 로그인한 뒤 보던 화면으로 |

**로그인과 연결 뒤에는 보던 화면으로 돌아옵니다.**

- 로그인은 `/api/auth/kakao/start?returnTo=<지금 경로>`로 이동합니다. `returnTo`는 contracts의 `ReturnTo` 규칙(`/`로 시작, `//`·`\`·`#`·공백 없음, 512자 이하)을 지켜야 하고, 어기면 400 `VALIDATION_FAILED`입니다.
- 취소하면 `?login=cancelled`, 실패하면 `?login=failed`가 붙어 돌아옵니다(`LOGIN_RESULT_PARAM`, `LoginResult`). state 쿠키를 잃은 실패는 `/`로 돌아옵니다. 결과를 안내한 뒤 이 쿼리는 주소에서 지웁니다.
- 떠나기 전 입력(가입코드, 초대 토큰, 쓰던 메모·팁·제보)은 저장해 두었다가 돌아오면 채웁니다. `#t=` 토큰은 로그인을 거치면 사라지므로 이동 전에 옮기고 주소창에서 지웁니다. **자동으로 보내지 않고** 사용자가 다시 눌러야 보냅니다.
- 집주인이 쓰던 안내는 기기에 남아야 하므로 localStorage에 두고, 서버에는 ‘미리 보기’를 누를 때만 초안으로 저장합니다. 쓰기↔미리 보기 이동은 `replace`라 뒤로 가면 관리 홈으로 갑니다.

| 저장소 | 키 | 내용 |
|---|---|---|
| localStorage | `wh.size` | 크게 보기 |
| localStorage | `wh.visited.<buildingId>` | 첫 방문 여부 (LF-01 함이) |
| localStorage | `wh.guideDraft.<buildingId>.<guideId\|new>` | 쓰던 안내 |
| localStorage | `wh.reportAccess` | 제보 조회 권한 (아직 구현 전) |
| sessionStorage | `wh.inviteToken` | 로그인을 거치는 동안의 초대 토큰 |

- 키는 `wh.`로 시작하고 새 키는 이 표에 추가합니다. 읽기·쓰기는 모두 try/catch로 감쌉니다.
- 이미 로그인했으면 16을 건너뜁니다. 연결 뒤 알림 선택(17)은 한 번만 보여주고, 환영·첫날 안내를 연달아 띄우지 않습니다.

**이 브라우저에서 다시 보기**

- 제보 생성 응답의 `accessToken`은 한 번만 옵니다. 받는 즉시 `{ reportId, buildingId, token }`을 localStorage에 저장하고 확인 링크 `/r/:reportId#t=<token>`을 보여줍니다.
- 조회할 때는 `X-Report-Token` 헤더로 보냅니다. 토큰을 URL 경로·쿼리·로그·오류 보고에 넣지 않습니다. 확인 링크와 초대 링크는 `#t=`에 토큰을 두므로 서버 로그와 Referer에 남지 않습니다.
- 같은 건물 QR로 다시 들어오면 저장된 항목으로 ‘내가 보낸 내용’ 배너(30)를 띄웁니다. 저장에 실패하면 확인 링크 보관 안내를 더 크게 보여줍니다.

```ts
// lib/reportAccess.ts
type ReportAccess = { reportId: string; buildingId: string; token: string; savedAt: number };
const KEY = "wh.reportAccess";
const TTL = 30 * 24 * 60 * 60 * 1000; // 확인 링크 보관 기간과 같게
const isAccess = (v: unknown): v is ReportAccess =>
  typeof v === "object" && v !== null && "reportId" in v && "token" in v;

export function loadReportAccess(): ReportAccess[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(isAccess).filter((a) => Date.now() - a.savedAt < TTL);
  } catch {
    return []; // 비공개 모드·저장소 차단
  }
}
```

**안내와 숫자는 데이터 그대로 보여줍니다.**

- 안내는 집주인이 입력한 제목·본문·사진만 보여주고, 상세(11)·첫날 카드(36)·미리 보기(43)가 같은 본문 컴포넌트를 씁니다. 줄바꿈은 `white-space: pre-line`으로 살리고 본문을 HTML로 해석하지 않습니다(`dangerouslySetInnerHTML` 금지). 요일표처럼 입력하지 않은 구조를 만들지 않습니다.
- 1/4, 안내 N개, ‘월계함에 연결된 거주자 N명’ 같은 숫자는 응답에서 셉니다. 화면에 숫자를 적어 두지 않습니다.
- 주소는 도로명까지만 보여줍니다. `index.html`의 `noindex`를 유지합니다.

## 6. 오류 처리

API 오류 본문은 contracts의 `ErrorResponse`(`{ error: { code, message?, fields? } }`)입니다. HTTP 상태가 아니라 `code`로 분기합니다. `message`는 개발용 영어라 화면에 쓰지 않습니다. 코드 목록은 contracts의 `ERROR_CODES`, 설명은 [backend.md](backend.md)를 따릅니다.

`lib/errors.ts`의 `toAppError`가 ky 오류를 `AppError`(`code`·`fields`·`retryAfterSeconds`)로 바꿉니다. 응답은 contracts `ErrorResponse`로 파싱하고, 네트워크·시간 초과는 `NETWORK`, 계약과 다른 응답은 `INTERNAL_ERROR`입니다.

- 코드를 문구로 바꾸는 곳은 `lib/errors.ts` 하나입니다. lofi·README에 있는 문구를 먼저 쓰고, 없으면 PR에 초안이라고 적습니다.
- `VALIDATION_FAILED`의 `fields`는 각 입력 아래(`Field.ErrorMessage`)에 보여줍니다. `JOIN_CODE_INVALID`·`JOIN_CODE_LOCKED`도 코드 칸 아래에 두고, 대기 시간은 `Retry-After`로 계산합니다.
- 쓰기 실패(`NETWORK`·`INTERNAL_ERROR`·`REPORT_TOO_FREQUENT`)는 입력을 그대로 두고 버튼 위에 “저장하지 못했어요. 다시 눌러 주세요” 같은 문구를 띄웁니다.
- `NOTICE_ENDED`(“종료된 공지예요”)와 `REPORT_LINK_EXPIRED`(“보관 기간이 지나 더 이상 확인할 수 없어요”)는 토스트가 아니라 화면 상태로 보여줍니다.
- 로그인 시작 전에 `fetch(…, { redirect: "manual" })`로 확인하고, 503 `KAKAO_NOT_CONFIGURED`면 화면 안에서 안내합니다(카카오 키가 없는 PR 미리보기·로컬). 그 밖에는 `/api/auth/kakao/start`로 이동합니다(`features/auth/session.ts`의 `startKakaoLogin`).
- 오류는 해결될 때까지 화면에 남깁니다. SEED `Snackbar`(토스트)는 저장됨·링크 복사처럼 막히지 않는 결과에만 씁니다([interaction.md](interaction.md)).

## 7. 접근성 (세부 주제 04)

| 항목 | 규칙 |
|---|---|
| 크게 보기 | `<html data-size="large">`. 글자·간격 토큰만 바꾸고 연결하기·내가 보낸 내용·관리하기·알리기는 그대로 둡니다. 3D는 정적 그림 |
| 읽어주기 | Web Speech API `speechSynthesis`, `lang="ko-KR"`. 지원하지 않으면 버튼을 비활성으로 두고 이유를 적습니다. 화면을 떠나면 `cancel()` |
| 터치 영역 | 44×44 이상. 주요 버튼은 `ActionButton size="large"` |
| 포커스·구조 | `:focus-visible` 윤곽선(global.css)을 지우지 않습니다. 화면마다 `h1` 하나, 구역은 `h2` |
| 이미지 | 안내 사진은 `alt`를 채웁니다(예: “분리수거 안내 사진 1”). 함이는 옆 문장이 상태를 설명하므로 `alt=""` |
| 색 | 색만으로 구분하지 않습니다. 상태 배지는 글자(접수됨·확인함·처리 완료·처리가 어려움)를 함께 씁니다 |
| 확대 | 글자 200%에서 가로 스크롤이 없어야 합니다. `rem`과 `min-height`를 쓰고 고정 높이를 피합니다 |

```css
/* styles/tokens.css — SEED 글자 토큰이 :root에서 계산되므로 html에 둡니다 */
html[data-size="large"] {
  --seed-font-size-multiplier: 1.25; /* SEED 본문 16px → 20px, 최대 1.5배 */
  --wh-font-scale: 1.25; /* --wh-type-* = calc(Nrem * var(--wh-font-scale)) */
  --wh-control-height: 64px; /* lofi 28 버튼 */
  --wh-control-height-s: 48px;
}
```

- 크게 보기 설정은 localStorage `wh.size`에 저장하고(try/catch), 첫 렌더 전에 `main.tsx`에서 적용합니다(`lib/largeMode.ts`). 저장이 안 돼도 이번 방문에는 적용합니다.
- 공개 화면(`/b/:buildingId`)은 크게 보기에서 lofi 28 배치(목록형 행, 건물 그림 없음, 알리기를 하단 주요 버튼으로)로 그립니다.
- 읽어주기는 사용자가 누른 이벤트 안에서 시작합니다. iOS는 그 밖에서 소리를 내지 않습니다. 한국어 음성이 없는 기기의 동작은 실제 기기에서 확인합니다.

## 8. PWA와 웹 푸시 (아직 구현 전)

- manifest(`/manifest.webmanifest`)와 service worker(`/sw.js`)는 `public/`에 둡니다. Amplify rewrite가 `.js`·`.webmanifest`는 파일로 내보내므로 SPA fallback에 걸리지 않습니다.
- 알림 환경은 [screens.md §6](../lofi/screens.md#6-알림-환경)의 다섯 상태를 따르고 `lib/pushEnv.ts`에서 판정합니다. iPhone은 홈 화면에 추가한 뒤에만 알림을 켤 수 있습니다(17). 카카오톡 안 브라우저에서는 “Safari·Chrome으로 열기”를 안내합니다.
- 권한 요청(`Notification.requestPermission()`)은 사용자가 ‘알림 받기’를 누른 뒤에만 합니다. 알림을 켜지 않아도 연결은 끝난 상태입니다.
- VAPID 개인키와 구독 저장은 서버가 맡습니다. 실제 기기(iOS·Android·카카오톡) 동작은 아직 확인하지 않았습니다.

## 9. 성능

- 화면 폴더 단위로 코드를 나눕니다(라우트 `lazy`). 이미지에는 `width`·`height`를 지정하고, 첫 화면 밖 사진은 `loading="lazy"`로 불러옵니다.
- 공개 QR 화면(01)은 3D 없이 먼저 쓸 수 있어야 합니다. 건물명·공지·안내 타일·알리기는 3D 로딩과 관계없이 그리고, 3D와 무거운 자산은 첫 화면이 그려진 뒤 불러옵니다.

## 10. PR 전 확인

- [ ] `pnpm check` 통과
- [ ] 폭 390px(lofi 기준)에서 가로 스크롤 없음
- [ ] 크게 보기에서 같은 행동이 모두 보임
- [ ] 키보드만으로 주요 행동을 할 수 있고 포커스가 보임
- [ ] 로딩·빈 화면·오류·없음·권한 없음을 각각 확인 (DevTools 네트워크 차단·느린 연결)
- [ ] 화면 첫 줄에 LF ID를 적고, lofi와 다르게 만든 점은 PR에 적음
- [ ] 모바일 폭 스크린샷 첨부. 실제 가입코드·개인정보가 스크린샷에 없음

## 바꿀 때

- 이 문서의 규칙(스택·폴더·라우트·상태)은 PR로 바꾸고, 결정이 바뀌면 [decisions.md](decisions.md)에 이유를 남깁니다.
- 화면·상태·문구는 [lofi/screens.md](../lofi/screens.md)가 기준입니다. 어긋나면 screens.md를 먼저 고친 뒤 이 문서를 맞춥니다.
- API 모양이 바뀌면 `packages/contracts`와 [backend.md](backend.md)를 먼저 고칩니다.
