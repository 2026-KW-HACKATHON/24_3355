import { createHash } from "node:crypto";
import type { ContentTranslation, TranslationLang } from "@wolgyeham/contracts";
import { and, eq } from "drizzle-orm";
import { contentTranslations } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import type { GoogleAi } from "../../lib/google.ts";
import { hitRateLimit } from "../../lib/rate-limit.ts";
import * as guideService from "../guides/service.ts";
import * as noticeService from "../notices/service.ts";

/** 캐시에 없어 새로 번역하는 요청의 IP별 한도(시간당). 캐시에 있으면 세지 않습니다. */
export const TRANSLATION_IP_LIMIT = { limit: 60, windowSeconds: 60 * 60 };
/**
 * 서버 전체에서 하루에 새로 번역하는 글자 수(제목+본문). 비용 상한입니다(D-37). Cloud Translation은 글자 수로
 * 요금을 매기므로 요청 수가 아니라 글자 수로 셉니다. 10만 자면 최악에도 하루 약 2달러입니다.
 */
export const TRANSLATION_DAILY_LIMIT = { limit: 100_000, windowSeconds: 24 * 60 * 60 };

type Source = { kind: "guide" | "notice"; id: string; title: string; body: string };

function sourceHash(title: string, body: string) {
  return createHash("sha256").update(title).update("\u0000").update(body).digest("hex");
}

async function translate(
  db: Database,
  ai: GoogleAi,
  clientKey: string,
  source: Source,
  lang: TranslationLang,
): Promise<ContentTranslation> {
  if (!ai.translate) throw new AppError(404, "NOT_FOUND");
  const t = contentTranslations;
  const column = source.kind === "guide" ? t.guideId : t.noticeId;
  const hash = sourceHash(source.title, source.body);
  const [cached] = await db
    .select({ title: t.title, body: t.body, sourceHash: t.sourceHash })
    .from(t)
    .where(and(eq(column, source.id), eq(t.lang, lang)))
    .limit(1);
  if (cached && cached.sourceHash === hash) return { lang, title: cached.title, body: cached.body };

  // 하루 상한을 먼저 셉니다. 상한에 걸린 요청이 IP 한도를 깎지 않게 합니다.
  const chars = source.title.length + source.body.length;
  await hitRateLimit(db, "translation_daily", "all", TRANSLATION_DAILY_LIMIT, chars);
  await hitRateLimit(db, "translation", clientKey, TRANSLATION_IP_LIMIT);
  const [title = "", body = ""] = await ai.translate([source.title, source.body], lang);
  const values = { lang, sourceHash: hash, title, body };
  await db
    .insert(t)
    .values(
      source.kind === "guide"
        ? { ...values, guideId: source.id }
        : { ...values, noticeId: source.id },
    )
    .onConflictDoUpdate({
      target: [column, t.lang],
      set: { sourceHash: hash, title, body, updatedAt: new Date() },
    });
  return { lang, title, body };
}

/** 공개된 안내만(초안은 집주인에게도 404). 원문 규칙은 `GET /guides/:guideId`와 같습니다. */
export async function translateGuide(
  db: Database,
  ai: GoogleAi,
  clientKey: string,
  guideId: string,
  lang: TranslationLang,
) {
  if (!ai.translate) throw new AppError(404, "NOT_FOUND");
  const guide = await guideService.getGuide(db, null, guideId);
  return translate(db, ai, clientKey, { kind: "guide", ...guide }, lang);
}

/** 보이는 공지만. 올리기 전이면 404, 기간이 끝났으면 410 `NOTICE_ENDED`(`GET /notices/:noticeId`와 같음). */
export async function translateNotice(
  db: Database,
  ai: GoogleAi,
  clientKey: string,
  noticeId: string,
  lang: TranslationLang,
) {
  if (!ai.translate) throw new AppError(404, "NOT_FOUND");
  const notice = await noticeService.getNotice(db, noticeId);
  return translate(db, ai, clientKey, { kind: "notice", ...notice }, lang);
}
