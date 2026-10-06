# 인터랙션·애니메이션 가이드

누름·시트·알림·화면 전환·3D·함이가 모든 화면에서 같은 방식으로 반응하도록 정한 규칙입니다. 움직임은 무엇이 바뀌었는지 알릴 때만 씁니다.

- 기준: [lofi/screens.md](../lofi/screens.md)(화면 규칙), [lofi/board.html](../lofi/board.html)(흐름·카드별 조건), [함이 가이드](../design/characters/hami/README.md)(4. 화면별 포즈)
- 담당 영역: 프론트엔드 = `apps/web`
- 함께 보기: [프론트엔드](frontend.md)(화면 상태·오류·접근성) · [결정 기록](decisions.md)

## 1. 원칙

- SEED 모션 토큰만 씁니다. CSS에 `ms` 숫자를 직접 적지 않습니다.
- 위치·크기 변화는 `transform`·`opacity`(`scale`·`translate` 포함)로만 움직입니다. `width`·`height`·`top`·`margin`은 애니메이션하지 않습니다. 색은 `--seed-duration-color-transition`으로 바꿉니다.
- 사라짐은 나타남보다 짧게 합니다. SEED 시트도 300ms에 나타나고 200ms에 사라집니다.
- 시트·대화상자·토스트는 SEED React 컴포넌트에 들어 있는 모션을 그대로 쓰고, 나머지는 CSS transition·animation으로 만듭니다.
- 애니메이션 라이브러리를 추가하지 않습니다. 제스처가 꼭 필요하면 CSS로 먼저 만들어 보고, 부족할 때 결정 필요로 올립니다(§4).
- `prefers-reduced-motion: reduce`에서는 움직임을 끄고 상태만 즉시 바꿉니다. `styles/global.css`가 이미 모든 `animation`·`transition`을 끄고, SEED는 누름 축소 비율(`--seed-scale-*`, `--seed-feedback-scale`)을 1로 바꿉니다. 스켈레톤의 300ms 지연(`.wh-delayed`)은 움직임이 아니라서 동작 줄이기에서도 남깁니다(빨리 오면 번쩍이지 않게). 크게 보기에서는 3D만 정적 그림으로 바꿉니다(§7).

## 2. SEED 모션 토큰

`@seed-design/css` 2.8.3 `base.css`에서 확인한 값입니다. SEED는 200ms 이하를 작은 모션(누름·포커스), 그보다 긴 것을 큰 모션(시트·화면)으로 나눕니다.

- 시간: `--seed-duration-d1`~`d6` = 50 · 100 · 150 · 200 · 250 · 300ms. 별칭은 `--seed-duration-color-transition` = d3, `--seed-duration-pressed-scale` = d3입니다.
- 누름 축소: `--seed-feedback-scale`(요소 크기에 맞춰 2px 줄어드는 비율), `--seed-feedback-scale-transition`(축소 transition 한 줄), 고정 비율 `--seed-scale-s95`·`s97`·`s98`.

