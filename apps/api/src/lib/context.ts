import type { RequestIdVariables } from "hono/request-id";
import type { Database } from "./db.ts";
import type { Env } from "./env.ts";
import type { PhotoStore } from "./photoStore.ts";
import type { PushSender } from "./push.ts";
import type { TaskRunner } from "./tasks.ts";

export type SessionUser = { id: string; sessionId: string };

/**
 * 모든 라우터가 쓰는 Hono 환경. `db`·`env`·`push`·`tasks`·`photos`는 createApp이, `user`는 세션 미들웨어가 넣습니다.
 * `photos`가 null이면 사진을 받지 않는 환경입니다(PHOTO_STORE=off, production 기본).
 */
export type AppEnv = {
  Variables: RequestIdVariables & {
    db: Database;
    env: Env;
    push: PushSender;
    tasks: TaskRunner;
    photos: PhotoStore | null;
    user: SessionUser | null;
  };
};
