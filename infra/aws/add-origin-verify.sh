#!/usr/bin/env bash
# 이미 만든 API CloudFront(dev·prod)에 원본 확인 헤더(X-Origin-Verify)를 붙입니다. 관리자가 한 번 실행합니다.
#   aws login && bash infra/aws/add-origin-verify.sh
# 1) SSM /wolgyeham/<env>/ORIGIN_VERIFY_SECRET이 없으면 만든다.
# 2) 배포 설정을 받아 원본에 헤더를 넣고 update-distribution으로 반영한다(ETag 사용).
# API는 이 헤더가 맞을 때만 X-Forwarded-For를 믿는다(docs/backend.md, D-23). 비밀값은 출력하지 않는다.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"

for e in dev prod; do
  name="/wolgyeham/$e/ORIGIN_VERIFY_SECRET"
  aws ssm get-parameter --name "$name" >/dev/null 2>&1 ||
    aws ssm put-parameter --name "$name" --type SecureString --value "$(openssl rand -hex 32)" \
      --tags Key=Project,Value=wolgyeham >/dev/null

  id="$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='wolgyeham api $e'].Id | [0]" --output text)"
  if [ "$id" = "None" ]; then
    echo "$e: API CloudFront를 찾지 못했습니다(Comment 'wolgyeham api $e')" >&2
    continue
  fi

  tmp="$(mktemp)"
  chmod 600 "$tmp"
  aws cloudfront get-distribution-config --id "$id" --output json > "$tmp"
  etag="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ETag"])' "$tmp")"
  ORIGIN_SECRET="$(aws ssm get-parameter --name "$name" --with-decryption --query Parameter.Value --output text)" \
    python3 - "$tmp" <<'PY'
import json, os, sys
path = sys.argv[1]
config = json.load(open(path))["DistributionConfig"]
for origin in config["Origins"]["Items"]:
    items = [h for h in origin.get("CustomHeaders", {}).get("Items", []) if h["HeaderName"] != "X-Origin-Verify"]
    items.append({"HeaderName": "X-Origin-Verify", "HeaderValue": os.environ["ORIGIN_SECRET"]})
    origin["CustomHeaders"] = {"Quantity": len(items), "Items": items}
json.dump(config, open(path, "w"))
PY
  aws cloudfront update-distribution --id "$id" --if-match "$etag" \
    --distribution-config "file://$tmp" --query 'Distribution.Status' --output text
  rm -f "$tmp"
  echo "$e: 헤더를 붙였습니다 ($id). 반영에 몇 분 걸립니다."
done