| 가속 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--seed-timing-function-easing` | `cubic-bezier(.35, 0, .35, 1)` | 누름·포커스·색 전환 |
| `--seed-timing-function-enter` | `cubic-bezier(0, 0, .15, 1)` | 나타남 |
| `--seed-timing-function-exit` | `cubic-bezier(.35, 0, 1, 1)` | 사라짐 |
| `--seed-timing-function-enter-expressive` | `cubic-bezier(.03, .4, .1, 1)` | 시트 본체처럼 강조할 나타남 |
| `--seed-timing-function-exit-expressive` | `cubic-bezier(.35, 0, .95, .55)` | 강조할 사라짐 (지금 쓰는 곳 없음) |
| `--seed-timing-function-pressed-scale` | `cubic-bezier(0, 0, .15, 1)` | 누름 축소 |

## 3. 인터랙션별 규칙

| 인터랙션 | 시간 | 가속 | 움직이는 것 | 구현 |
|---|---|---|---|---|
| 누름 피드백 | pressed-scale (150ms) | pressed-scale | `scale` 축소 + 배경색 | SEED 컴포넌트 기본. 직접 만든 요소는 아래 고정 비율 |
| 글자만 있는 누름 (더 보기·다시 시도·링크형) | color-transition | easing | opacity 0.6 | `global.css` 글자 누름 규칙, 새로 만들면 `wh-text-action` |
| 색·선택 전환 (칩, 탭, 상태 배지) | color-transition (150ms) | easing | 배경색·글자색 | CSS transition. 고르지 않은 칩·선택지는 누르는 동안 옅은 배경 |
| 시트 나타남 | d6 | 본체 enter-expressive, 딤 enter | 본체 아래→위, 딤 opacity 0→1 | `BottomSheet` 기본 |
| 시트 사라짐 | d4 | exit | 반대 방향 | `BottomSheet` 기본 |
| 확인 대화상자 | 나타남 d4 / 사라짐 d2 | enter-expressive / exit | opacity·scale | `Dialog` 기본 |
| 토스트 | 나타남 d3 / 사라짐 d2 | enter / exit | opacity, scale 0.8→1 | `Snackbar` 기본 |
| 화면 전환 (결정) | d3 | enter | 새 화면 본문 opacity 0→1. 이전 화면은 바로 바꾸고 옆으로 밀지 않음 | CSS animation |
| 목록 항목 나타남 | d4 | enter | opacity + `translateY(8px)`→0. 처음 불러올 때 한 번, 순차 지연 없음 | CSS animation(`wh-rise-in`). 따로 받아 늦게 올 수 있는 공지 카드·팁 미리 보기·안내 아래 메모도 같음 |
| 상태가 바뀌어 생긴 덩어리 | d4 | enter | 목록 항목과 같음 | 시트 안 바뀐 내용(13 메모를 남긴 뒤, 지울지 확인), 07→35 처리 결과, 저장한 결과 한 줄. 클래스가 붙거나 새로 그려질 때 한 번(화면 CSS에 `wh-rise-in`) |
| 성공 표시 | d4 | enter | opacity + scale 0.8→1 (토스트와 같음) | 준비 완료(38) 체크 원 `wh-pop-in`. 함이가 있는 성공 화면(06·09·13)은 함이 나타남(§8) |
| 불러오는 중 | d6(300ms) 뒤 표시 | — | SEED `Skeleton`. 300ms 안에 오면 바로 내용 | `Skeleton` + 지연 표시 |
| 버튼 처리 중 | 누른 즉시 | — | `ActionButton`의 `loading` 모양 | §5 |
| 하단 탭 전환 | color-transition | easing | 글자·아이콘 색. 현재 탭은 `aria-current="page"` + 굵기 | CSS transition |
| 스플래시(00) | 나타남 d3, 약 1초 유지, 사라짐 d4 | enter / exit | opacity. 함이는 한 번 rise-in, 떠다니는 반복 없음. 동작 줄이기면 애니메이션 없이 1초 뒤 사라짐 | `app/Splash.tsx` |

직접 만든 누름 요소는 `ScaleFeedback`로 크기를 재지 않고 SEED 고정 비율을 씁니다. SEED 동적 비율(`max(높이, 폭/4)`에서 2px)을 계산하면 같은 값이 나옵니다. `--seed-feedback-scale`은 `ScaleFeedback` 안에서만 값이 생기므로(밖에서는 1이라 줄지 않음) 직접 만든 요소에 쓰지 않습니다.

| 요소 | 비율 | 예 |
|---|---|---|
| 폭이 넓은 카드·배너(300px 안팎) | `--seed-scale-s98` | 공지 카드, 처음 오셨나요, 연결 카드, 재확인 배너, 내가 보낸 내용, 팁 미리 보기 카드 |
| 타일(80px 안팎) | `--seed-scale-s97` | 안내 타일 |
| 아이콘 버튼·작은 버튼(높이 44~48px) | `--seed-scale-s95` | `wh-icon-btn`, 받은 내용 ‘필요하면 이어서’ 버튼 |
| 가장자리까지 닿는 목록 행 | 축소 없음, 배경색만 | `wh-list-row`, 관리 홈 행, 시트 메뉴 행 |

```css
/* features/buildings/guide-tiles.css */
.bd-tile {
  transition:
    background-color var(--seed-duration-color-transition) var(--seed-timing-function-easing),
    var(--seed-feedback-scale-transition);
}
.bd-tile:active {
  background: var(--wh-primary-soft);
  scale: var(--seed-scale-s97);
}

