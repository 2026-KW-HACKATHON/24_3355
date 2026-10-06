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
| 컴포넌트 | SEED Design `@seed-design/react` 2.5, `@seed-design/css` 2.8 | 사용 중 (`ActionButton`, `BottomSheet`, `Dialog`, `Portal`, `Skeleton`, `Snackbar`) |
| HTTP·계약 | `ky` 2.1, `@wolgyeham/contracts`의 zod 스키마·타입 | 사용 중 (`HealthResponse`) |
| 라우팅 | `react-router` 8.4 data mode (`createBrowserRouter`) | 사용 중 (`app/router.tsx`) |
| 서버 상태 | `@tanstack/react-query` 5.104 (로딩·오류·재시도·캐시) | 사용 중 |
| QR | `uqr` 0.1.3 (MIT, 의존성 없음). 행렬만 받아 SVG·인쇄용 PNG는 `components/QrCode.tsx`가 그림 | 사용 중 (26·39) |
| 글꼴 | `pretendard` 1.3.9 (OFL-1.1). 가변 글꼴의 글자 범위별 woff2 조각(dynamic subset) CSS를 `main.tsx`가 불러오고 Vite가 함께 배포. 사용 허락서 사본은 `public/fonts/Pretendard-OFL.txt` | 사용 중 |

- 화면 안 상태는 `useState`·`useReducer`로, 서버 데이터는 query 캐시로 다룹니다. 전역 스토어는 여러 화면이 같은 클라이언트 상태를 써야 할 때만 [decisions.md](decisions.md)에 이유를 남기고 추가합니다.
- 의존성 추가와 `pnpm-lock.yaml` 갱신은 통합 담당자 한 명이 합니다(CONTRIBUTING.md 2. 담당 영역).
- `main.tsx`는 `@seed-design/css/base.css`(토큰) → `styles/tokens.css` → `styles/global.css` 순서로 불러옵니다. SEED 컴포넌트 CSS는 컴포넌트를 import하면 함께 들어옵니다.

## 2. 실행과 API 호출

- `pnpm dev:web`(웹만) 또는 `pnpm dev`(웹 + API)로 실행하고, 브라우저에서는 **`http://localhost:5173`**으로 엽니다. Vite가 `127.0.0.1`로 안내해도 카카오에 등록한 주소와 쿠키가 `localhost` 기준이라 `localhost`로 엽니다.
- API는 항상 같은 출처의 상대 경로 `/api/...`로 부릅니다. 로컬에서는 Vite가 `/api`를 `API_PROXY_TARGET`(기본 `http://127.0.0.1:3001`)으로 넘기고, 배포 환경에서는 Amplify rewrite(`infra/amplify/rewrites.*.json`)가 넘깁니다. 확장자 없는 나머지 경로는 `index.html`로 가므로 새로고침해도 화면이 유지됩니다.
- 환경은 로컬(`pnpm dev`), PR 미리보기(Amplify, dev API 사용, 카카오 로그인 안 됨), dev, prod입니다. 브랜치 대응과 배포 절차는 [deploy.md](deploy.md)를 따릅니다.
- 로그인 세션은 API가 심는 HttpOnly 쿠키(`wh_session`)입니다. 웹은 세션 토큰을 읽거나 저장하지 않습니다.
- `VITE_` 값은 공개 번들에 들어갑니다. 비밀키·OAuth client secret·API 주소를 넣지 않습니다. 지금은 세 개를 씁니다. `VITE_ENABLE_REACT_DEVTOOLS`는 `1`일 때만 개발 서버에서 react-grab·react-scan을 켭니다(도구 막대가 하단 버튼을 가려서 기본은 꺼짐). `VITE_PUBLIC_ORIGIN`(예: `https://…`)은 현관 QR(26)·입주 카드(39)에 인쇄할 공개 주소의 출처입니다. 한 번 붙이면 바꾸기 어려워 PR 미리 보기·로컬 주소가 인쇄되지 않게 dev·prod 빌드에 넣습니다. 없으면 지금 연 주소를 씁니다(`lib/share.ts`의 `publicOrigin`). 인쇄하는 QR에는 `/b/:buildingId?via=qr`을 담아 공개 화면이 현관 QR로 들어온 것을 알게 하고, 링크 복사·카카오톡 공유 주소에는 붙이지 않습니다. `VITE_TEAM_CONTACT_URL`(https·http·mailto 주소)은 월계함 팀 연락처로, 건물 확인(23)의 ‘팀에 알리기’와 약관·개인정보 처리방침의 문의 링크가 됩니다(`lib/teamContact.ts`). 없거나 다른 형식이면 ‘팀에 알리기’를 숨기고 약관에는 문의 창구를 준비 중이라고 적습니다.

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
- 웹이 API보다 먼저 배포되는 한 번 동안은 이전 API 응답도 받습니다(`lib/apiCompat.ts`의 `tolerant`): `/api/me`·시연 로그인·약관 동의 응답에 약관 필드가 없으면 판·시각은 null, `termsUpToDate`는 true(다시 동의 시트를 띄우지 않음)로 채우고, 관리 건물(목록·상세·건물 확인 응답)에 `confirmedAt`이 없으면 확인한 건물(`CONFIRMED_AT_UNKNOWN`)로 채운 뒤 같은 contracts 스키마로 검사합니다. 새 API가 dev·prod에 모두 배포되면 지웁니다.
- 재시도는 react-query 한 곳에서만 합니다. 쓰기 요청(POST·PATCH·DELETE)은 자동으로 다시 보내지 않습니다.

## 3. 폴더 구조

```text
apps/web/src/
├── main.tsx            진입점
├── app/                providers(query·snackbar), router, 오류 경계, `/b/:id` 나누기(BuildingRoute),
│                       스플래시(Splash), 연결 뒤 알림 선택(ConnectedNotifyPrompt)
├── screens/<screen>/   lofi 화면 하나 = 폴더 하나. 그 화면의 시트·상태도 여기
├── features/<domain>/  buildings · guides · notices · reports · tips · occupancy · push · auth
│                       API 훅(useGuide 등)과 여러 화면이 쓰는 도메인 컴포넌트
├── components/         SEED 위에 만든 앱 공통 UI (화면 상태, 하단 CTA, 탭바, 함이 그림, 6칸 코드, QR, 나가기 확인)
├── lib/                api, errors(오류 코드 → 문구), format, returnTo, share, reportAccess, text, speech, pushEnv
├── styles/             tokens.css(--wh-*), global.css
└── assets/hami/        화면에서 실제로 쓰는 함이 사본만
```

구현 현황은 코드가 기준입니다. 폴더를 새로 만들 때 이 구조를 따릅니다.

