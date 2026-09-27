# 개발 문서

월계함을 어떻게 만들고 배포하는지 정리한 문서입니다. 무엇을 왜 만드는지는 [../README.md](../README.md), 화면과 권한·데이터 계약은 [../lofi/screens.md](../lofi/screens.md), 함께 일하는 규칙은 [../CONTRIBUTING.md](../CONTRIBUTING.md)가 기준입니다.

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

## 문서를 고칠 때

- 코드와 문서가 어긋나면 같은 PR에서 둘 다 고칩니다.
- 구조나 도구를 바꾸면 [decisions.md](decisions.md)에 새 항목을 추가합니다.
- 같은 내용을 여러 문서에 복제하지 않고 링크합니다.
- "(아직 구현 전)" 표시는 구현하면서 지웁니다.
