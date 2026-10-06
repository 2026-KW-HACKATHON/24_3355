import type { RequestIdVariables } from "hono/request-id";
import type { Database } from "./db.ts";
import type { Env } from "./env.ts";
import type { PushSender } from "./push.ts";
import type { TaskRunner } from "./tasks.ts";

export type SessionUser = { id: string; sessionId: string };

/** 모든 라우터가 쓰는 Hono 환경. `db`·`env`·`push`·`tasks`는 createApp이, `user`는 세션 미들웨어가 넣습니다. */
export type AppEnv = {
  Variables: RequestIdVariables & {
    db: Database;
    env: Env;
    push: PushSender;
    tasks: TaskRunner;
    user: SessionUser | null;
  };
};
