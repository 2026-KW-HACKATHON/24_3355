# GCP 운영 환경

2026-11-01부터 월계함 서비스가 도는 곳입니다. 처음에는 AWS와 따로 둔 시험 환경([D-36](decisions.md#d-36-gcp-시험-환경을-aws와-따로-둔다))이었고, AWS를 내리면서 AWS dev 데이터를 옮겨 와 하나로 합쳤습니다([D-39](decisions.md#d-39-aws를-내리고-gcp-한-곳으로-옮긴다)).

- 주소: https://gcp.34-143-67-39.sslip.io (고정 IP `wolgyeham-ip`에서 만든 sslip.io 이름)
- 기준 파일: [infra/gcp/](../infra/gcp/) — `setup.sh`(클라우드 자원), `deploy.sh`(배포), `server.sh`(서버 쪽 배포 단계), `compose.yaml`, `Caddyfile`, `startup.sh`(VM 준비), `backup.sh`·`systemd/`(DB 백업)
- 담당: 관리자. 자원을 만들거나 지우는 명령은 관리자가 자기 gcloud 로그인으로 실행합니다.
- 시연 모드(`DEMO_MODE=true`)로 돌고(시연 건물은 둘러보기 전용, 실제 건물은 그대로 씀), 카카오 로그인 키는 Secret Manager `wolgyeham-api-env`에 있습니다. AWS dev의 실제 데이터(전시관 건물 등)가 들어 있습니다. API 문서(`/api/docs`, `/api/swagger`)는 `API_DOCS=true`로 켭니다.

## 구성

| 자원 | 이름 | 비고 |
|---|---|---|
| 프로젝트·리전 | `wolgyeham-kw2026`, `us-west1`(영역 `us-west1-b`) | 무료 등급 e2-micro가 되는 리전 |
| VM | `wolgyeham`(e2-micro, Debian 12, 부팅 디스크 `wolgyeham`) | Docker compose로 caddy·api·db. 메모리 1GB + 스왑 1GB |
| 서비스 계정 | `wolgyeham-vm@wolgyeham-kw2026.iam.gserviceaccount.com` | VM에 붙임(범위 cloud-platform). 권한은 아래 버킷·비밀과 이미지 읽기·로그 쓰기, 도우미(D-37)의 Vertex AI·Translation 사용자에만 |
| 고정 IP | `wolgyeham-ip` | 80·443만 엽니다(네트워크 태그 `wolgyeham-web`). SSH는 IAP 터널로만 |
| 이미지 저장소 | Artifact Registry `us-west1-docker.pkg.dev/wolgyeham-kw2026/wolgyeham/api` | deploy.sh가 올리고 VM이 받음 |
| 사진 버킷 | `gs://wolgyeham-kw2026-photos`, 접두사 `gcp/` | 균일 버킷 수준 접근, 공개 접근 방지. VM은 `roles/storage.objectAdmin` |
| 백업 버킷 | `gs://wolgyeham-kw2026-backups`, `db/YYYY-MM-DD.dump` | 14일 뒤 수명 주기로 지움. VM은 `objectCreator`·`objectViewer`(덮어쓰기·삭제 없음) |
| 비밀 | Secret Manager `wolgyeham-api-env`, `wolgyeham-db-password` | VM은 `roles/secretmanager.secretAccessor`. 복제는 `us-west1`만 |
| 디스크 스냅샷 | 일정 `wolgyeham-daily` | 매일 18:00 UTC(03:00 KST), 7일 보관, 부팅 디스크에 붙임 |
| 가동 확인 | 업타임 체크 `wolgyeham-api-health`, 알림 정책 `wolgyeham-api-health-alert` | `https://<주소>/api/health`를 5분마다. 실패하면 메일 |

```
브라우저 ──https──▶ caddy(80·443, Let's Encrypt) ──/api──▶ api(3001) ──▶ db(Postgres 17, 볼륨 postgres-data)
                         └── 웹 파일(/opt/wolgyeham/web)          └──▶ GCS 사진 버킷(gcp/)
VM 서비스 계정(메타데이터 서버) ─▶ Secret Manager(배포 때) · GCS · Artifact Registry
systemd 타이머 ─▶ pg_dump ─▶ GCS 백업 버킷           디스크 스냅샷 일정 ─▶ 부팅 디스크
```

- 웹과 API가 한 주소라 Amplify `/api` 프록시와 같은 동작입니다. caddy가 X-Forwarded-For에 접속 주소를 붙이므로 `TRUSTED_PROXY_HOPS=1`입니다.
- 서버 파일: `/opt/wolgyeham/`에 `compose.yaml`, `Caddyfile`, `web/`, 스크립트, `.env`(DB_PASSWORD·API_IMAGE·SITE_HOST), `api.env`(APP_ORIGIN·DEMO_MODE·SESSION_SECRET·VAPID). 두 env 파일은 배포 때마다 `server.sh`가 Secret Manager에서 다시 만듭니다(root, 600).
- 비밀이 아닌 설정은 [compose.yaml](../infra/gcp/compose.yaml)의 `environment`에 둡니다(`PHOTO_STORE=gcs`, `PHOTO_BUCKET=wolgyeham-kw2026-photos`, `PHOTO_PREFIX=gcp/`, `TRUSTED_PROXY_HOPS`). 저장소에서 보이고 `environment`가 `api.env`보다 우선합니다. 비밀은 `api.env`(Secret Manager)에만 둡니다.
- 사진 저장소 `gcs`([lib/photoStore.ts](../apps/api/src/lib/photoStore.ts))는 `@google-cloud/storage`가 애플리케이션 기본 사용자 인증 정보(VM 메타데이터 서버)로 인증합니다. 키 파일을 두지 않습니다. 요청 10초, 다시 시도 2번(전체 20초)입니다. 라이브러리는 `PHOTO_STORE=gcs`일 때 처음 쓸 때만 불러와 AWS 쪽 API는 읽지 않습니다.
- 로그는 Docker json-file(컨테이너당 10MB×3)에만 남고 Cloud Logging으로 보내지 않습니다. 보기: `gcloud compute ssh wolgyeham --zone us-west1-b --tunnel-through-iap --command 'sudo docker compose -f /opt/wolgyeham/compose.yaml logs --tail 100 api'`.

## 비용

크레딧이 있어도 무료 한도 안에 두는 것을 기준으로 합니다. 금액은 2026-10 기준 대략이고, 정확한 값은 GCP 가격 페이지와 결제 보고서로 확인합니다.

| 항목 | 예상 | 근거 |
|---|---|---|
| e2-micro VM, 표준 디스크 30GB 이하 | 0 | 무료 등급(us-west1·us-central1·us-east1에서 한 대) |
| 고정 외부 IPv4(사용 중) | 월 약 3.6달러 | 시간당 0.005달러. 무료 등급에 들어가지 않는 유일한 고정 비용 |
| GCS(사진·백업) | 0 | 미국 리전 Standard 무료 한도(5GB-월 등) 안. 백업은 14일, 소프트 삭제 기본 7일도 저장량에 들어감 |
| Secret Manager | 0 | 활성 비밀 버전 6개·접근 월 1만 회 무료. 바꿀 때 옛 버전을 사용 중지해도 활성으로 셉니다(아래 비밀 바꾸기) |
| Artifact Registry | 0~소액 | 0.5GB 무료. 이미지가 약 76MB라 오래된 태그는 지웁니다 |
| 디스크 스냅샷 | 월 1달러 미만 | 증분 저장, 사용량(수 GB)×7일 보관 |
| Cloud Monitoring 업타임 체크·알림 | 0~소액 | 업타임 실행은 무료 한도 안(5분마다). 알림 정책 요금은 가격 페이지 확인 필요 |
| 나가는 트래픽 | 0 | 시연 규모는 무료 한도 안 |

예산 알림은 결제 계정에서 관리자가 따로 겁니다(이 스크립트는 만들지 않음).

## 처음 준비

VM·고정 IP·방화벽·Artifact Registry 저장소·서비스 계정은 이미 있습니다. 나머지는 `setup.sh`가 만듭니다. 여러 번 실행해도 됩니다.

```bash
gcloud auth login            # 관리자 계정
gcloud config set project wolgyeham-kw2026
bash infra/gcp/setup.sh --alert-email <알림 받을 주소>
```

- 버킷 두 개, 버킷 권한, 비밀 두 개(빈 채로)와 접근 권한, 스냅샷 일정, 알림 메일 채널·업타임 체크·알림 정책을 만들고 자원 이름만 출력합니다. 메일 채널은 처음 만들면 확인 메일이 갈 수 있습니다.
- 비밀값은 스크립트에 없습니다. 이미 가진 값을 넣으려면 `--api-env-file <파일>`(api.env 형식), `--db-password-file <파일>`(비밀번호 한 줄)을 넘깁니다. 넘기지 않으면 첫 배포가 채웁니다.
- 필요한 것: gcloud, curl, python3, openssl. 알림 채널은 gcloud 정식판 명령이 없어 Monitoring API를 직접 부릅니다(토큰은 명령 인자에 남기지 않음).

## 배포

```bash
export PATH=/opt/homebrew/opt/node@24/bin:$PATH   # Node 24
bash infra/gcp/deploy.sh
```

1. API 이미지(linux/amd64)를 Artifact Registry에 올리고 웹을 빌드해 IAP SSH로 서버에 보냅니다.
2. 비밀에 버전이 없으면 처음 한 번 채웁니다. 서버에 예전 파일이 있으면 그대로 옮기고(VAPID 키, 이미 DB 볼륨을 초기화한 비밀번호 유지), 내용이 같은지 해시로 확인합니다. 없으면 SESSION_SECRET·VAPID 키·DB 비밀번호를 만들어 표준 입력으로만 올립니다.
3. 서버의 `server.sh`가 `startup.sh`(Docker·gcloud·스왑 확인)를 돌리고, 비밀을 받아 `.env`·`api.env`를 만들고, 예전 로컬 사진 볼륨(`wolgyeham_photos`)이 있으면 한 번만 `gs://wolgyeham-kw2026-photos/gcp/`로 복사한 뒤(볼륨은 남김), 마이그레이션·시연 시드를 하고 compose를 올리고 백업 타이머를 설치합니다.
4. `https://<주소>/api/health`가 응답하면 `ok`.

확인: `curl https://gcp.34-143-67-39.sslip.io/api/photos/config`가 `uploadsEnabled: true`이고 시연 집주인 화면에서 사진을 올리면 `gs://wolgyeham-kw2026-photos/gcp/buildings/` 아래에 생깁니다.

## 비밀 바꾸기

비밀을 바꾼 뒤 `deploy.sh`를 다시 돌리면 서버 파일이 새 값으로 바뀝니다. 값은 화면에 출력하지 않고 파일(600)로만 다룹니다.

```bash
umask 077; f="$(mktemp)"
gcloud secrets versions access latest --secret wolgyeham-api-env --out-file "$f"
# $f를 편집기로 고칩니다(예: VAPID 키, SESSION_SECRET)
gcloud secrets versions add wolgyeham-api-env --data-file "$f" && rm -f "$f"
gcloud secrets versions list wolgyeham-api-env   # 옛 버전 번호 확인
gcloud secrets versions disable <옛 번호> --secret wolgyeham-api-env
bash infra/gcp/deploy.sh
```

- VAPID 키를 바꾸면 기존 알림 구독이 모두 끊깁니다(다시 켜야 함).
- 무료 한도는 활성 버전 6개입니다. 사용 중지한 버전도 셉니다. 영구 삭제(`versions destroy`)는 되돌릴 수 없으므로 관리자가 판단합니다.
- DB 비밀번호는 Postgres가 볼륨을 처음 만들 때만 읽습니다. 비밀만 바꾸면 API가 DB에 붙지 못하므로 DB 사용자 비밀번호도 같이 바꿉니다. VM 서비스 계정은 비밀을 읽기만 하므로 새 버전은 관리자 PC에서 올립니다.

```bash
# 관리자 PC
openssl rand -hex 24 | tr -d '\n' | gcloud secrets versions add wolgyeham-db-password --data-file=-
# 서버(gcloud compute ssh wolgyeham --zone us-west1-b --tunnel-through-iap)
sudo -i
cd /opt/wolgyeham
pw="$(gcloud secrets versions access latest --secret wolgyeham-db-password --project wolgyeham-kw2026)"
printf "ALTER USER wolgyeham PASSWORD '%s';\n" "$pw" | docker compose exec -T db psql -q -U wolgyeham -d wolgyeham
unset pw; exit
# 관리자 PC
bash infra/gcp/deploy.sh
```

## 백업과 복구

- 매일 18:30 UTC(03:30 KST)에 systemd 타이머 `wolgyeham-backup.timer`가 [backup.sh](../infra/gcp/backup.sh)를 돌립니다: `docker compose exec -T db pg_dump -Fc` → `gs://wolgyeham-kw2026-backups/db/YYYY-MM-DD.dump`. `-Fc`가 이미 압축하므로 gzip을 따로 하지 않습니다. 같은 날 두 번째 실행은 덮어쓰지 않고 건너뜁니다.
- 디스크 스냅샷(매일, 7일)은 VM 전체를 되돌릴 때 씁니다.
- 상태 보기: `systemctl list-timers wolgyeham-backup.timer`, `journalctl -u wolgyeham-backup -n 20`. 지금 한 번 돌리기: `sudo systemctl start wolgyeham-backup.service`.
- 백업 목록(관리자 PC): `gcloud storage ls gs://wolgyeham-kw2026-backups/db/`

DB 복구(서버에서, 지금 DB 내용을 백업 시점으로 바꿉니다. 복구 전에 팀에 알립니다):

```bash
sudo -i
cd /opt/wolgyeham
gcloud storage cp gs://wolgyeham-kw2026-backups/db/<YYYY-MM-DD>.dump /var/tmp/restore.dump
docker compose stop api
docker compose exec -T db pg_restore -U wolgyeham -d wolgyeham --clean --if-exists --no-owner < /var/tmp/restore.dump
docker compose start api
rm -f /var/tmp/restore.dump
curl -fsS https://gcp.34-143-67-39.sslip.io/api/health
```

사진은 버킷에 그대로 있습니다(소프트 삭제 7일 안이면 지운 객체도 `gcloud storage restore`로 되살릴 수 있음). VM 전체 복구는 스냅샷에서 새 디스크를 만들어 바꿉니다(`gcloud compute disks create ... --source-snapshot`).

## 내리기

시험이 끝나면 관리자가 아래 순서로 지웁니다. 버킷·비밀·스냅샷 삭제는 되돌릴 수 없으니 필요한 백업을 먼저 받아 둡니다. AWS 자원과는 관계없습니다.

```bash
P=wolgyeham-kw2026; R=us-west1; Z=us-west1-b
gcloud monitoring policies list --project $P --filter='displayName=wolgyeham-api-health-alert' --format='value(name)'  # → policies delete
gcloud monitoring uptime list-configs --project $P --filter='displayName=wolgyeham-api-health' --format='value(name)'  # → uptime delete
gcloud compute disks remove-resource-policies wolgyeham --zone $Z --resource-policies wolgyeham-daily --project $P
gcloud compute resource-policies delete wolgyeham-daily --region $R --project $P
gcloud compute instances delete wolgyeham --zone $Z --project $P
gcloud compute addresses delete wolgyeham-ip --region $R --project $P     # 이것을 지워야 IP 요금이 멈춥니다
gcloud storage rm --recursive gs://$P-photos gs://$P-backups
gcloud secrets delete wolgyeham-api-env --project $P
gcloud secrets delete wolgyeham-db-password --project $P
gcloud artifacts repositories delete wolgyeham --location $R --project $P
```

알림 메일 채널, 남은 스냅샷(`gcloud compute snapshots list`), 서비스 계정, 방화벽 규칙도 필요 없으면 지웁니다.

## 집주인 도우미 환경 변수 (D-37)

카톡 통째로 나누기(Vertex AI Gemini)와 공개 안내·공지 기계 번역(Cloud Translation v3)은 기본으로 꺼져 있고, 이 환경에서만 켜는 것을 전제로 합니다. AWS dev·prod는 값을 넣지 않으므로 그대로입니다(경로 404, 웹은 입구를 숨김). 자세한 동작은 [backend.md §7 집주인 도우미](backend.md#7-도메인-규칙)에 있습니다.

| 키 | 값 | 둘 곳 |
|---|---|---|
| `GCP_PROJECT` | `wolgyeham-kw2026` | compose.yaml `environment` (비밀 아님) |
| `GEMINI_ENABLED` | `true` | 〃 |
| `GEMINI_LOCATION`, `GEMINI_MODEL` | `us-west1`, `gemini-2.5-flash` (기본값이라 생략 가능) | 〃 |
| `TRANSLATION_ENABLED` | `true` | 〃 |

- 인증은 VM 서비스 계정(메타데이터 서버, 키 파일 없음)이고 범위는 이미 cloud-platform입니다. 관리자가 서비스 계정에 `roles/aiplatform.user`와 `roles/cloudtranslate.user`를 주고, 프로젝트에서 `aiplatform.googleapis.com`·`translate.googleapis.com`을 켭니다(setup.sh는 이 두 API·역할을 다루지 않습니다. 켜지 않으면 나누기·번역이 502입니다).
- 마이그레이션 `0012_content_translations`(번역 캐시 표)는 배포의 `db:migrate`가 적용합니다.
- 로컬에서 켜 보려면 `gcloud auth application-default login` 뒤 `gcloud auth application-default set-quota-project wolgyeham-kw2026`(Translation API는 사용자 자격 증명에 할당량 프로젝트가 필요)를 하고 `apps/api/.env`에 위 값을 넣습니다.
- 비용(2026-10 공개 가격 기준 대략): Gemini 2.5 Flash는 입력 100만 토큰당 0.30달러, 출력 2.50달러입니다. 나누기 한 번은 입력 약 1,500~3,500토큰·출력 약 1,000~2,500토큰이라 100번에 약 0.3~0.7달러입니다(생각 토큰 0). Translation은 100만 글자당 20달러이고 매달 50만 글자까지 무료입니다. 번역 1000번(제목+본문 평균 300자 가정, 캐시에 없는 것만)은 30만 글자라 무료 한도 안이고, 무료 한도를 넘기면 약 6달러입니다. 같은 내용은 해시가 같으면 다시 번역하지 않지만, 원문을 고치거나 시연 초기화로 캐시가 지워지면 다시 번역합니다. 상한은 반복 제한(집주인 나누기 1시간 20번, 새 번역 IP당 1시간 60번·서버 전체 하루 10만 글자)이고, 번역은 최악에도 하루 약 2달러(한 달 약 60달러)입니다. 결제 계정 예산 알림(`wolgyeham-gcp-monthly`, 월 10달러)을 함께 둡니다.

## 바꿀 때

이 환경을 바꾸면 이 문서와 `infra/gcp/`를 같은 PR에서 고치고 [decisions.md](decisions.md) D-36을 고칩니다. AWS 배포 문서([deploy.md](deploy.md), [aws-setup.md](aws-setup.md))는 바꾸지 않습니다.
