import { HealthResponse } from "@wolgyeham/contracts";
import ky from "ky";

export async function checkApi() {
  const response = await ky.get("/api/health", { timeout: 5000, retry: 0 }).json<unknown>();
  return HealthResponse.parse(response);
}
