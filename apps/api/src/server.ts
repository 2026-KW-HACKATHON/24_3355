import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDatabase } from "./lib/db.ts";
import { parseEnv } from "./lib/env.ts";
import { log } from "./lib/log.ts";

const env = parseEnv(process.env);
const database = createDatabase(env.DATABASE_URL);

const server = serve(
  { fetch: createApp({ env, db: database.db }).fetch, hostname: env.API_HOST, port: env.API_PORT },
  (info) => log("info", "api_started", { port: info.port, demoMode: env.DEMO_MODE }),
);

function shutdown() {
  server.close((error) => {
    void database.close().finally(() => {
      process.exitCode = error ? 1 : 0;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
