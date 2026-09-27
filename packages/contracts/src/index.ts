import { z } from "zod";

export const HealthResponse = z
  .object({
    status: z.literal("ok"),
    service: z.literal("wolgyeham-api"),
  })
  .readonly();

export type Health = z.infer<typeof HealthResponse>;
