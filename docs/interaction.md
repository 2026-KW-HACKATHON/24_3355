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
- `prefers-reduced-motion: reduce`에서는 움직임을 끄고 상태만 즉시 바꿉니다. `styles/global.css`가 이미 모든 `animation`·`transition`을 끄고, SEED는 누름 축소 비율(`--seed-scale-*`, `--seed-feedback-scale`)을 1로 바꿉니다. 크게 보기에서는 3D만 정적 그림으로 바꿉니다(§7).

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
| 누름 피드백 | pressed-scale (150ms) | pressed-scale | `scale` 2px 축소 + 배경색 | SEED 컴포넌트 기본. 직접 만든 타일은 `ScaleFeedback` |
| 색·선택 전환 (칩, 탭) | color-transition (150ms) | easing | 배경색·글자색 | CSS transition |
| 시트 나타남 | d6 | 본체 enter-expressive, 딤 enter | 본체 아래→위, 딤 opacity 0→1 | `BottomSheet` 기본 |
| 시트 사라짐 | d4 | exit | 반대 방향 | `BottomSheet` 기본 |
| 확인 대화상자 | 나타남 d4 / 사라짐 d2 | enter-expressive / exit | opacity·scale | `Dialog` 기본 |
| 토스트 | 나타남 d3 / 사라짐 d2 | enter / exit | opacity, scale 0.8→1 | `Snackbar` 기본 |
| 화면 전환 (결정) | d3 | enter | 새 화면 본문 opacity 0→1. 이전 화면은 바로 바꾸고 옆으로 밀지 않음 | CSS animation |
| 목록 항목 나타남 | d4 | enter | opacity + `translateY(8px)`→0. 처음 불러올 때 한 번, 순차 지연 없음 | CSS animation |
| 불러오는 중 | d6(300ms) 뒤 표시 | — | SEED `Skeleton`. 300ms 안에 오면 바로 내용 | `Skeleton` + 지연 표시 |
| 버튼 처리 중 | 누른 즉시 | — | `ActionButton`의 `loading` 모양 | §5 |

```css
/* 직접 만든 누름 요소: <ScaleFeedback><button className="guide-tile">…</button></ScaleFeedback> */
.guide-tile {
  transition:
    background-color var(--seed-duration-color-transition) var(--seed-timing-function-easing),
    var(--seed-feedback-scale-transition);
}
.guide-tile:active {
  background-color: var(--wh-primary-soft);
  scale: var(--seed-feedback-scale);
}

/* 스켈레톤은 300ms가 지나도 데이터가 없을 때만 보입니다 */
.delayed {
  animation: show 0s linear var(--seed-duration-d6) both;
}
@keyframes show {
  from {
    visibility: hidden;
  }
}
```

- 누름 반응은 100ms 안에 보여야 합니다. `:active` CSS로 처리하고 요청이 끝나기를 기다리지 않습니다.
- 화면이 바뀌면 새 화면의 `h1`로 포커스를 옮깁니다. 스크린 리더 사용자는 이것으로 전환을 압니다.

## 4. 시트

lofi의 시트(08·12·13·17·20·40·44)는 SEED `BottomSheet`로 만듭니다. 구조는 §5 예시처럼 `Root > Positioner > Backdrop + Content > Header · Body · Footer`입니다.

- 아래에서 올라오고, 딤(`BottomSheet.Backdrop`)과 손잡이(`BottomSheet.Handle`)를 둡니다. 높이는 화면의 90%를 넘기지 않고, 넘치면 페이지로 만듭니다(SEED 가이드).
- 입력이 있는 시트(12 내용이 달라요)는 손잡이 대신 `BottomSheet.CloseButton`을 둡니다(SEED 가이드). 입력이 생기면 `dismissible={false}`로 바꿔 드래그·바깥 누름·Esc로 닫히지 않게 하고, 닫기 버튼을 누르면 SEED `Dialog`로 “쓰던 내용이 사라져요”(문구 초안)를 확인합니다.
- 키보드가 올라오면 시트와 하단 버튼이 키보드 위에 있어야 합니다(lofi 12·19). `BottomSheet.Root`의 `repositionInputs` 동작과 페이지형 작성 화면(19)의 하단 버튼은 iPhone Safari 실기기에서 확인합니다(아직 확인 전).
- 한 장씩 넘기는 첫날 카드(36)는 CSS `scroll-snap`과 이전·다음 버튼으로 만듭니다. 스와이프가 부족하면 `embla-carousel`(SEED `Tabs`가 이미 쓰는 라이브러리)을 직접 의존성으로 추가할지 결정 필요입니다.

