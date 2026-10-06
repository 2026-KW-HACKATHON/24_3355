#!/usr/bin/env bash
# 이미 돌고 있는 환경의 CloudFront → EC2 구간을 HTTPS(caddy + 인증서)로 옮깁니다(D-31, docs/aws-setup.md 7-A).
# 관리자가 자기 터미널에서 단계마다 실행합니다. 새로 만드는 환경은 setup-infra.sh가 처음부터 HTTPS로 만듭니다.
#   bash infra/aws/switch-origin-tls.sh prepare <인증서 연락 이메일>   1) 비밀값·보안 그룹·server.env 준비
#        → caddy가 들어간 변경을 배포(main 병합 또는 Deploy API 수동 실행)하면 caddy가 인증서를 받습니다
#   bash infra/aws/switch-origin-tls.sh switch     2) 서버에서 인증서를 확인한 뒤 CloudFront 원본을 https로
#   bash infra/aws/switch-origin-tls.sh cleanup    3) API 포트를 서버 안으로 닫고 보안 그룹을 443만 남김
#   bash infra/aws/switch-origin-tls.sh rollback   되돌리기: CloudFront를 예전 HTTP 원본(8081·8082)으로
# 단계마다 --dry-run을 붙이면 조회만 하고 바꿀 내용을 출력합니다(AWS를 바꾸거나 서버에서 명령을 실행하지 않음).
# 원본 이름은 탄력적 IP로 만든 <a-b-c-d>.sslip.io가 기본이고, 팀 도메인이 있으면 ORIGIN_DOMAIN=origin.example.kr로
# 넘깁니다(그 도메인의 dev·prod A 레코드를 먼저 탄력적 IP로). 여러 번 실행해도 됩니다. 비밀값은 출력하지 않습니다.
set -euo pipefail

usage() { sed -n '4,8p' "$0" >&2; exit 2; }
PHASE="${1:-}"
shift || true
DRY=0
ACME_EMAIL=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    *) ACME_EMAIL="$arg" ;;
  esac
done
case "$PHASE" in
  prepare) [ -n "$ACME_EMAIL" ] || usage ;;
  switch | cleanup | rollback) ;;
  *) usage ;;
esac

export AWS_REGION="${AWS_REGION:-ap-northeast-2}" AWS_PAGER=""
cd "$(git rev-parse --show-toplevel)"
step() { printf '\n== %s\n' "$1"; }
# change <설명> <명령...>: 바꾸는 명령. --dry-run이면 설명만 출력합니다(명령 인자에 비밀값이 있을 수 있어 출력하지 않음).
change() {
  local desc="$1"
  shift
  if [ "$DRY" = 1 ]; then echo "  [dry-run] $desc"; else echo "  $desc"; "$@" >/dev/null; fi
}

INSTANCE_ID="$(aws ec2 describe-instances \
  --filters Name=tag:Project,Values=wolgyeham Name=tag:Role,Values=app Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ "$INSTANCE_ID" != "None" ] || { echo "실행 중인 앱 서버를 찾지 못했습니다" >&2; exit 1; }
EIP="$(aws ec2 describe-addresses --filters Name=instance-id,Values="$INSTANCE_ID" \
  --query 'Addresses[0].PublicIp' --output text)"
[ "$EIP" != "None" ] || { echo "앱 서버에 탄력적 IP가 없습니다" >&2; exit 1; }
EC2_DNS="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicDnsName' --output text)"
SG_ID="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].SecurityGroups[?GroupName=='wolgyeham-app'].GroupId | [0]" --output text)"
[ "$SG_ID" != "None" ] || { echo "앱 서버에 보안 그룹 wolgyeham-app이 없습니다" >&2; exit 1; }
CF_PL="$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)"
ORIGIN_DOMAIN="${ORIGIN_DOMAIN:-${EIP//./-}.sslip.io}"
# server.env와 Caddyfile에 그대로 들어가므로 형식을 확인합니다(deploy.sh와 같은 규칙).
DOMAIN_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'
[[ "$ORIGIN_DOMAIN" =~ $DOMAIN_RE ]] || { echo "ORIGIN_DOMAIN 형식이 다릅니다: $ORIGIN_DOMAIN" >&2; exit 1; }
if [ -n "$ACME_EMAIL" ] && ! [[ "$ACME_EMAIL" =~ $EMAIL_RE ]]; then
  echo "이메일 형식이 다릅니다" >&2
  exit 1