/* 스켈레톤은 300ms가 지나도 데이터가 없을 때만 보입니다 (components/ScreenState.tsx의 Delayed) */
.wh-delayed {
  animation: wh-show 0s linear var(--seed-duration-d6) both;
}
@keyframes wh-show {
  from {
    visibility: hidden;
  }
}
```

- 누름 반응은 100ms 안에 보여야 합니다. `:active` CSS로 처리하고 요청이 끝나기를 기다리지 않습니다.
- 화면이 바뀌면 새 화면의 `h1`(없으면 `main`)로 포커스를 옮깁니다. 스크린 리더 사용자는 이것으로 전환을 압니다. 불러오는 틀(`main[aria-busy]`)이 내용으로 바뀌며 포커스한 요소가 사라지면, 그 이동에서 한 번 불러오기가 끝난 뒤의 `h1`로 다시 옮깁니다(사용자가 그새 다른 곳을 눌렀으면 두고 갑니다). 화면 전환 fade와 포커스 이동은 `app/RootLayout.tsx`에 있습니다.

## 4. 시트

lofi의 시트(08·12·13·17·20·40·44)는 SEED `BottomSheet`로 만듭니다. 구조는 §5 예시처럼 `Root > Positioner > Backdrop + Content > Header · Body · Footer`입니다.

- 아래에서 올라오고, 딤(`BottomSheet.Backdrop`)과 손잡이(`BottomSheet.Handle`)를 둡니다. 높이는 화면의 90%를 넘기지 않고, 넘치면 페이지로 만듭니다(SEED 가이드).
- 입력이 있는 시트(12 내용이 달라요, 25 기존 유지 사유)는 손잡이 대신 머리 줄 오른쪽에 닫기(×)를 둡니다(SEED 가이드). SEED `CloseButton`은 바로 닫혀 확인을 끼울 수 없어 `wh-icon-btn`으로 만듭니다. 입력이 생기면 `dismissible={false}`로 바꿔 드래그·바깥 누름·Esc로 닫히지 않게 하고, 닫기를 누르거나 뒤로 가기(`useBlocker`)를 하면 **시트 안에서** “쓰던 메모를 지울까요?”(계속 쓰기 / 지우기·지우고 나가기)로 바꿔 묻습니다. 열린 시트 위에 `Dialog`를 겹치지 않습니다(두 모달의 포커스·누름 가로채기가 부딪힘). 시트 밖 화면(33 수정본 닫기)은 SEED `Dialog`로 묻습니다.
- 보낸 뒤 결과(13 메모를 남겼어요)는 새 시트를 띄우지 않고 같은 시트의 내용을 바꿉니다(손잡이가 이때 나타남). 바뀐 내용은 목록 항목처럼 한 번 올라오며 나타납니다(§3). 시트가 올라온 뒤(d6) 입력칸에 포커스를 둡니다(`components/useSheetAutoFocus.ts`, 동작 줄이기면 바로). SEED `BottomSheet.Root`의 `onAnimationEnd`는 시트가 스스로 열고 닫을 때만 불리고 `open` prop으로 열고 닫을 때는 오지 않으므로 여기에 기대지 않습니다.
- 직접 적기(05)에서 확인 시트(20)가 열린 채 뒤로 가면 화면을 떠나지 않고 시트만 닫습니다(`ReportConfirmSheet`의 `closeOnBack`). 쓰던 화면의 나가기 확인 대화상자가 시트 위에 겹치지 않게 하기 위해서입니다. react-router는 blocker를 한 번에 하나만 지원하므로(여럿이면 마지막 것만 쓰고 경고), 시트가 열린 동안에는 화면의 `LeaveConfirm`을 빼고 시트 안 `SheetLeaveGuard`만 둡니다.
- 알리기 입구 시트에서 자주 쓰는 말을 고르면 입구 시트가 닫히고 20이 열리므로, 20이 닫힌 뒤에는 입구 시트를 연 버튼으로 포커스를 돌려줍니다(`returnFocus`).
- 재확인 시트(40)는 거주자 홈을 열 때 앱 실행마다 한 번만 먼저 뜨고(`wh.reconfirmAsked`), 그 뒤에는 홈 맨 위 배너·내 정보에서 다시 엽니다. 연결 직후(17이 뜰 때)에는 띄우지 않습니다. 40의 ‘이사했어요’는 40을 닫고 08을 엽니다(시트를 겹치지 않음).
- **저절로 뜨는 시트는 한 번에 하나입니다.** 누르지 않아도 뜨는 시트(연결 직후 17, 내 정보 `?notify=1`의 17, 하루 한 번의 40과 이어서 연 08, `?memo=write`로 돌아와 여는 12, 약관 다시 동의)는 `components/autoSheet.ts`의 `useAutoSheetTurn`으로 차례를 받습니다. 먼저 차례를 받은 시트가 닫힐 때까지 다른 시트는 기다리고, 닫힌 뒤 350ms(닫히는 움직임)가 지나 다음 시트가 올라옵니다. 떠 있는 시트를 밀어내지 않습니다. 약관 다시 동의는 화면이 뜬 뒤 0.8초를 기다렸다가 맨 뒤 차례(`last`)로 줄을 서서, 다른 자동 시트가 모두 끝난 뒤에 뜹니다. 사용자가 버튼으로 연 시트는 차례를 기다리지 않습니다.
- 로그인 전 동의(D-28)는 로그인 버튼을 누르면 동의 시트(`features/auth/LoginConsent.tsx`의 `LoginConsentSheet`)로 받습니다. 항목의 ‘보기’는 시트를 겹쳐 열지 않고 같은 시트 안에서 요약으로 바뀌며(‘동의 항목으로 돌아가기’를 누르면 누른 ‘보기’로 포커스가 돌아감), 다른 시트 안의 ‘다시 로그인하기’는 그 자리에서 동의 항목을 펼칩니다(`LoginConsentPanel inline`).
- 키보드가 올라오면 시트와 하단 버튼이 키보드 위에 있어야 합니다(lofi 12·19). `BottomSheet.Root`의 `repositionInputs` 동작과 페이지형 작성 화면(19)의 하단 버튼은 iPhone Safari 실기기에서 확인합니다(아직 확인 전).
- 시트·대화상자는 `Portal`로 `body`에 그립니다. 화면 본문(`main`)의 나타남 애니메이션이 쌓임 맥락을 만들어, 그 안에 그리면 하단 탭·버튼(z-index 1) 아래로 깔립니다.
- 알림 선택 시트(17)는 연결을 마치고 돌아간 화면 위에 한 번 뜹니다(`app/ConnectedNotifyPrompt.tsx`). 닫는 버튼은 환경마다 ‘알겠어요’·‘나중에’이고, 알림을 켜지 않아도 연결은 끝났다고 시트 아래에 적습니다. 브라우저 권한 창이 떠 있는 동안에는 ‘나중에’·Esc로 닫을 수 있고, 권한을 고른 뒤 서버에 저장하는 동안만 `dismissible={false}`입니다. 이 시트는 누른 버튼 없이 뜨므로, 닫은 뒤 포커스가 갈 곳이 없으면 화면의 `h1`로 돌려놓습니다.
- 쓰던 내용이 있는 작성 화면(34)에서 닫기·뒤로 가기를 하면 `components/LeaveConfirm.tsx`(`useBlocker` + SEED `Dialog`)로 “쓰던 공지가 사라져요”를 확인합니다. 보내기에 성공해 이동할 때는 state에 `LEAVE_OK`를 넣어 묻지 않습니다. 탭 닫기·새로고침은 라우터 밖이라 `beforeunload`로 브라우저 기본 확인을 띄웁니다.
- 한 장씩 넘기는 첫날 카드(36)는 CSS `scroll-snap`과 점 표시 양옆의 이전·다음 버튼으로 만들고, 지금 장이 아닌 카드는 `inert`로 둡니다. 스와이프가 부족하면 `embla-carousel`(SEED `Tabs`가 이미 쓰는 라이브러리)을 직접 의존성으로 추가할지 결정 필요입니다.

## 5. 두 번 눌러 보내기 (01 → 20 → 06)

1. 공개 화면(01)에서 자주 쓰는 말을 누르면(첫 번째 탭) 확인 시트(20)가 열립니다. 아직 아무것도 보내지 않습니다.
2. 시트의 ‘집주인에게 보내기’를 누르면(두 번째 탭) 요청을 보냅니다. 보내는 동안 버튼은 `loading`·`disabled`, 시트는 `dismissible={false}`입니다.
3. 성공하면 시트를 닫고 접수 화면(06)으로 갑니다. 결과는 토스트가 아니라 06 화면으로 보여줍니다.
4. 실패하면 시트와 입력을 그대로 두고 시트 안에 이유를 보여줍니다. 자동으로 다시 보내지 않습니다. 반복 제한(429)은 `Retry-After`로 남은 분을, 그 건물 집주인(403)에게는 받은 내용 링크를 둡니다. 결과를 모를 때(시간 초과)는 “보내지 못했어요 … 다시 눌러 주세요”로 두고, 다시 누르면 같은 문구 제한(10분)이 중복을 막습니다. 따로 그린 화면은 아직 없습니다.
5. 시트의 ‘위치나 내용 덧붙이기’(선택)를 펼쳐 쓰기 시작하면 손잡이 대신 닫기 버튼을 두고 `dismissible={false}`로 바꿉니다. 취소·닫기·뒤로 가기(`components/SheetLeaveGuard.tsx`)는 대화상자를 겹치지 않고 시트 안에서 “덧붙인 내용을 지울까요?”를 묻습니다.
6. 직접 적기(05)는 ‘보낼 내용 확인’으로 같은 시트를 열고, 성공하면 06으로 `replace`합니다(뒤로 가도 쓰던 화면으로 돌아가 다시 보내지 않게). 01에서는 06으로 push합니다. 자주 쓰는 말 목록이 없는 곳(거주자 홈 03, 크게 보기 28, 안내 없음 14)은 ‘집주인에게 알리기’ → 입구 시트(자주 쓰는 말 + 직접 적기, `features/reports/ReportChooser.tsx`) → 20입니다.

설치된 `@seed-design/react` 2.5.0의 `ActionButton` `loading`은 모양(`data-loading`)만 바꾸고 클릭을 막지 않습니다. 그래서 `disabled`와 진행 중 표시(ref)를 함께 씁니다.

```tsx
// features/reports/ReportConfirmSheet.tsx — LF-10 보내기 전 확인 (lofi 20, 요지만)
export function ReportConfirmSheet({ open, onOpenChange, send }: Props) {
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false); // 상태가 반영되기 전의 연타도 막습니다

  async function handleSend() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await send();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <BottomSheet.Root open={open} onOpenChange={onOpenChange} dismissible={!sending}>
      <BottomSheet.Positioner>
        <BottomSheet.Backdrop />
        <BottomSheet.Content>
          <BottomSheet.Header>
            <BottomSheet.Title>이대로 보낼까요?</BottomSheet.Title>
          </BottomSheet.Header>
          {/* Body(받는 사람·공개 범위·보낼 말)와 취소 버튼은 생략 */}
          <BottomSheet.Footer>
            <ActionButton size="large" loading={sending} disabled={sending} onClick={handleSend}>
              집주인에게 보내기
            </ActionButton>
          </BottomSheet.Footer>
        </BottomSheet.Content>
      </BottomSheet.Positioner>
    </BottomSheet.Root>
  );
}
```

## 5-1. 가입코드 입력 (02)

- 입력칸 하나(`autocapitalize="characters"`, `autocomplete="off"`) 위에 6칸을 겹쳐 그립니다. 누르면 입력칸에 포커스가 가고, 다음 칸에 커서 모양이 보입니다. 칸은 장식이라 읽지 않고, 입력칸의 이름이 “가입코드 6자리”입니다.
- 붙여넣기는 칸마다 나누지 않고 한 번에 받습니다. 틀리면 칸 테두리를 빨갛게 하고 칸 아래 글자로 이유를 둡니다(색만으로 알리지 않음). 잠기면 입력칸과 ‘다음’을 막고 남은 분을 적습니다.
- ‘다음’은 하단 고정 자리가 아니라 입력 바로 아래에 둡니다. iPhone에서 키보드가 올라와도 가려지지 않게 하기 위해서입니다. 키보드의 이동 키(`enterkeyhint="go"`)로도 보냅니다.

## 6. 결과 알림 (토스트)

| 항목 | 규칙 |
|---|---|
| 시간 | 성공 토스트는 약 3초(`timeout: 3000`). `useSnackbarAdapter` 기본값은 4000ms, SEED 가이드 기본은 5초입니다. 누르거나 포커스하면 멈춥니다 |
| 읽기 보조 | `Snackbar.Region`이 `aria-live="polite"`, 각 토스트가 `role="status"`를 답니다 |
| 개수 | 한 번에 하나만 보이고, 새 토스트는 SEED가 차례로 보여줍니다 |
| 위치 | 하단 버튼(`Dock`)·하단 탭(`TabBar`) 위에 뜹니다. 둘 다 `Snackbar.AvoidOverlap`으로 감싸 SEED가 자리를 비킵니다(lofi 04). 좌우 여백은 화면 여백(20px). 자리가 바뀔 때 SEED의 `bottom` 이동(d4)은 끕니다(화면이 바뀌며 토스트가 버튼을 덮은 채 올라가 보여서) |
| 오류 | 토스트로 알리지 않습니다. 해결될 때까지 입력 아래·버튼 위·화면 상태로 남깁니다 |
| 중요한 결과 | 토스트에만 두지 않습니다. 접수(06)·공지 올린 뒤(37)처럼 화면으로 보여줍니다 |

```tsx
// app/providers.tsx에서 앱 전체를 한 번 감쌉니다
export function SnackbarProvider({ children }: { children: ReactNode }) {
  return (
    <Snackbar.RootProvider>
      {children}
      <Snackbar.Region>
        <Snackbar.Renderer />
      </Snackbar.Region>
    </Snackbar.RootProvider>
  );
}