## 5. 두 번 눌러 보내기 (01 → 20 → 06)

1. 공개 화면(01)에서 자주 쓰는 말을 누르면(첫 번째 탭) 확인 시트(20)가 열립니다. 아직 아무것도 보내지 않습니다.
2. 시트의 ‘집주인에게 보내기’를 누르면(두 번째 탭) 요청을 보냅니다. 보내는 동안 버튼은 `loading`·`disabled`, 시트는 `dismissible={false}`입니다.
3. 성공하면 시트를 닫고 접수 화면(06)으로 갑니다. 결과는 토스트가 아니라 06 화면으로 보여줍니다.
4. 실패하면 시트와 입력을 그대로 두고 시트 안에 이유를 보여줍니다. 자동으로 다시 보내지 않습니다. 결과를 모를 때(시간 초과)의 화면은 아직 그리지 않았습니다.

설치된 `@seed-design/react` 2.5.0의 `ActionButton` `loading`은 모양(`data-loading`)만 바꾸고 클릭을 막지 않습니다. 그래서 `disabled`와 진행 중 표시(ref)를 함께 씁니다.

```tsx
// screens/public-building/ReportConfirmSheet.tsx — LF-10 보내기 전 확인 (lofi 20)
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

## 6. 결과 알림 (토스트)

| 항목 | 규칙 |
|---|---|
| 시간 | 성공 토스트는 약 3초(`timeout: 3000`). `useSnackbarAdapter` 기본값은 4000ms, SEED 가이드 기본은 5초입니다. 누르거나 포커스하면 멈춥니다 |
| 읽기 보조 | `Snackbar.Region`이 `aria-live="polite"`, 각 토스트가 `role="status"`를 답니다 |
| 개수 | 한 번에 하나만 보이고, 새 토스트는 SEED가 차례로 보여줍니다 |
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

## 7. 3D 건물 장면 (아직 구현 전)

- 3D는 보조 요소입니다. 공개 화면(01)은 정적 그림을 기본으로 보여주고, 첫 화면이 그려진 뒤 `lazy()`로 3D를 불러옵니다. MVP는 정적 그림만으로 내보낼 수 있습니다.
- 불러오는 중·실패·동작 줄이기·크게 보기에서는 정적 그림을 보여줍니다. import 실패는 오류 경계로 잡아 정적 그림으로 바꿉니다.
- 페이지 스크롤을 가로채지 않습니다. 캔버스에서 `wheel`·`touchmove`를 막지 않고 `touch-action: pan-y`를 둡니다. 한 손가락 드래그로 회전시키지 않습니다.
- 자동 회전과 끝없는 반복 애니메이션을 두지 않습니다. 3D 렌더링 라이브러리는 3D를 만들 때 결정 필요입니다.

```tsx
import buildingStill from "../../assets/building-still.webp"; // 정적 그림 (자산 아직 없음)

const Scene3D = lazy(() => import("./Scene3D"));

// reduceMotion: matchMedia("(prefers-reduced-motion: reduce)"), large: <html data-size="large">
export function BuildingScene({ reduceMotion, large }: { reduceMotion: boolean; large: boolean }) {
  const still = <img src={buildingStill} alt="" width={350} height={220} />;
  if (reduceMotion || large) return still;
  return (
    <Suspense fallback={still}>
      <Scene3D fallback={still} />
    </Suspense>
  );
}
```

## 8. 함이

- 함이는 실제 상태를 설명할 때만 나옵니다. [함이 가이드 4](../design/characters/hami/README.md)의 표에 있는 자리에만 넣습니다: 첫 방문 안내(01·36·46), 스플래시(00), 연결 환영(10), 알림 선택(17), 메모를 남긴 뒤(13), 받는 사람 카드(05), 접수(06), 빈 상태(14·18), 재확인(40), 이사 완료(09), 건물 확인(23), QR(26), 건물 없음(22), 데모(29).
- 표에 없는 화면에는 넣지 않습니다. 특히 결과 상태(확인함·처리 완료·처리가 어려움), 집주인 업무 화면(07·24·25·32~35·37~39·41~43), 공지 상세(15), 재방문(03·30), 44·45에는 넣지 않습니다.
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
