import { DemoOverview, DemoResetBody, DemoResetResult } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { ipKey } from "../../lib/client.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as demoService from "./service.ts";

/**
 * 시연 시작(LF-20, 29). 시연 모드(DEMO_MODE=true)에서만 app.ts가 붙입니다. 꺼져 있으면 경로가 없어 404입니다.
 * 로그인 없이 부를 수 있습니다. 읽는 것은 시연 건물과 시연 계정 자신의 관계(관리하는 건물, 연결, 쓴 팁·메모 수,
 * 관리하는 건물의 확인할 것)뿐이고, 바꾸는 것은 발표 시연 건물 두 곳과 시연 계정의 시드 상태뿐입니다(D-29).
 */
export const demoRoutes = new Hono<AppEnv>()
  .get(
    "/dev/demo",
    describeRoute({
      tags: ["dev"],
      summary: "시연 건물과 역할 전환 계정 (DEMO_MODE 전용, 29). 결과를 5초 동안 함께 씀",
      responses: { 200: jsonResponse("시연 건물·계정", DemoOverview) },
    }),
    async (c) => c.json(await demoService.getOverview(c.var.db), 200),
  )
  .post(
    "/dev/reset",
    describeRoute({
      tags: ["dev"],
      summary:
        "발표 시연 건물 두 곳(햇살빌라·새봄하우스)만 처음 상태로 (DEMO_MODE 전용). 같은 사람 30초에 1번·시간당 10번, 모든 사람 합쳐 30초에 1번·시간당 20번",
      responses: {
        200: jsonResponse("건물마다 지우고 다시 만든 행 수", DemoResetResult),
        ...errorResponses(400, 403, 429),
      },
    }),
    validator("json", DemoResetBody, onInvalid),
    async (c) => {
      const result = await demoService.reset(c.var.db, c.req.valid("json"), {
        reconfirmIntervalDays: c.var.env.RECONFIRM_INTERVAL_DAYS,
        // 로그인해도 IP 키로 셉니다(시연 계정을 바꿔 가며 한도를 늘리지 못하게).
        clientKey: ipKey(c),
      });
      return c.json(result, 200);
    },
  );
