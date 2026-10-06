-- 푸시 구독 주소 정리(보안 리뷰 1). 알려진 푸시 서비스의 엄격한 https 주소가 아닌 구독을 지웁니다.
-- contracts isAllowedPushEndpoint와 같은 규칙: https://<허용 호스트>/로 시작, 포트·계정 정보·공백·제어문자 없음.
DELETE FROM "push_subscriptions"
WHERE char_length("endpoint") > 2048
   OR "endpoint" !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(push\.apple\.com|notify\.windows\.com))/[^[:space:][:cntrl:]]*$';
