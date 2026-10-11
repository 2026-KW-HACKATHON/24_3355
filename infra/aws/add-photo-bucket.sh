#!/usr/bin/env bash
# 안내·공지 사진 버킷을 만들고 EC2 역할에 이 버킷만 읽고 쓰는 권한을 더합니다. 관리자가 한 번 실행합니다.
#   aws login && bash infra/aws/add-photo-bucket.sh
# 버킷은 공개 차단·SSE-S3 기본 암호화이고, 사진은 API(/api/photos/...)를 거쳐서만 나갑니다. dev·prod는 접두사(dev/·prod/)로 나눕니다.
# 다시 실행해도 됩니다(있으면 건너뛰고 역할 정책은 저장소의 ec2-instance-policy.json으로 다시 씁니다).
set -euo pipefail
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OPS_BUCKET="wolgyeham-ops-$ACCOUNT_ID"
PHOTO_BUCKET="wolgyeham-photos-$ACCOUNT_ID"
here="$(cd "$(dirname "$0")" && pwd)"

if aws s3api head-bucket --bucket "$PHOTO_BUCKET" 2>/dev/null; then
  echo "버킷 있음: $PHOTO_BUCKET"
else
  aws s3api create-bucket --bucket "$PHOTO_BUCKET" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null
  echo "버킷 만듦: $PHOTO_BUCKET"
fi
aws s3api put-public-access-block --bucket "$PHOTO_BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$PHOTO_BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-ownership-controls --bucket "$PHOTO_BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-tagging --bucket "$PHOTO_BUCKET" --tagging 'TagSet=[{Key=Project,Value=wolgyeham}]'
aws s3api put-bucket-lifecycle-configuration --bucket "$PHOTO_BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"abort-incomplete-uploads","Filter":{"Prefix":""},"Status":"Enabled","AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'

aws iam put-role-policy --role-name wolgyeham-ec2 --policy-name wolgyeham-app --policy-document "$(
  sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s/<OPS_BUCKET>/$OPS_BUCKET/g" -e "s/<PHOTO_BUCKET>/$PHOTO_BUCKET/g" \
    "$here/ec2-instance-policy.json"
)"
echo "EC2 역할 정책 갱신: wolgyeham-ec2 / wolgyeham-app"
echo "서버 설정: PHOTO_STORE=s3 PHOTO_BUCKET=$PHOTO_BUCKET PHOTO_PREFIX=dev/ (prod는 prod/)"
