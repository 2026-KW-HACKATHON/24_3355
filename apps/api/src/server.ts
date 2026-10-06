import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDatabase } from "./lib/db.ts";
import { parseEnv } from "./lib/env.ts";
import { log } from "./lib/log.ts";
import { createTaskRunner } from "./lib/tasks.ts";

const env = parseEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const tasks = createTaskRunner();

const server = serve(
  {
    fetch: createApp({ env, db: database.db, tasks }).fetch,
    hostname: env.API_HOST,
    port: env.API_PORT,
  },
  (info) => log("info", "api_started", { port: info.port, demoMode: env.DEMO_MODE }),
);

/** 새 요청을 받지 않고, 응답 뒤에 이어서 하던 일(공지 푸시)을 마친 뒤 DB를 닫습니다. */
function shutdown() {
  server.close((error) => {
    void tasks
      .idle()
      .then(() => database.close())
      .finally(() => {
        process.exitCode = error ? 1 : 0;
      });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