export function useToast() {
  const snackbar = useSnackbarAdapter();
  return (message: string) =>
    snackbar.create({
      timeout: 3000,
      render: () => (
        <Snackbar.Root variant="positive">
          <Snackbar.Content>
            <Snackbar.Message>{message}</Snackbar.Message>
          </Snackbar.Content>
        </Snackbar.Root>
      ),
    });
}
```

## 7. 3D 건물 장면 (D-27)

3D 렌더러 없이 SVG 등각 그림에 나타남 한 번만 둡니다. 건물 그림은 보조 요소라 건물 이름·공지·안내는 그림과 관계없이 먼저 그립니다.

- **그림:** `components/BuildingScene.tsx`의 인라인 SVG(이미지 자산 없음). lofi `src/chrome.js`의 등각 투영 도시(이웃 블록 10개, 우리 건물, 도로 두 줄)를 같은 좌표로 옮겼고, 색은 `tokens.css`의 `--wh-scene-*`와 창 색 `--wh-cream`·`--wh-moon`입니다. 표지 핀(`data-pin`)은 lofi 01·03·30에서 모두 꺼져 있어 두지 않습니다. 바로 아래 건물 이름이 표지 역할을 합니다.
- **배치:** 1칸 10px, 원점은 그림 칸의 가로 50%·세로 56%에서 왼쪽으로 40px입니다(01·30, lofi `data-scale="10" data-oy="0.56" data-ox="-40"`). `variant="home"`은 lofi 03 배치(1칸 9px, 세로 55%, 왼쪽 10px)입니다. 좌표가 px 단위라 칸이 넓어져도 건물은 커지지 않고, 390px 폭에서 lofi PNG와 같은 자리에 그립니다.
- **자리:** 높이를 정한 칸(150px, 거주자 홈 132px, 배경 `--wh-scene-bg`)은 화면 CSS가 그리고, 그림은 `position: absolute`로 칸을 채웁니다. 그림 때문에 아래 내용이 밀리지 않습니다.
- **나타남(한 번):** 화면 전환 fade(d3, 150ms)가 끝날 즈음 우리 건물이 땅에서 올라옵니다(`translateY`, d6, enter, 150→450ms). 창의 불은 건물이 다 올라오기 전, 올라오는 도중인 300ms부터 아래층부터 켜집니다(opacity, d4, 층마다 d1씩 늦게: 1층 300→500ms, 2층 350→550ms, 3층 400→600ms). 그래서 오르는 움직임과 불 켜짐이 150ms쯤 겹치고, 모두 600ms 안에 끝나며 반복하지 않습니다. 땅 윤곽(clip-path)으로 바닥 모서리 아래를 가려 건물이 땅에서 솟는 모양이 되고, 이웃 블록과 땅은 움직이지 않습니다. 앱을 연 뒤 한 번만 움직이고, 탭이나 화면을 오가며 다시 그리면 정적 그림입니다.
- **정적 그림:** 기본값이 완성된 그림이고 keyframes에는 시작 모습만 적습니다. 애니메이션이 꺼지면 곧바로 완성된 그림이 보입니다. 정적 그림으로 그리는 경우는 동작 줄이기(첫 그리기 전에 `matchMedia`로 판단, `global.css`도 모든 애니메이션을 끔), 크게 보기(`isLargeMode()`, 도중에 켜도 `html[data-size="large"]` CSS가 멈춤), 이미 한 번 나타난 뒤, 브라우저 환경을 읽다가 실패했을 때입니다. 판단은 `sceneMotion()` 한 곳에 있고, 이번 방문에 이미 보였는지는 모듈 상태(`readSceneMotion`·`rememberSceneMotion`, 테스트는 `resetSceneVisitForTest`로 되돌림)에 둡니다. `BuildingScene.test.tsx`가 첫 그림은 나타나고 다음 그림은 정적인지 확인합니다.
- **불러오는 중·실패·크게 보기:** 불러오는 동안은 그림 대신 같은 높이의 스켈레톤(`BuildingSkeleton`)을, 실패하면 오류 안내를 그립니다. 크게 보기에서는 공개 화면·거주자 홈 모두 그림을 빼고 그립니다(공개 화면은 lofi 28 배치). 그림을 쓰는 새 자리도 이 규칙을 따르고, 그래도 그림이 남으면 위 판단으로 정적 그림입니다.
- **입력:** 장식이라 `aria-hidden="true"`·`focusable="false"`입니다. `pointer-events: none`과 `touch-action: pan-y`를 두어 그림 위에서 시작한 세로 스크롤을 페이지가 그대로 받습니다. 자동 회전, 끝없는 반복, 드래그 회전, 스크롤 가로채기는 없습니다.
- 건물마다 실제 모양을 보여줘야 할 때 D-27을 다시 봅니다.

## 8. 함이

- 함이는 실제 상태를 설명할 때만 나옵니다. [함이 가이드 4](../design/characters/hami/README.md)의 표에 있는 자리에만 넣습니다: 첫 방문 안내(01·36·46), 스플래시(00), 연결 환영(10), 알림 선택(17), 메모를 남긴 뒤(13), 받는 사람 카드(05), 접수(06), 빈 상태(14·18), 재확인(40), 이사 완료(09), 건물 확인(23), QR(26), 건물 없음(22), 데모(29).
- 공개 화면(01)의 함이는 첫 방문에만 보입니다(localStorage `wh.visited.<buildingId>`). 표에 없는 화면에는 넣지 않습니다. 특히 결과 상태(확인함·처리 완료·처리가 어려움), 집주인 업무 화면(07·24·25·32~35·37~39·41~43), 공지 상세(15), 재방문(03·30), 44·45에는 넣지 않습니다.
- 가만히 있을 때 반복하는 움직임(숨쉬기·흔들기·깜빡임)을 넣지 않습니다. 나타날 때만 한 번, opacity + `translateY(8px)`을 d4~d6(200~300ms) 동안 enter로 움직입니다. 동작 줄이기에서는 움직이지 않습니다.
- 이미지 폭은 가이드 표의 값(투명 여백 포함)을 쓰고, 여백만큼 음수 여백으로 당깁니다. `width`·`height`를 지정합니다.
- 옆 문장이 상태를 설명하므로 `alt=""`로 둡니다. 말풍선 문구는 이미지가 아니라 텍스트로 쓰고, 이미지로만 전하는 정보를 만들지 않습니다.
- 팁 저장 토스트(04)의 `hami-mini`(40px)는 `Snackbar.Content` 안에 장식 이미지로 넣습니다.

## 9. 반응 문구

- 해요체로 짧게 씁니다. 느낌표·이모지·축하 문구를 쓰지 않습니다. 토스트 문구에는 마침표를 찍지 않습니다.
- 보장하지 않는 결과를 단정하지 않습니다.

| 쓰기 | 쓰지 않기 |
|---|---|
| 알림 대상 3명에게 발송을 시도했어요 | 모두에게 전달됐어요 |
| 내용을 접수했어요. 집주인은 아직 확인 전이에요 | 집주인이 곧 해결해 드려요 |
| 처리 완료 (집주인이 표시한 상태) | 해결됐어요 |
| 다른 거주자에게 작성자가 안 보여요 | 익명으로 남겨요 |

- 버튼 이름은 할 일을 말합니다(‘집주인에게 보내기’, ‘안내 공개하기’). ‘확인’·‘예’만 쓰지 않습니다.

## 10. 새 인터랙션을 추가할 때

- [ ] lofi 화면·상태(screens.md)에 있는 반응인가. 없으면 screens.md·board.html에 먼저 추가
- [ ] SEED 컴포넌트에 같은 모션이 있는가. 있으면 그대로 사용
- [ ] 시간·가속은 §2 토큰, 움직임은 `transform`·`opacity`만, 사라짐이 나타남보다 짧음
- [ ] 동작 줄이기에서 상태 변화가 즉시 보이고, 크게 보기에서 같은 행동이 모두 남음
- [ ] 누름 반응 100ms 이내, 처리 중 표시, 두 번 눌러도 한 번만 보냄
- [ ] 결과를 화면이나 `aria-live`로 알리고, 오류는 해결될 때까지 남김
- [ ] 함이를 넣었다면 가이드 표에 있는 자리이고 반복 움직임이 없음
- [ ] 문구가 결과를 단정하지 않음
- [ ] 390px 폭과 iPhone Safari 실기기(키보드·시트)에서 확인

## 바꿀 때

- 이 문서의 규칙(토큰 대응, 시트·토스트·3D·함이 규칙)은 PR로 바꾸고, 결정이 바뀌면 [decisions.md](decisions.md)에 이유를 남깁니다.
- 함이 배치가 바뀌면 [함이 가이드](../design/characters/hami/README.md)를, 화면 규칙이 바뀌면 [lofi/screens.md](../lofi/screens.md)를 먼저 고칩니다.
- SEED 버전을 올리면 §2의 값과 §5의 `loading` 동작을 다시 확인합니다.
