# 월계함 lofi

한 건물(햇살빌라, 가상)에서 집주인이 안내를 남기고, A가 입주해 살고, 이웃이 상황을 알리고, A가 떠난 뒤 B가 이어받는 한 사이클의 화면 묶음입니다. 전체 흐름은 `board.html`에서, 화면 번호와 LF ID의 대응은 [screens.md](screens.md)에서 봅니다.

## 구조

```
lofi/
├── board.html          전체 흐름 검토판
├── screens.md          LF ID ↔ 화면 파일 대응, 관계·상태 규칙, 남은 상태
├── screens/NN-*.html   화면 1장 = 파일 1개 (390×844pt, 9:19.5), 00~36 (27번 없음)
├── src/lofi.css        토큰·공통 컴포넌트 (버튼, 6칸 코드, 칩, 입력, 시트, 탭바, 키보드, 빈 상태)
├── src/building.css    공개 화면과 거주자 홈이 공유하는 건물 헤더·공지·안내 타일·자주 쓰는 말·팁 카드
├── src/chrome.js       상태바·Safari 하단 막대·탭바·키보드·3D 자리표시·QR 자리표시 자동 삽입
├── assets/hami/        design 원본과 같은 확정 함이 13종
├── scripts/export.py   PNG 내보내기
└── out/                결과 PNG (화면 1170×2532, board.png)
```

## 다시 만들기

```bash
python3 lofi/scripts/export.py          # 전체 화면 + board.png
python3 lofi/scripts/export.py 05 06    # 파일명 일부로 골라서
```

Python Playwright와 로컬 Chrome을 사용합니다. 폰트(Pretendard)와 아이콘(Lucide)은 CDN에서 불러오므로 네트워크가 필요합니다.

## 검토판 구성

- 맨 위에 집주인 기준 스토리 5단계, 그 아래 흐름 7개를 화면 순서대로 둡니다.
- 화살표는 세 종류입니다. `→` 같은 사람의 다음 화면, `⇢` 다른 사람에게 닿음, `⏱` 시간이 지난 뒤.
- 카드마다 진입·권한·누르면·실패와 재진입·함이를 적습니다. 새로 그린 화면에는 ‘새로 그림’ 표시를 붙입니다.
- 아래 패널: 들어온 경로별 첫 화면, 건물과의 관계별 권한, 상태·예외 점검, 결정이 필요한 것, 함이 에셋 배치.
- 카드와 패널의 내용은 `board.html` 아래쪽 `CHAPTERS`·`ASSETS` 데이터에서 고칩니다.

## 화면 작성 규칙

- 함이 사용 기준은 [design의 가이드](../design/characters/hami/README.md), 생성 요청과 검토 상태는 [PROMPTS.md](../design/characters/hami/PROMPTS.md)에서 관리합니다. 이 폴더에는 원본과 같은 사본만 둡니다.
- 한 화면에 주요 버튼은 하나입니다(`.cta-dock`). 선택 행동은 `btn-secondary`로 둡니다.
- 상태는 색과 글자를 함께 씁니다: `badge received / checked / done / hard`.
- 화면 ID와 기획 메모는 화면 안에 넣지 않고 `board.html`과 `screens.md`에 적습니다.
- 하단 탭은 거주자 `우리 건물 · 보낸 내용 · 내 정보`, 집주인 `건물 관리 · 받은 내용 · 설정`입니다.

### `.phone` 옵션

| 속성 | 뜻 |
|---|---|
| `data-tabs="resident:building"` | 탭바를 붙이고 활성 탭을 지정합니다. 거주자 `building / sent / me`, 집주인 `manage / inbox / settings`. 세 번째 값은 빨간 점을 찍을 탭입니다 (`landlord:manage:inbox`) |
| `data-kb="ko"` 또는 `"en"` | 키보드를 붙이고 Safari 막대를 숨깁니다. 시트는 키보드 위에 뜹니다 |
| `data-safari="off"` | Safari 막대 없이 그립니다 (스플래시·잠금화면) |
| `data-bare="on"` + `<iframe class="bg">` | 이미 그린 화면을 시트 뒤 배경으로 재사용합니다. 크롬은 배경 화면 쪽에서 그립니다 |
| `#quiet` (iframe 주소 끝) | 배경 화면의 `data-quiet-hide` 요소(읽어주기 막대 등)를 숨깁니다 |
| `data-status-dark="on"` | 어두운 배경용 흰 상태바 |

### 자리표시

- `.scene[data-city]`: 등각 투영 3D 자리표시. `data-scale`·`data-oy`·`data-ox`로 크기와 위치, `data-pin="off"`로 건물 표지를 끕니다.
- `[data-qr]`: 스캔되지 않는 QR 모양 격자.
- `.photo`: 실제 사진이 들어갈 자리.