fi
[ "$DRY" = 1 ] && echo "(dry-run: 조회만 하고 바꾸지 않습니다)"
echo "서버 $INSTANCE_ID  탄력적 IP $EIP  보안 그룹 $SG_ID"
echo "원본 dev.$ORIGIN_DOMAIN, prod.$ORIGIN_DOMAIN"

# remote <설명(영문, SSM comment)> <셸 명령>: SSM Run Command로 서버에서 실행하고 표준 출력을 돌려줍니다.
remote() {
  local desc="$1" cmd="$2" id status
  if [ "$DRY" = 1 ]; then
    printf '  [dry-run] 서버에서 실행: %s\n' "$cmd" >&2
    return 0
  fi
  id="$(aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --comment "$desc" \
    --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$cmd")" \
    --query 'Command.CommandId' --output text)"
  aws ssm wait command-executed --command-id "$id" --instance-id "$INSTANCE_ID" 2>/dev/null || true
  aws ssm get-command-invocation --command-id "$id" --instance-id "$INSTANCE_ID" \
    --query StandardOutputContent --output text
  status="$(aws ssm get-command-invocation --command-id "$id" --instance-id "$INSTANCE_ID" --query Status --output text)"
  [ "$status" = Success ] || { echo "서버 명령 실패($status): $desc" >&2; return 1; }
}

# server.env의 키를 바꾸거나(KEY=값) 지웁니다(KEY=). 바꾸기 전 server.env.bak으로 남깁니다.
server_env() {
  local keys="" lines=""
  for kv in "$@"; do
    keys="$keys|${kv%%=*}"
    [ -n "${kv#*=}" ] && lines="$lines echo '$kv';"
  done
  remote "wolgyeham server.env" "cd /opt/wolgyeham && cp server.env server.env.bak && \
{ grep -v -E '^(${keys#|})=' server.env || true; $lines } > server.env.tmp && mv server.env.tmp server.env && \
grep -E '^(${keys#|})=' server.env || true" | sed 's/^/  /'
}

# 띄워져 있는 API 컨테이너만 지금 server.env로 다시 만듭니다(포트 공개 범위 반영). 몇 초 끊깁니다.
recreate_api() {
  remote "wolgyeham recreate api" "cd /opt/wolgyeham && c='docker compose --env-file server.env --env-file .deploy.env' && \
for s in api-dev api-prod; do if [ -n \"\$(\$c ps -q \$s)\" ]; then \$c up -d --no-deps \$s; fi; done && \
ss -ltnH '( sport = :8081 or sport = :8082 )' | awk '{print \"  listen \" \$4}'"
}

