import { serve } from "@hono/node-server";
import { z } from "zod";
import { createApp } from "./app.ts";

const env = z
  .object({
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .parse(process.env);

const server = serve(
  { fetch: createApp().fetch, hostname: env.API_HOST, port: env.API_PORT },
  (info) => console.info(JSON.stringify({ level: "info", event: "api_started", port: info.port })),
);

function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