- 화면 폴더는 kebab-case, 컴포넌트 파일은 PascalCase(`GuideDetailScreen.tsx`), 훅·유틸은 camelCase(`useGuide.ts`)로 짓습니다. 화면 컴포넌트 첫 줄에 LF ID와 lofi 번호를 적습니다: `// LF-02 기본 안내 상세 · lofi 11 12 13 14 44`
- 화면끼리는 서로 import하지 않습니다. 두 화면이 같이 쓰면 `features/`나 `components/`로 옮깁니다.
- 디자인 값은 `--wh-*`와 SEED 토큰(`--seed-*`)만 씁니다. 색·간격 숫자를 컴포넌트에 직접 적지 않습니다.
- 함이는 `design/characters/hami/images/` 원본(1254px)에서 같은 파일명으로 줄인 사본을 `assets/hami/`에 둡니다. 화면용은 360×360(표시 폭 40~172px의 약 2배), `hami-mini`는 120×120, 스플래시(00)는 `house-640.png`·`envelope-640.png`(640×640)입니다. ImageMagick Lanczos로 줄인 뒤 `pngquant --quality=88-100`으로 줄였고(한 장 6~70KB), 알파 투명·여백·가장자리(흰색·#EEF1F7·남색 바탕 비교)를 확인했습니다. 원본은 고치지 않습니다. 새 포즈를 넣을 때도 같은 방법으로 만들고 원본을 바꾸면 사본을 다시 만듭니다.

**기본 스타일 (결정, [decisions.md](decisions.md) D-10)**

- lofi를 기준으로 합니다. 주 색은 남색 `#25355a`(lofi `--navy-600`), 보조는 달빛 `#c9a45c`(`--moon`), 글꼴은 Pretendard입니다. 글꼴은 CDN 없이 npm `pretendard`(버전 고정)의 가변 글꼴 dynamic subset CSS를 `main.tsx`에서 불러와 함께 배포합니다(외부 출처·SRI 관리 없음, 오프라인·같은 출처). 화면에 쓰인 글자의 조각만 받고 `font-display: swap`이라 받기 전에는 시스템 글꼴로 먼저 그립니다. `styles/tokens.css`의 `--wh-*` 값을 lofi 값으로 맞춥니다.
- SEED 브랜드 색 기본값(당근 주황)은 `--seed-color-bg-brand-solid` 등을 덮어써 남색으로 바꿉니다. SEED가 브랜드 값을 `:root[data-seed-color-mode="light-only"]`에 두므로 `:root, :root[data-seed-color-mode="light-only"]` 선택자로 뒤에서 덮습니다(`styles/tokens.css`).
- 다크 모드는 설계하지 않았으므로 `<html data-seed-color-mode="light-only">`로 고정합니다.


## 4. 라우트 (결정)

건물 주소는 `/b/:buildingId` 하나로 씁니다. `buildingId`는 서버가 발급한 uuid이고 건물 이름·주소로 만들지 않습니다. QR에 인쇄되므로 바꾸지 않습니다. 더 짧은 공개 키는 [database.md](database.md)에서 정할 것으로 둡니다.

| URL | `screens/` | 화면 (lofi 번호) | 누가 |
|---|---|---|---|
| `/b/:buildingId` | `app/BuildingRoute` → `public-building` / `resident-home` | LF-01(01·30·28). 이 건물 거주자면 같은 주소에서 LF-05(03·10). 집주인 본인에게만 ‘관리하기’. `?via=qr`(인쇄한 QR)은 `BuildingRoute`가 첫 렌더에 한 번 읽고 `replace`로 지우며(두 화면 모두), ‘현관 QR’ 배지는 공개 화면에만 보입니다 | 누구나 |
| `/b/:buildingId/first` | `first-guide` | 처음 오셨나요(36·46) | 누구나 |
| `/b/:buildingId/guides/:guideId` | `guide-detail` | LF-02(11·14), 시트 12·13·44 | 누구나, 메모는 거주자 |
| `/b/:buildingId/notices/:noticeId` | `notice-detail` | LF-03(15). 끝난 공지는 “종료된 공지예요”. 알림을 누르면 여기 | 누구나 |
| `/b/:buildingId/connect?returnTo=` | `connect` | LF-04(02·16·기존 관계 변경 확인). 연결 뒤 시트 17은 돌아간 화면 위에 | 누구나 |
| `/b/:buildingId/tips` | `tips` | LF-06(04·18, 시트: 내 팁 고치기·지우기, 신고). 연결 전이면 44를 화면으로 | 거주자, 집주인(읽기·신고) |
| `/b/:buildingId/tips/new`, `…/tips/:tipId/edit` | `tip-write` | LF-07(19). 저장하면 들어오기 전 화면으로 돌아가고 hami-mini 토스트 | active 거주자(고치기는 reconfirm_needed도) |
| `/b/:buildingId/report` | `report-compose` | LF-10 직접 적기(05) → 확인 시트 20 → 06으로 `replace`. 자주 쓰는 말 20은 01 안(두 번 누름), 거주자 홈·크게 보기·안내 없음에서는 알리기 입구 시트(자주 쓰는 말 + 직접 적기) | 누구나(그 건물 집주인은 403 안내) |
| `/r/:reportId#t=<token>` | `report-status` | LF-11(06 보낸 직후, 31 결과). 집주인이 열면 `…/manage/…/reports/:id`로 | 확인 링크·이 브라우저 토큰·보낸 계정 |
| `/me`, `/me/reports`, `/me/tips` | `me`, `sent-reports`, `my-tips` | LF-09(45. 시트 40·08), LF-08(21), 내가 남긴 팁(가려짐·이사한 건물 표시) | 로그인 사용자 |
| `/me/moved` | `move-out-done` | LF-09 연결 종료(09). history state `moved`가 없으면 `/me`로 | 이사를 마친 사람 |
| `/invite#t=<inviteToken>` | `landlord-invite` | LF-12(41). 새로 수락하면 23으로, 이미 관리자면(`alreadyManager`) 관리 홈으로 | 초대받은 사람 |
| `/manage/:buildingId/confirm` | `landlord-confirm` | LF-12 건물 확인(23). `confirmedAt`이 null인 건물만(건물마다 처음 열 때 한 번 판정해 다른 건물로 옮겨도 판정·입력이 이어지지 않음, 이미 확인했으면 관리 홈으로 `replace`). 이름은 고칠 수 있고 주소는 잠김. ‘맞아요’(`POST …/confirm`, 고친 이름만 보냄) → 안내가 없으면 33, 있으면 관리 홈. ×는 관리 홈(미확인·공개 안내 0개면 ‘건물 확인하기’ 카드) | 집주인 |
| `/manage` | `manage-index` | 관리하는 건물의 관리 홈으로 이동(여러 건물 선택은 파일럿 이후) | 집주인 |
| `/manage/:buildingId/ready` | `setup-done` | LF-12 준비 완료(38) | 집주인 |
| `/manage/:buildingId` | `landlord-home` | LF-13. 확인할 것이 없으면 42(이어서 할 것이 ‘지금 보이는 것’ 바로 아래), 확인 전 메모·새 제보가 있으면 24(확인할 것이 맨 위 + 세입자 화면 링크) | 집주인 |
| `/manage/:buildingId/guides/new`, `…/:guideId/edit`, `…/:guideId/preview` | `guide-write`, `guide-preview` | LF-14(33, 43). 공개한 안내는 수정본을 고치고(닫기 = 수정본 지우기) 43에서 ‘수정 공개’. `?apply=<메모 id,…>`로 반영할 메모를 들고 다님 | 집주인 |
| `/manage/:buildingId/notices/new` | `notice-write` | LF-15(34). 올리면 37로 `replace` | 집주인 |
| `/manage/:buildingId/notices/:noticeId` | `notice-posted` | LF-15(37). 관리 홈의 진행 중 공지에서도 옴 | 집주인 |
| `/manage/:buildingId/inbox`, `…/reports/:reportId` | `landlord-inbox`, `report-inbox` | 받은 내용 탭(확인할 것·확인한 내용·확인 전 수정 메모), LF-16(07 확인했어요 → 35 처리 결과, 알림 32에서 진입). ‘공지로 알리기’는 빈 공지 쓰기(34) | 집주인 |
| `/manage/:buildingId/settings` | `landlord-settings` | 설정 탭(lofi 없음): 건물 정보·크게 보기·약관·로그아웃 | 집주인 |
| `/manage/:buildingId/memos/:memoId` | `memo-review` | LF-17(25). 반영 → `…/guides/:guideId/edit?apply=<memoId>`, 유지 → 사유 시트 | 집주인 |
| `/manage/:buildingId/qr` | `qr-code` | LF-18(26) QR 인쇄·가입코드 복사·바꾸기 | 집주인 |
| `/manage/:buildingId/card` | `move-in-card` | LF-18(39) 입주 카드 인쇄·카카오톡 보내기 | 집주인 |
| `/demo` | `demo` | LF-20(29). `GET /api/dev/demo`가 404면(DEMO_MODE 아님) 없는 주소(22)와 같게 보임 | 시연자 |
| `/terms`, `/privacy` | `legal` | 약관·개인정보 처리방침 초안(D-28, lofi 없음). 본문은 `content/terms/*.ts`(문단·목록·항목만, HTML 해석 없음), 맨 위 ‘초안 · 법률 검토 전’, 시행일은 contracts `TERMS_VERSION` | 누구나 |
| 그 밖 | `not-found` | 건물 없음(22) | 누구나 |

- `/`(manifest `start_url`)는 화면 없이 나누기만 합니다. 집주인은 `/manage/:buildingId`, 거주자는 `/b/:buildingId`로 보냅니다. 둘 다 아니면 “현관 QR로 우리 건물을 열어 주세요”와 내 정보 링크를 보여주고, 로그인 전이면 ‘카카오로 로그인’(돌아올 곳 `/`)을 둡니다(로그인이 끝난 홈 화면 앱이 막다른 곳이 되지 않게). 스플래시(00)는 홈 화면 아이콘으로 열 때만(`display-mode: standalone`·`navigator.standalone`이면서 `start_url`인 `/`로 열렸을 때) 앱 틀이 한 번 약 1초 덮습니다. 알림을 눌러 공지 주소로 바로 열리면 보이지 않습니다.
- 하단 탭(`components/TabBar.tsx`)은 탭 첫 화면과 lofi가 탭을 그린 화면에 붙입니다. 거주자 `우리 건물`(`/b/:id`)·`내 정보`(`/me`), 집주인 `건물 관리`·`받은 내용`·`설정`. 탭 첫 화면이 아니어도 탭을 두는 곳은 lofi대로 받은 내용 상세(07·35, `받은 내용`), 공지 올린 뒤(37, `건물 관리`), 보낸 내용(21)·내가 남긴 팁(`내 정보`)입니다. 그 밖의 쓰기·상세 화면은 탭 없이 뒤로 가기로 돌아옵니다.
- `/b/:buildingId`는 `/api/me`와 건물·안내·공지 요청을 함께 보내고, 로그인 확인이 끝난 뒤 공개 화면과 거주자 홈 중 하나를 그립니다(거주자에게 공개 화면이 먼저 번쩍이지 않게). `/api/me`가 실패하면 누구나 읽을 수 있는 공개 화면을 보여줍니다. 판정한 `me`는 공개 화면에 prop으로 넘깁니다(공개 화면이 다시 `useMe`를 부르면 실패한 요청을 마운트마다 다시 보내 로딩과 오가며 돕니다). `/api/me`가 1초 넘게 늦으면 건물 정보가 온 대로 공개 화면을 먼저 그리고, 거주자로 확인되면 거주자 홈으로 바꿉니다. 두 화면 코드는 `BuildingRoute`를 불러올 때 함께 받습니다.
- 화면 폴더마다 `route.tsx`에서 `Component`를 export하고, `app/router.tsx`가 `lazy`로 불러옵니다. 새 화면은 이 표와 라우터에 함께 추가합니다.
- 시트(08·12·13·17·20·40·44)에는 URL을 만들지 않습니다. 작성 중인 시트가 열린 채 뒤로 가면 `useBlocker`로 확인을 받습니다.
- 권한은 서버가 판정합니다. 라우트 guard는 로그인 이동과 권한 없음 표시에만 쓰고, 버튼 숨김으로 권한을 대신하지 않습니다.
- lofi에 있지만 아직 만들지 않은 행동은 숨기지 않고 비활성으로 두며, `aria-describedby`로 “다음 업데이트에서 열려요”를 연결합니다.
- `/demo`는 시연용 건물 데이터만 쓰고 실제 화면과 상태를 공유하지 않습니다. 실제 첫 화면에 `/demo` 링크를 두지 않습니다. 역할 카드는 `GET /api/dev/demo`의 계정(`purpose: "e2e"`는 숨김)과 비회원 제보(`guestReport`가 있을 때만 ‘옆 건물 주민’)이고, 카드의 숫자는 응답에서 셉니다. 고르면 시연 로그인(`consent` 포함)으로 바꾼 뒤 집주인은 관리 홈, 연결한 거주자는 `/b/:id`(거주자 홈), 연결 전 B는 시연 건물 공개 화면, 비회원은 로그아웃하고 `statusPath`(제보 상태)로 갑니다. 옆 건물 주민(비회원) 카드는 `statusPath`의 확인 토큰으로 그 제보를 읽어 “비회원 · 제보 1건 접수됨”(확인함·처리 완료)처럼 지금 상태를 적고, 읽기 전·실패면 “비회원 · 보낸 제보 1건”입니다. ‘시연 초기화’는 확인 대화상자 → `POST /api/dev/reset`(발표 시연 건물 두 곳, 햇살빌라·새봄하우스만 되돌림. e2e 건물 테스트빌라·준비빌라는 `db:seed -- --reset-demo`로만) → 응답에 담긴 되돌린 건물의 이 기기 흔적(`wh.visited.<id>`, 그 건물 제보 확인 링크·쓰던 안내)과 가입코드·초대·메모·팁 초안, `wh.reconfirmAsked`, `dev`·`me` 밖의 캐시를 지우고 시연 목록과 내 정보를 다시 받습니다. 429는 `Retry-After`로 기다릴 시간을 적습니다.

## 5. 데이터와 화면 상태

[개발 계약](../lofi/screens.md#개발-계약-초안)을 코드로 옮기는 규칙입니다. 아래 상태는 모두 다른 UI로 그립니다(screens.md §8).

| 상태 | 판정 | 보여줄 것 |
|---|---|---|
| 불러오는 중 | query pending | 300ms가 지나면 SEED `Skeleton`. 3D 자리는 정적 그림 |
| 빈 화면 | 성공했지만 0개 | 화면별 빈 상태(예: 14 “아직 등록된 안내가 없어요”) |
| 오류 | `NETWORK`·`INTERNAL_ERROR` | “불러오지 못했어요” + 다시 시도. 빈 화면으로 표시하지 않음 |
| 없음 | `NOT_FOUND` | 화면별 없음 상태(예: 22 “건물 정보를 찾을 수 없어요”) |
| 권한 없음 | `NOT_BUILDING_MANAGER` / `FORBIDDEN` | “이 건물을 관리할 권한이 없어요” / 화면별 문구(초안). 관리하는 건물이 없는 계정에는 ‘○○ 화면으로’(연결한 건물, 없으면 첫 화면)와 ‘다른 계정으로 로그인’을 둠 |
| 연결·재확인 필요 | `NOT_CONNECTED` / `RECONFIRM_NEEDED` | 연결 안내 시트(44) / 재확인 시트(40) |
| 로그인 필요 | `UNAUTHENTICATED` | 로그인한 뒤 보던 화면으로 |

- `/api/me`는 401만 ‘로그인 전’(`null`)으로 봅니다. 연결 문제·서버 오류는 로그인 전 화면을 보여주지 않고 다시 시도하게 합니다(`/`는 “불러오지 못했어요”, `/invite`는 하단 버튼 자리에 “다시 시도”).

**로그인과 연결 뒤에는 보던 화면으로 돌아옵니다.**

- 로그인은 `/api/auth/kakao/start?returnTo=<지금 경로>`로 이동합니다. `returnTo`는 contracts의 `ReturnTo` 규칙(`/`로 시작, `//`·`\`·`#`·공백 없음, 512자 이하)을 지켜야 하고, 어기면 400 `VALIDATION_FAILED`입니다.
- 취소하면 `?login=cancelled`, 실패하면 `?login=failed`가 붙어 돌아옵니다(`LOGIN_RESULT_PARAM`, `LoginResult`). state 쿠키를 잃은 실패는 `/`로 돌아옵니다. 결과를 안내한 뒤 이 쿼리는 주소에서 지웁니다.
- 떠나기 전 입력(가입코드, 초대 토큰, 쓰던 메모·팁·제보)은 저장해 두었다가 돌아오면 채웁니다. `#t=` 토큰은 로그인을 거치면 사라지므로 이동 전에 옮기고 주소창에서 지웁니다. **자동으로 보내지 않고** 사용자가 다시 눌러야 보냅니다.
- 쓰기·처리 중 로그인이 끝나면(401) ‘로그인이 필요해요’만 두지 않고 그 자리에 ‘다시 로그인하기’(`features/auth/LoginAgainButton.tsx`, 돌아올 곳은 지금 주소)를 둡니다: 수정 메모(12)·생활 팁(19)은 쓰던 내용을 `wh.memoDraft`·`wh.tipDraft`에 두고 가고, 기존 유지(25)·팁 신고·팁 지우기·재확인(40)·이사(08)·받은 내용 처리(07·35)는 돌아와 다시 누릅니다. 제보 보내기(05·20)는 로그인 없이도 되므로 해당하지 않습니다.
- `/api/me`를 불러오지 못하면(연결 문제) 거주자인지 모르므로 안내 상세의 메모 자리에 “내 정보를 불러오지 못했어요 · 다시 시도”를 두고, 연결 안내(44)를 띄우거나 `?memo=write`·쓰던 메모를 지우지 않습니다.
- 초대 미리 보기·수락이 다시 보내도 같은 결과로 끝나면(`NOT_FOUND`·`INVITE_EXPIRED`·`CONFLICT`·`VALIDATION_FAILED`·`FORBIDDEN`) 저장한 초대 토큰을 지우고 수락 버튼을 막습니다. 연결 문제·서버 오류·`RATE_LIMITED`·`UNAUTHENTICATED`는 다시 시도할 수 있으니 남깁니다.
- `/invite`에서는 시연용 로그인을 보이지 않습니다. 관리 권한은 초대받은 카카오 계정에만 생기기 때문입니다. 다른 로그인 화면에서는 시연 모드일 때만 보입니다.
- 집주인이 쓰던 안내는 기기에 남아야 하므로 localStorage에 두고, 서버에는 ‘미리 보기’를 누를 때만 초안으로 저장합니다. 쓰기↔미리 보기 이동은 `replace`라 뒤로 가면 관리 홈으로 갑니다.
- 쓰던 안내는 사용자별로 두고 저장한 시각(`savedAt`)을 함께 넣습니다. 7일이 지난 것은 읽을 때 지우고, 로그아웃하면(`logout()`) 그 사용자의 것을 모두 지웁니다. 로그아웃은 내 정보(45)와 집주인 설정 탭에 있습니다. 이 브라우저에 알림 구독이 있으면(브라우저 구독, 없으면 `wh.pushSaved`) 그 주소를 로그아웃 본문(`{ pushEndpoint }`, contracts `LogoutBody`)에 담아 서버가 같은 요청에서 내 구독을 지우게 하고, 요청이 끝나면 성공·실패와 상관없이 브라우저 구독을 끊고 `wh.pushSaved`를 지웁니다(구독이 없으면 본문 없이 보냄). 서버가 로그아웃을 확인한 뒤에만 화면을 로그인 전으로 바꿉니다. 실패하면 세션 쿠키가 살아 있으므로 로그인된 화면에 오류를 두고 다시 누르게 합니다(공용 기기). 이 기기에 남은 쓰던 내용(쓰던 안내·초대 토큰·가입코드·다시 로그인용 메모·팁)은 성공·실패와 상관없이 지웁니다.

**우리 건물로 연결(LF-04)**

- 1/2 가입코드: 입력칸 하나 위에 6칸을 그립니다. 대문자 영숫자만 받고, “가입코드: WK7-2P4”처럼 문장째 붙여넣어도 코드만 고릅니다(`features/occupancy/joinCode.ts`). 문장 속에서는 서버가 쓰는 글자(0·O·1·I·L 제외)로 된 후보만 보고, ‘가입코드’·‘코드’ 바로 뒤의 것을 고릅니다. 후보가 없으면 채우지 않습니다(“ABC 123 하우스”를 코드로 넣지 않음). 휴대폰 인증번호 자동 채우기(`one-time-code`)는 쓰지 않습니다.
- 로그인 전이면 `join-code/check`로 확인하고 결과를 sessionStorage `wh.connect`(30분)에 둔 뒤 2/2(16)로 갑니다. 이미 로그인했고 다른 건물 연결이 없으면 로그인 단계를 건너뛰고 바로 연결합니다.
- 카카오에서 돌아오면 같은 주소에서 확인한 코드를 채운 “○○에 연결하기”를 보여주고, 사람이 다시 눌러야 연결합니다. 다른 건물에 연결돼 있으면(`me.occupancy` 또는 409 `ALREADY_CONNECTED`) ‘기존 관계 변경 확인’을 거쳐 `replaceOccupancyId`로 보냅니다. 서버가 거절하면 “지금 연결은 그대로예요”를 버튼 위에 둡니다. 시간 초과·연결 끊김처럼 결과를 모르면 단정하지 않고(“옮겨졌는지 확인하지 못했어요”) 내 정보를 새로 받습니다. 옮겨졌으면 새로 받은 내 정보로 ‘이미 연결돼 있어요’가 됩니다(`screens/connect/outcome.ts`).
- 1/2에서 로그인 전이면 “이미 연결했어요 · 로그인”으로 코드 없이 로그인하고 돌아갈 곳(`returnTo`)으로 갑니다(카카오톡에서 연결한 뒤 Safari로 연 경우 등). 이미 이 건물에 연결돼 있으면 확인해 둔 코드를 지우고 ‘이미 연결돼 있어요’를 보여줍니다. 1/2에서 뒤로 나가거나 2/2에서 코드 단계로 돌아가도 `wh.connect`를 지웁니다.
- 재확인 요청 중이거나 재확인이 필요한 거주자(D-17)는 ‘이미 연결돼 있어요’ 대신 1/2를 보여주고, 코드를 다시 맞히면(`reconfirmed: true`) “거주를 확인했어요”를 띄웁니다.
- 2/2 동의 항목(`features/auth/ConsentChecks.tsx`)의 ‘보기’는 요약 시트(`features/auth/ConsentSheet.tsx`)를 열고, 시트의 ‘전문 보기’가 `/terms`·`/privacy`(법률 검토 전 초안, D-28)로 갑니다. 두 항목에 동의하면 카카오 시작 주소와 시연 로그인에 `consent=<TERMS_VERSION>`을 함께 보내 서버가 계정에 동의한 판과 시각을 남깁니다(`kakaoStartUrl(returnTo, consent)`, `LoginActions`의 `consent`). 요약의 개인정보 항목은 카카오에는 회원번호만 요청한다는 것, 이름·전화번호·프로필 사진을 저장하지 않는다는 것, 보관 기간, 동의하지 않을 권리와 그 결과(로그인·연결은 못 하지만 안내·공지 보기와 알리기는 됨)를 적고 `content/terms/privacy.ts`와 같은 사실만 씁니다(`screens/legal/legal.test.tsx`).
- **모든 로그인 입구에서 로그인 전에 같은 필수 동의를 받습니다**(오케스트레이터 결정). 16은 화면 안의 동의 항목을 쓰고, 그 밖의 `LoginActions`(루트·내 정보·내 정보 아래 화면·집주인 화면 입구·초대·제보 상태)와 1/2의 ‘이미 연결했어요 · 로그인’은 버튼을 누르면 동의 시트(`LoginConsentSheet`, 같은 두 항목과 ‘보기’)를 열고, ‘동의하고 계속하기’를 누르면 누른 로그인(카카오·시연)을 `consent=<TERMS_VERSION>`과 함께 이어 갑니다. 다른 시트 안에도 있는 ‘다시 로그인하기’(`LoginAgainButton`, 메모 시트 12 포함)는 시트를 겹치지 않고 그 자리에 동의 항목을 펼칩니다(‘전문 보기’로 떠나기 전에도 쓰던 내용을 저장). 지금 판에 이미 동의한 계정(남아 있는 `/api/me`의 `termsUpToDate`가 true, 다시 로그인)은 동의 단계를 건너뛰고 판을 보내지 않습니다(서버의 동의 기록을 그대로 두고, 다른 계정으로 로그인하면 아래 다시 동의 시트가 물음). 판단은 `loginConsentStep` 한 곳입니다.
- 판이 바뀌었거나 동의 기록이 없는 계정은 `/api/me`의 `user.termsUpToDate`가 false입니다. 앱 틀(`RootLayout`)이 이때만 다시 동의 시트(`features/auth/TermsConsentSheet.tsx`)를 불러와 앱을 열 때 한 번 띄웁니다. 앞 판에 동의했던 분께는 ‘바뀐 점’(`content/terms/version.ts`의 `TERMS_RELEASE.changes`, 판을 올릴 때 함께 고침)을 짧게 보여줍니다. ‘동의하고 계속하기’는 `POST /api/me/terms-consent`(`{ version }`, 409면 “약관이 방금 바뀌었어요”), ‘나중에’는 이번 실행(`wh.termsAsked`)에서 그 계정에게 다시 띄우지 않고 읽기는 막지 않습니다(시연 로그인으로 계정을 바꾸면 새 계정에는 다시 물음). `/terms`·`/privacy`·`/demo`에서는 띄우지 않고, 저절로 뜨는 다른 시트(17·40·돌아온 메모 12)와 겹치지 않게 맨 뒤 차례를 기다립니다([interaction.md §4](interaction.md#4-시트)). 약관 링크는 내 정보(45) 맨 아래와 집주인 설정 탭에도 있습니다.
- `JOIN_CODE_INVALID`는 칸 아래, `JOIN_CODE_LOCKED`는 `Retry-After`로 남은 분을 세고 그동안 입력을 막습니다. 그 시각이 되면 타이머로 바로 풉니다. 로그인 뒤 연결에서 코드가 틀리면 가입 중 코드가 바뀐 것으로 보고 1/2로 돌아갑니다.
- 연결하면 `returnTo`(같은 건물 화면만, 기본 건물 홈)로 `replace`하고 history state `connected`를 남깁니다. 거주자 홈은 이것으로 환영(10, 함이 house)을, 앱 틀은 알림 선택 시트(17)를 한 번 띄웁니다. 시트를 닫으면 state에 표시해 새로고침해도 다시 뜨지 않습니다.

| 저장소 | 키 | 내용 |
|---|---|---|
| localStorage | `wh.size` | 크게 보기 |
| localStorage | `wh.visited.<buildingId>` | 첫 방문 여부 (LF-01 함이) |
| localStorage | `wh.guideDraft.<userId>.<buildingId>.<guideId\|new>` | 쓰던 안내와 `savedAt`. 7일 뒤·로그아웃 때 지움 |
| localStorage | `wh.reportAccess` | 비회원 제보 조회 토큰 `[{ reportId, buildingId, token, savedAt, expiresAt }]`. 건물마다 최근 20개, 서버 만료 시각이 지나거나 재조회에서 null이면 지움 |
| sessionStorage | `wh.inviteToken` | 로그인을 거치는 동안의 초대 토큰. 수락·쓸 수 없는 초대·로그아웃 때 지움 |
| sessionStorage | `wh.connect` | 확인한 가입코드·건물·돌아갈 곳과 `savedAt`(LF-04). 30분 뒤·연결·로그아웃 때 지움 |
| sessionStorage | `wh.splash` | 이번 앱 실행에서 스플래시(00)를 보였는지 |
| sessionStorage | `wh.memoDraft` | 로그인이 끝나 다시 로그인하러 갈 때의 쓰던 수정 메모(`guideId`·`body`·`savedAt`). 돌아와 한 번 채우면·30분 뒤·로그아웃 때 지움 |
| sessionStorage | `wh.tipDraft` | 로그인이 끝나 다시 로그인하러 갈 때의 쓰던 생활 팁(`buildingId`·`tipId`(새로 쓰기면 null)·`category`·`body`·`savedAt`). 같은 작성 화면에 한 번 채우면·30분 뒤·로그아웃 때 지움 |
| localStorage | `wh.reconfirmAsked` | 재확인 시트(40)를 먼저 띄운 날(`{ value: 연결 id + 다음 확인 시각, at }`). 한국 날짜로 하루 한 번만 |
| sessionStorage | `wh.termsAsked` | 다시 동의 시트에서 ‘나중에’를 누른 계정과 판(`<userId>:<TERMS_VERSION>`). 이번 실행에서 다시 띄우지 않음 |
| localStorage | `wh.pushSaved` | 서버 저장을 확인한 이 브라우저의 푸시 구독(`endpoint`·`userId`). 이것과 브라우저 구독이 맞아야 ‘켜짐’. 알림 끄기·로그아웃·건물 옮김 때 지움 |

- 키는 `wh.`로 시작하고 새 키는 이 표에 추가합니다. 개인정보 처리방침 초안(`content/terms/privacy.ts` §2)에도 같은 키와 지우는 때를 적습니다. 코드에 있는 키가 방침에 빠지면 `screens/legal/legal.test.tsx`가 실패합니다. 읽기·쓰기는 모두 try/catch로 감쌉니다.
- 이미 로그인했으면 16을 건너뜁니다. 연결 뒤 알림 선택(17)은 한 번만 보여주고, 환영·첫날 안내를 연달아 띄우지 않습니다.

**수정 메모·재확인·이사 (C·D)**

- 안내 상세(11)의 메모 자리는 사람마다 다릅니다(`features/guides/memos.ts`의 `memoAccess`): active 거주자는 ‘메모 남기기’(12), 로그인 전·다른 건물·이사한 사람은 연결 안내(44), `reconfirm_needed`는 읽기만(“거주 확인이 필요해요” + ‘거주 확인’ → 40), 그 건물 집주인은 ‘안내 고치기’. 거주자(active·reconfirm_needed)에게만 안내 아래 메모와 결과(집주인 확인 전·반영됨·기존 유지 + 사유)를 보여주고 내 메모를 먼저 둡니다. 목록을 못 받으면 ‘메모 없음’이 아니라 “불러오지 못했어요 · 다시 시도”입니다.
- 44의 ‘우리 건물로 연결하기’와 다시 로그인은 `?memo=write`가 붙은 안내 주소로 돌아옵니다. 돌아오면 쿼리를 지우고 메모 시트를 엽니다(연결 직후 알림 선택 17이 떠 있으면 닫은 뒤). 로그인이 끝나 못 보낸 메모는 `wh.memoDraft`로 채우고, 어느 경우든 자동으로 보내지 않습니다.
- 메모 남기기는 `RATE_LIMITED`(같은 안내에 1분 안에 다시)·`NOT_CONNECTED`·`RECONFIRM_NEEDED`를 시트 안 문구로 알리고 내 정보를 다시 받습니다. 연결 문제면 입력을 그대로 둡니다.
- 관리 홈의 확인할 것은 관리 목록의 `pendingMemoCount`·`newReportCount`와 확인 전 메모 목록으로 만들고, 메모는 안내마다 한 줄(가장 최근 메모의 25로)입니다. 둘 다 못 받으면 ‘확인할 것 없음’ 대신 다시 시도를 둡니다.
- 공개한 안내 고치기(33): `GET …/revision`으로 수정본을 이어서 고치고, 미리 보기를 누르면 폼 전체를 `PATCH`(수정본 저장) 합니다. 저장이 실패하면 입력·공개 내용·메모 상태가 그대로이고 버튼 위에 “공개 중인 안내는 그대로예요”를 둡니다. 닫기(×)는 수정본이나 고친 내용이 있으면 한 번 묻고 `DELETE …/revision`만 합니다. 뒤로 가기는 수정본과 이 기기 초안을 남겨 다음에 이어 씁니다.
- 43 ‘수정 공개’는 `{ applyMemoIds }`를 함께 보냅니다(첫 공개는 빈 목록). 같은 안내의 다른 확인 전 메모는 체크 목록으로 고르고, 고른 것 중 이미 처리된 메모는 빼고 보냅니다. 409면 수정본과 메모 목록을 다시 받아 “메모 상태가 바뀌었거나 이미 공개했어요”를 둡니다. 기존 유지(25)의 409는 시트를 닫고 결과를 다시 불러 “다른 곳에서 먼저 처리했어요”를 보여줍니다.
- 재확인은 `me.occupancy`의 `status`·`reconfirmRequested`로 나눕니다(`features/occupancy/reconfirm.ts`): 요청 중이면 거주자 홈 맨 위 배너(기한 날짜) + 시트 40을 하루(한국 날짜)에 한 번 먼저, `reconfirm_needed`면 배너·‘거주 확인 필요’ 배지와 함께 종 버튼·내 정보 ‘공지 알림’이 알림 시트 대신 40을 엽니다(서버가 알림 켜기를 막음). ‘아직 살아요’는 내 정보 캐시를 바로 고칩니다.
- 이사(08)는 내 정보와 40의 ‘이사했어요’에서 엽니다. 끝나면 `/me/moved`(09)로 가고, 그 화면이 열린 뒤 내 정보의 연결과 메모 캐시를 비웁니다(앞 화면이 ‘연결 없음’으로 번쩍이지 않게). ‘건물 화면으로’는 건물 공개 화면으로 `replace`합니다(lofi 09는 ‘확인’이지만 interaction.md §9에 맞춰 할 일을 적음. 이사한 뒤라 ‘우리 건물’이라고 하지 않음). ‘내가 남긴 팁 N개’는 가린 팁을 빼고 셉니다.
- 로그아웃·계정 전환(시연 로그인) 때 계정마다 다른 캐시를 지웁니다(`features/auth/queries.ts`의 `ACCOUNT_QUERY_KEYS`: `manage`·`memos`·`reports`·`tips`·`guide`). 남겨 두면 뒤로 가기로 이전 계정의 제보 상세·집주인 초안이 보입니다. 로그아웃은 지우고(`removeQueries`), 계정 전환은 지금 화면이 새 계정으로 다시 받도록 되돌립니다(`resetQueries`).

**이 브라우저에서 다시 보기 (제보, LF-11·30)**

- 제보 생성 응답의 `accessToken`은 한 번만 옵니다. 받는 즉시 `lib/reportAccess.ts`의 `saveReportAccess`로 건물별로 저장하고(만료는 응답의 `accessExpiresAt`), 접수 화면 `/r/:reportId#t=<token>`으로 갑니다. 저장에 실패하면(`false`) 06이 “이 브라우저에 저장하지 못했어요”로 확인 링크 보관 안내를 더 크게 보여줍니다. 로그인해서 보냈으면 토큰이 없고 06은 ‘내 정보 › 보낸 내용’을 안내합니다.
- 조회할 때는 `X-Report-Token` 헤더로 보냅니다(`features/reports/queries.ts`). 토큰을 URL 경로·쿼리·로그·오류 보고에 넣지 않습니다. 확인 링크는 `#t=`에 토큰을 두므로 서버 로그와 Referer에 남지 않습니다. `#t=`가 없으면 이 브라우저에 저장한 토큰을 씁니다.
- 주소창의 `#t=`는 이 브라우저에 토큰을 보관한 뒤에만 `replace`로 지웁니다(`lib/reportAccess.ts`의 `keepLinkToken`). 보낸 직후(06)는 이미 보관했으므로 바로, 다른 브라우저에서 연 확인 링크는 보낸 사람으로 조회된 뒤 저장에 성공하면 지웁니다. 지운 뒤에도 화면은 같은 토큰으로 보고 ‘링크 복사’·‘카카오톡으로 공유’는 토큰이 든 전체 링크를 만듭니다. 저장에 실패하면(비공개 모드·저장소 차단) 새로고침해도 볼 수 있게 `#t=`를 남기고, 이때는 주소창·방문 기록에 토큰이 보일 수 있습니다(06이 “이 브라우저에 저장하지 못했어요”로 링크 보관을 더 크게 안내).
- 보낸 직후 state가 남아 있어도 집주인이 이미 확인·처리했으면 06(함이 envelope) 대신 결과 화면(31)을 보여줍니다. 토큰 없이 404면 로그인이 풀렸을 수 있어 내 정보를 다시 받고, 로그인 전이면 ‘카카오로 로그인’을 둡니다.
- 상세 query 키에는 토큰도 둡니다(`["reports", id, token]`, 메모리 안). 틀린 토큰은 404라서, 키가 같으면 다른 토큰으로 받은 결과를 잘못 저장할 수 있기 때문입니다.
- 404(토큰 없음·틀림)는 screens.md §7 문구(“이 브라우저에서는 이전에 보낸 내용을 찾을 수 없어요. 보관한 확인 링크를 열어 주세요”)와 로그인(계정으로 보낸 경우), 410은 “보관 기간이 지나 더 이상 확인할 수 없어요”를 화면 상태로 보여주고 그 토큰을 지웁니다. 결과 상태(확인함·처리 완료·처리가 어려움)에는 함이를 넣지 않습니다.
- 같은 건물을 다시 열면 `useMyReportsForBuilding`이 저장한 토큰(`POST …/reports/lookup`, 본문)과 로그인했으면 `/me/reports`(그 건물만)를 합쳐 ‘내가 보낸 내용’ 배너(30)를 띄웁니다. 한 건이면 바로 그 상태 화면, 여러 건이면 시트 목록입니다. 재조회에서 null인 자리의 토큰은 지우고, 연결 문제로 실패하면 지우지 않습니다. 배너가 있으면 건물 그림은 lofi 30처럼 120px(없으면 150px)입니다. 기본 공개 화면은 이 브라우저에 그 건물 토큰이 있거나 로그인한 계정의 보낸 내용(`/me/reports`)을 아직 모르면 조회하는 동안 같은 크기의 빈 자리(`rp-mine--reserved`) + 120px 그림을 잡아 둡니다(`useMyReportsForBuilding`의 `reserve`). 결과가 오면 배너가 그 자리에 들어가고, 보낸 내용이 없으면(토큰이 모두 무효·계정으로 보낸 것 없음) 잡아 둔 높이를 그대로 두고 그림을 새로 붙여 그 높이를 채웁니다(`pb-scene--fill`). 건물 이름 아래 내용은 움직이지 않습니다(390×844에서 유효 토큰·모두 무효·계정만·계정 결과 없음 네 경우 CLS 0 확인). 크게 보기(28)·안내 없음(14)은 토큰이 있을 때만 자리를 잡습니다.
- 반복 제한(429 `REPORT_TOO_FREQUENT`·`RATE_LIMITED`)은 `Retry-After`로 남은 분을 적고 입력을 그대로 둡니다. 그 건물 집주인(403 `FORBIDDEN`)에게는 자기 건물에는 보낼 수 없다고 알리고 받은 내용으로 가는 링크를 둡니다.
- 보내는 글은 `lib/text.ts`의 `cleanText`로 제어문자를 뺍니다(탭은 공백, 여러 줄 글은 줄바꿈만, 한 줄 글은 줄바꿈도 공백). 서버는 제어문자가 있으면 400입니다(contracts `text.ts`).
- 집주인(07·35)은 ‘확인했어요’를 눌러야 확인함이 되고, 처리 결과(처리 완료·처리가 어려움)와 보낸 분께 한 줄(선택, 한 줄 100자)을 저장합니다. 409는 지금 상태를 다시 받아 그리고 “이미 상태가 바뀌었어요”를 남깁니다. 보낸 사람은 거주자·회원·비회원으로만 씁니다(D-21).

**생활 팁 (LF-06·07)**

- 읽기는 이 건물 active·reconfirm_needed 거주자와 집주인, 쓰기는 active 거주자입니다. 화면은 `features/tips/role.ts`로 상태만 고르고(연결 전은 44를 화면으로, 재확인 필요는 ‘남기기’ 대신 거주 확인 안내, 집주인은 읽기·신고만) 권한은 서버가 다시 판정합니다.
- 작성자는 보이지 않고 날짜는 작성 월만 씁니다. 내 팁에만 ‘내 팁’ 배지와 고치기·지우기(시트, 지우기는 시트 안에서 한 번 더 확인), 남의 팁에는 신고(사유 선택·한 줄)를 둡니다. ‘익명’이라고 쓰지 않습니다.
- 팁 목록·내 팁 query 키에는 사용자 id를 둡니다(`mine`·`editable`이 사람마다 다름). 저장하면 들어오기 전 화면으로 돌아가고 hami-mini 토스트를 띄웁니다. 신고 중이거나 가린 팁을 고치면 409라서 “신고를 확인하는 중이라 지금은 고칠 수 없어요”, 이미 지운 팁(404)은 목록을 새로 받습니다.
- 내가 남긴 팁(`/me/tips`)은 가린 팁을 ‘가려짐’으로(고치기 없이 지우기만), 이사한 건물의 팁은 고칠 수 없다고 적습니다.

**안내와 숫자는 데이터 그대로 보여줍니다.**

- 안내는 집주인이 입력한 제목·본문·사진만 보여주고, 상세(11)·첫날 카드(36)·미리 보기(43)가 같은 본문 컴포넌트를 씁니다. 줄바꿈은 `white-space: pre-line`으로 살리고 본문을 HTML로 해석하지 않습니다(`dangerouslySetInnerHTML` 금지). 요일표처럼 입력하지 않은 구조를 만들지 않습니다.
- 1/4, 안내 N개, ‘월계함에 연결된 거주자 N명’ 같은 숫자는 응답에서 셉니다. 화면에 숫자를 적어 두지 않습니다.
- 안내 타일은 종류 이름만 보여서, 같은 종류 안내가 둘 이상이면 타일 대신 제목 전체와 종류가 보이는 목록(`GuideRows`)으로 그립니다. 공개 화면(01)의 ‘전체 보기’는 타일을 같은 목록으로 펼칩니다(`aria-expanded`). 건물 이름 옆 ‘현관 QR’ 배지(lofi 01)는 인쇄한 QR 주소(`?via=qr`)로 열었을 때만 보입니다.
- 공개된 안내가 없는 건물(14)도 공지와 연결 카드를 그대로 둡니다. 앱 안에서 넘어왔으면 상단이 ‘‹ 건물 안내’(lofi 14), 주소로 바로 열었으면 브랜드 막대입니다.
- 주소는 도로명까지만 보여줍니다. `index.html`의 `noindex`를 유지합니다.

## 6. 오류 처리

API 오류 본문은 contracts의 `ErrorResponse`(`{ error: { code, message?, fields? } }`)입니다. HTTP 상태가 아니라 `code`로 분기합니다. `message`는 개발용 영어라 화면에 쓰지 않습니다. 코드 목록은 contracts의 `ERROR_CODES`, 설명은 [backend.md](backend.md)를 따릅니다.

`lib/errors.ts`의 `toAppError`가 ky 오류를 `AppError`(`code`·`fields`·`retryAfterSeconds`)로 바꿉니다. 응답은 contracts `ErrorResponse`로 파싱하고, 네트워크·시간 초과는 `NETWORK`, 계약과 다른 응답은 `INTERNAL_ERROR`입니다.

- 코드를 문구로 바꾸는 곳은 `lib/errors.ts` 하나입니다. lofi·README에 있는 문구를 먼저 쓰고, 없으면 PR에 초안이라고 적습니다.
- `VALIDATION_FAILED`의 `fields`는 각 입력 아래(`Field.ErrorMessage`)에 보여줍니다. `JOIN_CODE_INVALID`·`JOIN_CODE_LOCKED`도 코드 칸 아래에 두고, 대기 시간은 `Retry-After`로 계산합니다.
- 쓰기 실패(`NETWORK`·`INTERNAL_ERROR`·`REPORT_TOO_FREQUENT`)는 입력을 그대로 두고 버튼 위에 “저장하지 못했어요. 다시 눌러 주세요” 같은 문구를 띄웁니다.
- 다시 보내면 중복이 생기는 쓰기(공지 올리기 34는 알림까지 다시 나감)는 `NETWORK`·`INTERNAL_ERROR`를 ‘결과를 모름’으로 봅니다. “다시 눌러 주세요” 대신 목록을 새로 받아 같은 제목·시작 시각의 방금 올린 공지가 있으면 그 공지(37)로 가고, 없을 때만 다시 올리게 합니다(`screens/notice-write/findPosted.ts`). 쓰던 공지가 있으면 탭 닫기·새로고침도 `beforeunload`로 한 번 묻습니다.
- `NOTICE_ENDED`(“종료된 공지예요”)와 `REPORT_LINK_EXPIRED`(“보관 기간이 지나 더 이상 확인할 수 없어요”)는 토스트가 아니라 화면 상태로 보여줍니다.
- 로그인 시작 전에 `fetch(…, { redirect: "manual" })`로 확인하고, 503 `KAKAO_NOT_CONFIGURED`면 화면 안에서 안내합니다(카카오 키가 없는 PR 미리보기·로컬). 그 밖에는 `/api/auth/kakao/start`로 이동합니다(`features/auth/session.ts`의 `startKakaoLogin`).
- 오류는 해결될 때까지 화면에 남깁니다. SEED `Snackbar`(토스트)는 저장됨·링크 복사처럼 막히지 않는 결과에만 씁니다([interaction.md](interaction.md)).

## 7. 접근성 (세부 주제 04)

| 항목 | 규칙 |
|---|---|
| 크게 보기 | `<html data-size="large">`. 글자·간격 토큰만 바꾸고 연결하기·내가 보낸 내용·관리하기·알리기는 그대로 둡니다. 3D는 정적 그림 |
| 읽어주기 | Web Speech API `speechSynthesis`, `lang="ko-KR"`. 지원하지 않으면 버튼을 비활성으로 두고 이유를 적습니다. 화면을 떠나면 `cancel()` |
| 터치 영역 | 44×44 이상. 주요 버튼은 `ActionButton size="large"`. lofi 모양이 44px보다 작은 것(칩 40px, ‘한 문장으로 다듬기’ 30px)은 모양은 두고 `::before`로 누를 자리를 44px로 넓힙니다. 크게 보기에서 칩은 48px(`--wh-chip-height`). 문장 속 링크는 예외 |
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

## 8. PWA와 웹 푸시

- manifest(`/manifest.webmanifest`)와 service worker(`/sw.js`)는 `public/`에 둡니다. Amplify rewrite가 `.js`·`.webmanifest`는 파일로 내보내므로 SPA fallback에 걸리지 않습니다. 아이콘(`public/icons/`)은 favicon과 같은 브랜드 우표(남색·점선·달)이고 maskable은 여백을 더 둡니다.
- service worker는 푸시를 받아 “새 공지 · {제목}” 알림을 띄우고, 누르면 `url`을 엽니다. 주소는 `new URL(url, 출처)`로 풀어 같은 출처일 때만 쓰고(`//x`·`/\x`·탭이 섞인 주소는 `/`), 알림 막대 아이콘은 흰 우표 모양 `icons/badge-72.png`(투명 바탕)입니다. 이미 열린 창이 있으면 새로 읽지 않고 `postMessage`로 경로를 보내 앱 라우터가 옮깁니다(`app/RootLayout.tsx`, 쓰던 입력은 나가기 확인을 거침). 앱이 1.5초 안에 답하지 않으면 창 주소를 바꾸고, 그것도 안 되면 새 창을 엽니다. 화면·API를 캐시하지 않습니다. `main.tsx`가 앱을 열 때 등록합니다.
- 알림 환경은 [screens.md §6](../lofi/screens.md#6-알림-환경)을 따르고 `lib/pushEnv.ts`의 순수 함수로 판정합니다: 앱 안 브라우저(카카오톡) → iPhone·iPad 홈 화면 추가 전 → 브라우저 미지원 → 서버 공개키 없음(`publicKey: null`, “지금은 알림을 보내지 않고 있어요”) → 차단 → 켜짐 → 켤 수 있음.
- 권한 요청(`Notification.requestPermission()`)은 ‘알림 받기’를 누른 이벤트의 첫 줄에서만 합니다. 알림을 켜지 않아도 연결은 끝난 상태이고, 같은 시트를 내 정보(45)·거주자 홈의 종 버튼에서 다시 엽니다.
- ‘켜짐’은 서버 저장을 확인한 구독만입니다(`wh.pushSaved`). 구독을 만든 뒤 서버 저장이 실패하면(403 `RECONFIRM_NEEDED`, 연결 끊김, 받지 않는 endpoint) 브라우저 구독을 끊고 이유를 보여줘 ‘알림 받기’로 처음부터 다시 하게 합니다. 내 정보에서 시트를 열었는데 저장 확인 없는 구독이 남아 있으면(같은 계정 또는 기록 없음) 한 번 다시 저장해 봅니다. 다른 건물로 옮기면 서버가 구독을 지우므로(D-18) 브라우저 구독도 끊습니다.
- 공개키를 받는 동안은 ‘알림 받기’ 대신 확인 중 자리를 보여줍니다. 권한 창이 떠 있는 동안에는 ‘나중에’로 닫을 수 있고, 권한을 고른 뒤 서버에 저장하는 동안만 닫기를 막습니다.
- 카카오톡 안 브라우저의 “Safari·Chrome으로 열기”·“주소 복사”는 지금 주소가 아니라 내 정보 `/me?notify=1`을 `kakaotalk://web/openExternal?url=`로 엽니다. 외부 브라우저는 로그인·저장소가 따로라서, 로그인하면 내 정보가 알림 선택(17)을 바로 엽니다(`features/push/notifyLink.ts`의 `useNotifySheetState`). 이 주소와 iOS·Android 실제 구독·수신은 아직 실제 기기에서 확인하지 않았습니다(로컬은 VAPID 키가 없어 ‘보내지 않고 있어요’ 상태).

## 9. 성능

- 화면 폴더 단위로 코드를 나눕니다(라우트 `lazy`). 이미지에는 `width`·`height`를 지정하고, 첫 화면 밖 사진은 `loading="lazy"`로 불러옵니다.
- 스켈레톤은 내용과 같은 높이·간격으로 둡니다(`BuildingSkeleton`: 건물 그림 150px, 거주자 홈은 132px, 이름·주소·공지·‘건물 안내’ 제목·타일). 따로 받는 구역이 늦게 오면 아래 내용이 밀리지 않게 자리를 잡아 둡니다(거주자 홈 팁 미리 보기는 카드 높이만큼 `Delayed` 스켈레톤).
- 글꼴은 같은 출처에서 받습니다. 공개 화면(01) 첫 화면은 woff2 조각 11개(약 286KB)를 받고, 글꼴 규칙은 첫 CSS에 들어갑니다(index CSS gzip 14.7KB → 30.6KB). CDN(jsDelivr) 때보다 다른 출처 연결(DNS·TLS)이 없어졌고, 받는 양은 비슷합니다(CDN CSS 12.5KB + 같은 woff2). 빌드 결과에는 조각 92개(약 2.96MB)가 들어가지만 쓰인 글자의 조각만 받습니다.
- 공개 QR 화면(01)의 건물 그림은 라이브러리·이미지 없는 인라인 SVG(`components/BuildingScene.tsx`, gzip 약 1.4KB + CSS 0.5KB)라 따로 불러오지 않습니다. 앱을 연 뒤 한 번만 나타남 효과가 있고, 동작 줄이기·크게 보기에서는 정적 그림입니다(D-27, [interaction.md §7](interaction.md#7-3d-건물-장면-d-27)).

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
