// e2e 전용 개발 DB 준비(D-35 시연 분리 테스트). 운영 API에는 이런 경로를 두지 않으므로 e2e가 개발 DB에 직접
// 씁니다(`pnpm db:invite`처럼 apps/api/.env의 DATABASE_URL). 출력에는 테스트가 쓸 값만 한 줄로 냅니다.
// 사용: node --env-file-if-exists=apps/api/.env e2e/support/dev-db.ts <명령> [인자]
//   building                  시연 건물이 아닌 ‘실제 건물’(전시 건물처럼 관리자 없이 열림, 가입코드만)을 두고 가입코드 출력
//   real-account <약관 판> <토큰 파일> [with-push]
//                             카카오 계정처럼 보이는(시연 계정이 아닌) 사용자와 세션(1시간)을 만들고, with-push면 알림
//                             구독도 하나 만듭니다. 세션 토큰은 출력하지 않고 <토큰 파일>(0600)에만 씁니다. DB에는 해시만
//                             둡니다(서버와 같음). 출력은 `알림주소(없으면 -) 사용자id`.
// 실제빌라는 테스트끼리 다시 쓰려고 지우지 않고 남겨 둡니다(관리자·안내 없음, 가입코드만). 로컬 DB(127.0.0.1·localhost·::1)
// 가 아니면 아무것도 하지 않고 멈춥니다.
//   session <e2e-계정> <약관 판> <토큰 파일>
//                             쓰기 테스트용 거주자 계정(`e2e-`로 시작하는 kakao_user_id, 시연 계정이 아님)을 두고 세션(2시간)을
//                             만들어 토큰을 <토큰 파일>(0600)에만 씁니다. 발표 시연 계정은 둘러보기 전용이라(D-35) 테스트빌라의
//                             거주자 쓰기는 이 계정으로 합니다. 출력은 사용자 id.
//   clean-e2e-sessions        e2e 계정들의 세션을 지움(전체 뒷정리)
//   push-count <알림 주소>    그 주소의 알림 구독 행 수
//   clean-real-account        real-account가 만든 세션·알림 구독을 지움(테스트 뒷정리)
//   clean-real-reports        실제빌라에 테스트로 보낸 제보와 반복 제한 기록을 지움(다시 돌려도 한도에 걸리지 않게)
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createDatabase } from "../../apps/api/src/lib/db.ts";

const REAL_BUILDING_ID = "7e2e0000-0000-4000-8000-00000000e2e1";
const REAL_BUILDING_NAME = "실제빌라";
/** 가입코드 글자(apps/api의 JOIN_CODE_ALPHABET)만 씁니다. */
const REAL_JOIN_CODE = "R3ALE2";
const REAL_KAKAO_ID = "e2e-real-account";

/** postgres.js 클라이언트에서 여기서 쓰는 부분만(e2e에는 postgres 타입 의존성이 없음). */
type Sql = {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  begin(run: (tx: Sql) => Promise<unknown>): Promise<unknown>;
};

async function building(sql: Sql) {
  await sql`
    insert into buildings (id, name, display_address, full_address, status, opened_at)
    values (${REAL_BUILDING_ID}, ${REAL_BUILDING_NAME}, '서울 노원구 광운로', '서울 노원구 광운로 0 (e2e)', 'open', now())
    on conflict (id) do nothing`;
  const current = await sql<{ code: string }[]>`
    select code from join_codes where building_id = ${REAL_BUILDING_ID} and retired_at is null limit 1`;
  if (current[0]?.code !== REAL_JOIN_CODE) {
    await sql.begin(async (tx) => {
      await tx`update join_codes set retired_at = now() where building_id = ${REAL_BUILDING_ID} and retired_at is null`;
      await tx`insert into join_codes (building_id, code) values (${REAL_BUILDING_ID}, ${REAL_JOIN_CODE})`;
    });
  }
  return REAL_JOIN_CODE;
}

