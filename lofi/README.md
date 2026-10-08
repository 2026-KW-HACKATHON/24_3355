# 월계함 lofi

한 건물(햇살빌라, 가상)에서 집주인이 안내를 남기고, A가 입주해 살고, A가 떠난 뒤 B가 같은 정보를 이어받는 한 사이클의 모바일 화면 묶음입니다.

- 전체 흐름: [board.html](board.html) (브라우저로 열기)
- 흐름·화면 대응과 개발 계약 초안(권한·데이터·상태·작성자 정책): [screens.md](screens.md)
- 함이 가이드와 생성 프롬프트: [design/characters/hami](../design/characters/hami/README.md)

## 구조

```
lofi/
├── README.md
├── board.html              전체 흐름 검토판 (흐름 8개 + 패널)
├── screens.md              흐름·화면 대응, 개발 계약 초안, 남은 상태
├── screens/NN-*.html       화면 1장 = 파일 1개 (390×844pt, 9:19.5), 00~46 (27번 없음)
├── src/
│   ├── lofi.css            토큰·공통 컴포넌트 (버튼, 6칸 코드, 칩, 입력, 시트, 탭바, 키보드, 빈 상태)
│   ├── building.css        공개 화면과 거주자 홈이 공유하는 건물 헤더·공지·안내 타일·자주 쓰는 말·팁 카드
│   └── chrome.js           상태바·Safari 하단 막대·탭바·키보드·3D 자리표시·QR 자리표시 자동 삽입
├── assets/hami/            design 원본과 같은 확정 함이 13종
├── assets/splash/          00 화면에서 쓰는 9:19.5 스플래시 합성 사본
├── scripts/export.py       PNG 내보내기
└── out/                    생성물 (export.py가 만듦)
    ├── screens/NN-*.png    화면 1170×2532
    ├── flows/flow-NN.png   흐름별 한 장 (01~05 CORE, 06 SUPPORTING, 07 OPTIONAL, 08 공통 조건)
    ├── flows/hami-assets.png  함이 배치표
    └── board.png           검토판 전체
```

## 다시 만들기

```bash
python3 lofi/scripts/export.py          # 화면 전체 + board.png + flows/
python3 lofi/scripts/export.py 05 06    # 파일명 일부로 골라서 (화면만)
python3 lofi/scripts/export.py board    # 검토판과 흐름별 이미지만
```

Python Playwright와 로컬 Chrome을 사용합니다. 폰트(Pretendard)와 아이콘(Lucide)은 CDN에서 불러오므로 네트워크가 필요합니다. 화면 파일을 지우면 다음 내보내기 때 `out/screens/`의 같은 이름 PNG도 지워집니다.

## 검토판 구성

- 맨 위: 제품 한 문장, HMW, 등급 설명.
- 흐름 8개: CORE 1~5 → SUPPORTING → OPTIONAL → 공통 조건. 흐름마다 등급 배지를 붙입니다.
- 화살표 세 종류: `→` 같은 사람의 다음 화면, `⇢` 다른 사람에게 닿음, `⏱` 시간이 지난 뒤. `·`는 같은 자리의 다른 경로입니다.
- 카드: 화면 ID·역할·제목과 진입·권한·누르면·실패·함이. 최근 추가한 화면에는 ‘새로 그림’ 표시.
- 아래 패널: 들어온 경로별 첫 화면, 관계별 권한, 상태·예외 점검, 결정이 필요한 것, 함이 에셋 배치.
- 카드와 패널 내용은 `board.html` 아래쪽 `CHAPTERS`·`ASSETS` 데이터에서 고칩니다.

## 화면 작성 규칙

- 한 화면에 주요 버튼은 하나입니다(`.cta-dock`). 선택 행동은 `btn-secondary`로 둡니다.
- 상태는 색과 글자를 함께 씁니다: `badge received / checked / done / hard`.
- 화면 ID와 기획 메모는 화면 안에 넣지 않고 `board.html`과 `screens.md`에 적습니다.
- 하단 탭은 거주자 `우리 건물 · 내 정보`, 집주인 `건물 관리 · 받은 내용 · 설정`입니다.
- 함이 이미지는 design 원본의 사본만 둡니다. 새 포즈는 design에서 먼저 확정합니다.

### `.phone` 옵션

| 속성 | 뜻 |
|---|---|
| `data-tabs="resident:building"` | 탭바를 붙이고 활성 탭을 지정합니다. 거주자 `building / me`, 집주인 `manage / inbox / settings`. 세 번째 값은 빨간 점을 찍을 탭입니다 (`landlord:manage:inbox`) |
| `data-kb="ko"` 또는 `"en"` | 키보드를 붙이고 Safari 막대를 숨깁니다. 시트는 키보드 위에 뜹니다 |
| `data-safari="off"` | Safari 막대 없이 그립니다 (스플래시·잠금화면) |
| `data-bare="on"` + `<iframe class="bg">` | 이미 그린 화면을 시트 뒤 배경으로 재사용합니다. 크롬은 배경 화면 쪽에서 그립니다 |
| `#quiet` (iframe 주소 끝) | 배경 화면의 `data-quiet-hide` 요소(읽어주기 막대 등)를 숨깁니다 |
| `data-status-dark="on"` | 어두운 배경용 흰 상태바 |

### 자리표시

- `.scene[data-city]`: 등각 투영 3D 자리표시. `data-scale`·`data-oy`·`data-ox`로 크기와 위치, `data-pin="off"`로 건물 표지를 끕니다.
- `[data-qr]`: 스캔되지 않는 QR 모양 격자.
- `.photo`: 실제 사진이 들어갈 자리.
