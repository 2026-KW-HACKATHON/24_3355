import { z } from "zod";

export * from "./auth.ts";
export * from "./buildings.ts";
export * from "./correction-memos.ts";
export * from "./demo.ts";
export * from "./errors.ts";
export * from "./guides.ts";
export * from "./notices.ts";
export * from "./occupancies.ts";
export * from "./reports.ts";
export * from "./text.ts";
export * from "./tips.ts";

export const HealthResponse = z
  .object({
    status: z.literal("ok"),
    service: z.literal("wolgyeham-api"),
  })
  .readonly();

export type Health = z.infer<typeof HealthResponse>;