# CloudFront 목록(규칙 55개로 셈, 한도 60)을 쓰는 규칙은 하나뿐이어야 하므로 새로 더하지 않고 포트 범위를 고칩니다.
# cf_ports <from> <to> [if-no-443]: if-no-443이면 지금 범위에 443이 있을 때 그대로 둡니다(cleanup 뒤 다시 넓히지 않게).
cf_ports() {
  local from="$1" to="$2" only="${3:-}" rule id cur_from cur_to
  rule="$(aws ec2 describe-security-group-rules --filters Name=group-id,Values="$SG_ID" \
    --query "SecurityGroupRules[?IsEgress==\`false\` && PrefixListId=='$CF_PL'] | [0].[SecurityGroupRuleId,FromPort,ToPort]" \
    --output text)"
  if [ "$rule" = "None" ]; then
    change "보안 그룹: CloudFront → $from-$to 허용 추가" aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
      --ip-permissions "IpProtocol=tcp,FromPort=$from,ToPort=$to,PrefixListIds=[{PrefixListId=$CF_PL,Description=CloudFront to origin}]"
    return
  fi
  read -r id cur_from cur_to <<<"$rule"
  if [ "$cur_from-$cur_to" = "$from-$to" ] ||
    { [ "$only" = if-no-443 ] && [ "$cur_from" -le 443 ] && [ "$cur_to" -ge 443 ]; }; then
    echo "  보안 그룹: CloudFront → $cur_from-$cur_to 그대로"
    return
  fi
  change "보안 그룹: CloudFront 규칙 $id 포트 $cur_from-$cur_to → $from-$to" \
    aws ec2 modify-security-group-rules --group-id "$SG_ID" --security-group-rules \
    "[{\"SecurityGroupRuleId\":\"$id\",\"SecurityGroupRule\":{\"IpProtocol\":\"tcp\",\"FromPort\":$from,\"ToPort\":$to,\"PrefixListId\":\"$CF_PL\",\"Description\":\"CloudFront to origin\"}}]"
}

http80() {
  local id
  id="$(aws ec2 describe-security-group-rules --filters Name=group-id,Values="$SG_ID" \
    --query "SecurityGroupRules[?IsEgress==\`false\` && CidrIpv4=='0.0.0.0/0' && FromPort==\`80\` && ToPort==\`80\`] | [0].SecurityGroupRuleId" \
    --output text)"
  if [ "$id" = "None" ]; then
    change "보안 그룹: 80 전체 허용 추가(인증서 발급 확인과 HTTPS 안내만)" aws ec2 authorize-security-group-ingress \
      --group-id "$SG_ID" --ip-permissions \
      "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=ACME HTTP-01 and redirect only}]"
  else
    echo "  보안 그룹: 80 이미 있음"
  fi
}

cf_id() {
  aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='wolgyeham api $1'].Id | [0]" --output text
}

# cf_apply <dev|prod> <keep|https|http>: 원본을 바꾸고 X-Origin-Verify 헤더를 SSM 값으로 맞춥니다.
#   keep: 원본은 그대로, 헤더만   https: <env>.<ORIGIN_DOMAIN>:443 https-only   http: EC2 퍼블릭 DNS:8081/8082 http-only
cf_apply() {
  local e="$1" mode="$2" id tmp etag secret="" plan
  id="$(cf_id "$e")"
  [ "$id" != "None" ] || { echo "  $e: API CloudFront를 찾지 못했습니다(Comment 'wolgyeham api $e')" >&2; return 1; }
  tmp="$(mktemp)"
  chmod 600 "$tmp"
  aws cloudfront get-distribution-config --id "$id" --output json > "$tmp"
  etag="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ETag"])' "$tmp")"
  secret="$(aws ssm get-parameter --name "/wolgyeham/$e/ORIGIN_VERIFY_SECRET" --with-decryption \
    --query Parameter.Value --output text 2>/dev/null || true)"
  plan="$(ORIGIN_SECRET="$secret" python3 - "$tmp" "$mode" "$e.$ORIGIN_DOMAIN" "$EC2_DNS" "$e" <<'PY'
import json, os, sys
path, mode, host, ec2_dns, env = sys.argv[1:]
config = json.load(open(path))["DistributionConfig"]
secret = os.environ["ORIGIN_SECRET"]
changes = []
for origin in config["Origins"]["Items"]:
    custom = origin["CustomOriginConfig"]
    def show():
        port = custom["HTTPSPort"] if custom["OriginProtocolPolicy"] == "https-only" else custom["HTTPPort"]
        return f'{custom["OriginProtocolPolicy"]} {origin["DomainName"]}:{port}'
    before = show()
    if mode == "https":
        origin["DomainName"] = host
        custom.update(OriginProtocolPolicy="https-only", HTTPSPort=443)
        custom["OriginSslProtocols"] = {"Quantity": 1, "Items": ["TLSv1.2"]}
    elif mode == "http":
        origin["DomainName"] = ec2_dns
        custom.update(OriginProtocolPolicy="http-only", HTTPPort=8081 if env == "dev" else 8082)
    if show() != before:
        changes.append(f"원본 {before} → {show()}")
    headers = origin.get("CustomHeaders", {}).get("Items", [])
    current = [h["HeaderValue"] for h in headers if h["HeaderName"] == "X-Origin-Verify"]
    if not secret:
        changes.append("X-Origin-Verify: SSM 값이 아직 없음(prepare가 만든 뒤 붙임)")
    elif current != [secret]:
        items = [h for h in headers if h["HeaderName"] != "X-Origin-Verify"]
        items.append({"HeaderName": "X-Origin-Verify", "HeaderValue": secret})
        origin["CustomHeaders"] = {"Quantity": len(items), "Items": items}
        changes.append("X-Origin-Verify: " + ("값 바꿈" if current else "새로 붙임"))
json.dump(config, open(path, "w"))
print("\n".join(changes))
PY
)"
  if [ -z "$plan" ]; then
    echo "  $e ($id): 바꿀 것 없음"
  elif [ "$DRY" = 1 ]; then
    printf '  [dry-run] %s (%s):\n%s\n' "$e" "$id" "$(sed 's/^/    /' <<<"$plan")"
  elif [ -z "$secret" ]; then
    # 헤더 없이 원본만 바꾸면 caddy가 모두 403으로 막으므로 바꾸지 않습니다.
    rm -f "$tmp"
    echo "  $e: SSM /wolgyeham/$e/ORIGIN_VERIFY_SECRET이 없어 바꾸지 않았습니다. prepare를 먼저 실행합니다" >&2
    return 1
  else
    printf '  %s (%s):\n%s\n' "$e" "$id" "$(sed 's/^/    /' <<<"$plan")"
    aws cloudfront update-distribution --id "$id" --if-match "$etag" \
      --distribution-config "file://$tmp" --query 'Distribution.Status' --output text >/dev/null
    CHANGED_IDS="$CHANGED_IDS $id"
  fi
  rm -f "$tmp"
}

# 바뀐 배포가 퍼질 때까지 기다린 뒤 공개 주소로 /api/health를 확인합니다.
cf_wait_and_check() {
  local id e domain
  if [ "$DRY" = 0 ]; then
    for id in $CHANGED_IDS; do
      echo "  $id 반영을 기다립니다(보통 몇 분)"
      aws cloudfront wait distribution-deployed --id "$id"
    done
  fi
  for e in dev prod; do
    domain="$(aws cloudfront list-distributions \
      --query "DistributionList.Items[?Comment=='wolgyeham api $e'].DomainName | [0]" --output text)"
    printf '  %s https://%s/api/health → %s\n' "$e" "$domain" \
      "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$domain/api/health" || true)"
  done
}
CHANGED_IDS=""

case "$PHASE" in
prepare)
  step "1. X-Origin-Verify 비밀값 (SSM, 없을 때만 생성)"
  for e in dev prod; do
    name="/wolgyeham/$e/ORIGIN_VERIFY_SECRET"
    if aws ssm get-parameter --name "$name" >/dev/null 2>&1; then
      echo "  $name 있음"
    else
      change "$name 생성" aws ssm put-parameter --name "$name" --type SecureString \
        --value "$(openssl rand -hex 32)" --tags Key=Project,Value=wolgyeham
    fi
  done

  step "2. CloudFront에 헤더 붙이기 (원본은 아직 HTTP 그대로)"
  for e in dev prod; do cf_apply "$e" keep; done

  step "3. 보안 그룹 (옮기는 동안 CloudFront → 443~8082, 80 전체)"
  cf_ports 443 8082 if-no-443
  http80

  step "4. server.env (원본 이름·연락 주소, 옮기는 동안 API 포트 공개 유지)"
  server_env "ORIGIN_DOMAIN=$ORIGIN_DOMAIN" "ACME_EMAIL=$ACME_EMAIL" "API_BIND_ADDRESS=0.0.0.0"

  step "5. 원본 이름 확인 (DNS)"
  for e in dev prod; do
    got="$(python3 -c 'import socket,sys; print(socket.gethostbyname(sys.argv[1]))' "$e.$ORIGIN_DOMAIN" 2>/dev/null || echo 없음)"
    if [ "$got" = "$EIP" ]; then echo "  $e.$ORIGIN_DOMAIN → $got"; else
      echo "  $e.$ORIGIN_DOMAIN → $got (탄력적 IP $EIP가 아님. 팀 도메인이면 A 레코드를 확인)" >&2
    fi
  done

  cat <<EOF

다음: caddy가 들어간 변경을 배포합니다(main 병합 또는 Actions → Deploy API → dev).
      배포 뒤 SSM 세션에서 인증서를 확인합니다:
        cd /opt/wolgyeham && docker compose --env-file server.env --env-file .deploy.env logs caddy | grep -i 'certificate obtained'
      dev.$ORIGIN_DOMAIN, prod.$ORIGIN_DOMAIN 두 줄이 보이면  bash infra/aws/switch-origin-tls.sh switch
EOF
  ;;

switch)
  step "1. 서버에서 인증서와 헤더 검사 확인"
  # 서버 안에서 caddy(443)로 직접 묻습니다. 헤더 없이 403, 헤더와 함께 200이면 인증서·라우팅·API가 모두 맞습니다.
  out="$(remote "wolgyeham origin tls check" "cd /opt/wolgyeham && . env/caddy.env && umask 077 && \
echo \"domain \$ORIGIN_DOMAIN\" && for e in dev prod; do h=\"\$e.\$ORIGIN_DOMAIN\"; \
if [ \$e = dev ]; then s=\"\$DEV_ORIGIN_VERIFY_SECRET\"; else s=\"\$PROD_ORIGIN_VERIFY_SECRET\"; fi; \
printf 'X-Origin-Verify: %s\n' \"\$s\" > /run/wolgyeham-h; \
a=\$(curl -s -o /dev/null -w '%{http_code} %{errormsg}' --max-time 10 --resolve \"\$h:443:127.0.0.1\" \"https://\$h/api/health\" || true); \
b=\$(curl -s -o /dev/null -w '%{http_code} %{errormsg}' --max-time 10 --resolve \"\$h:443:127.0.0.1\" -H @/run/wolgyeham-h \"https://\$h/api/health\" || true); \
rm -f /run/wolgyeham-h; echo \"\$e \$a \$b\"; done")"
  if [ "$DRY" = 0 ]; then
    echo "$out" | sed 's/^/  /'
    ok=1
    [ "$(sed -n 's/^domain //p' <<<"$out")" = "$ORIGIN_DOMAIN" ] || ok=0
    for e in dev prod; do
      read -r _ plain verified <<<"$(grep "^$e " <<<"$out" || true)" || true
      [ "$plain" = 403 ] || ok=0
      case "$verified" in
        200) ;;
        502) echo "  $e: caddy·인증서는 맞지만 API 컨테이너가 응답하지 않습니다(그 환경을 아직 배포하지 않았으면 지금과 같음)" >&2 ;;
        *) ok=0 ;;
      esac
    done
    if [ "$ok" = 0 ]; then
      echo "서버 확인 결과가 다릅니다(기대: 도메인 $ORIGIN_DOMAIN, 헤더 없이 403, 헤더와 함께 200)." >&2
      echo "인증서가 아직이면 caddy 로그를 봅니다(docs/deploy.md '원본 HTTPS(caddy)'). CloudFront는 바꾸지 않았습니다." >&2
      exit 1
    fi
  fi

  step "2. 보안 그룹 (CloudFront → 443 포함)"
  cf_ports 443 8082 if-no-443
  http80

  step "3. CloudFront 원본을 https://<env>.$ORIGIN_DOMAIN 로"
  for e in dev prod; do cf_apply "$e" https; done

  step "4. 반영 확인"
  cf_wait_and_check
  cat <<EOF

다음: dev·prod 웹에서 /api/health와 로그인을 확인한 뒤  bash infra/aws/switch-origin-tls.sh cleanup
      문제가 있으면  bash infra/aws/switch-origin-tls.sh rollback
EOF
  ;;

cleanup)
  step "1. CloudFront가 HTTPS 원본으로 반영됐는지 확인"
  for e in dev prod; do
    state="$(aws cloudfront get-distribution --id "$(cf_id "$e")" \
      --query 'Distribution.[Status,DistributionConfig.Origins.Items[0].DomainName,DistributionConfig.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy]' \
      --output text)"
    echo "  $e: $state"
    if [ "$state" != "$(printf 'Deployed\t%s\thttps-only' "$e.$ORIGIN_DOMAIN")" ]; then
      echo "$e CloudFront가 아직 https://$e.$ORIGIN_DOMAIN 원본으로 반영되지 않았습니다. switch를 먼저 끝냅니다" >&2
      exit 1
    fi
  done

  step "2. API 포트를 서버 안(127.0.0.1)으로"
  server_env "API_BIND_ADDRESS="
  recreate_api

  step "3. 보안 그룹 (CloudFront → 443만, 8081~8082 닫기)"
  cf_ports 443 443
  http80

  step "4. 확인"
  cf_wait_and_check
  ;;

rollback)
  step "1. 보안 그룹 (CloudFront → 443~8082)"
  cf_ports 443 8082

  step "2. API 포트 다시 공개"
  server_env "API_BIND_ADDRESS=0.0.0.0"
  recreate_api

  step "3. CloudFront 원본을 http://$EC2_DNS:8081/8082 로"
  for e in dev prod; do cf_apply "$e" http; done

  step "4. 반영 확인"
  cf_wait_and_check
  echo
  echo "caddy와 80 규칙은 남아 있습니다. 원인을 고친 뒤 switch를 다시 실행합니다."
  ;;
esac