async function realAccount(sql: Sql, termsVersion: string, tokenFile: string, withPush: boolean) {
  if (!tokenFile) throw new Error("토큰 파일 경로가 필요해요");
  const [user] = await sql<{ id: string }[]>`
    insert into users (kakao_user_id, terms_version, terms_agreed_at)
    values (${REAL_KAKAO_ID}, ${termsVersion}, now())
    on conflict (kakao_user_id) do update set terms_version = excluded.terms_version, updated_at = now()
    returning id`;
  if (!user) throw new Error("사용자를 만들지 못했어요");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, now() + interval '1 hour')`;
  writeFileSync(tokenFile, token, { mode: 0o600 });
  if (!withPush) return `- ${user.id}`;
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`;
  await sql`
    insert into push_subscriptions (user_id, endpoint, p256dh, auth)
    values (${user.id}, ${endpoint}, 'e2e-p256dh', 'e2e-auth')`;
  return `${endpoint} ${user.id}`;
}

async function session(sql: Sql, kakaoId: string, termsVersion: string, tokenFile: string) {
  if (!/^e2e-[a-z0-9-]+$/.test(kakaoId)) throw new Error("e2e 계정 이름은 e2e-로 시작해요");
  if (!tokenFile) throw new Error("토큰 파일 경로가 필요해요");
  const [user] = await sql<{ id: string }[]>`
    insert into users (kakao_user_id, terms_version, terms_agreed_at)
    values (${kakaoId}, ${termsVersion}, now())
    on conflict (kakao_user_id) do update set terms_version = excluded.terms_version, updated_at = now()
    returning id`;
  if (!user) throw new Error("사용자를 만들지 못했어요");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, now() + interval '2 hours')`;
  writeFileSync(tokenFile, token, { mode: 0o600 });
  return user.id;
}

async function cleanE2eSessions(sql: Sql) {
  await sql`delete from sessions where user_id in (select id from users where kakao_user_id like 'e2e-%')`;
  return "ok";
}

async function pushCount(sql: Sql, endpoint: string) {
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from push_subscriptions where endpoint = ${endpoint}`;
  return rows[0]?.count ?? "0";
}

async function cleanRealAccount(sql: Sql) {
  await sql`delete from push_subscriptions where user_id in (select id from users where kakao_user_id = ${REAL_KAKAO_ID})`;
  await sql`delete from sessions where user_id in (select id from users where kakao_user_id = ${REAL_KAKAO_ID})`;
  return "ok";
}

async function cleanRealReports(sql: Sql) {
  await sql`delete from report_submissions where building_id = ${REAL_BUILDING_ID}`;
  await sql`delete from reports where building_id = ${REAL_BUILDING_ID}`;
  return "ok";
}

if (import.meta.main) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL이 없어요(apps/api/.env)");
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("e2e 준비는 로컬 DB에서만 해요(DATABASE_URL이 127.0.0.1·localhost·::1이 아님)");
  }
  const [command, arg = "", arg2 = "", arg3 = ""] = process.argv.slice(2);
  const database = createDatabase(url, { max: 1 });
  // apps/api의 postgres 클라이언트를 그대로 씁니다(e2e 쪽에는 drizzle-orm 의존성이 없음).
  const sql = (database.db as unknown as { $client: Sql }).$client;
  try {
    if (command === "building") console.info(await building(sql));
    else if (command === "real-account") {
      console.info(await realAccount(sql, arg, arg2, arg3 === "with-push"));
    } else if (command === "push-count") console.info(await pushCount(sql, arg));
    else if (command === "session") console.info(await session(sql, arg, arg2, arg3));
    else if (command === "clean-e2e-sessions") console.info(await cleanE2eSessions(sql));
    else if (command === "clean-real-account") console.info(await cleanRealAccount(sql));
    else if (command === "clean-real-reports") console.info(await cleanRealReports(sql));
    else throw new Error(`모르는 명령: ${command}`);
  } finally {
    await database.close();
  }
}
