import { z } from "zod";

export * from "./auth.ts";
export * from "./buildings.ts";
export * from "./errors.ts";
export * from "./guides.ts";
export * from "./notices.ts";

export const HealthResponse = z
  .object({
    status: z.literal("ok"),
    service: z.literal("wolgyeham-api"),
  })
  .readonly();

export type Health = z.infer<typeof HealthResponse>;
