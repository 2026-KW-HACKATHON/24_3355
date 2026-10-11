import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * `E2E_RESET_DEMO=1 pnpm e2e`일 때만 끝나고 시연 건물 네 곳을 시드 상태로 되돌립니다(`--reset-demo`).
 * 쓰기 테스트가 테스트빌라에 안내·공지·제보를 남기고, 새 집주인 흐름은 준비빌라를 open으로 바꿔서 다시 돌리려면
 * 되돌려야 합니다. 되돌리면 햇살빌라·새봄하우스도 처음 상태가 되므로(다른 사람이 보던 시연 데이터 포함) 기본은 끕니다.
 */
export default function globalTeardown() {
  // e2e 계정(support/dev-db.ts `session`)으로 만든 세션은 끝나면 지웁니다.
  // 로컬 DB가 아니면 dev-db.ts가 멈추므로(원격 dev를 대상으로 돌릴 때) 실패해도 정리는 건너뜁니다.
  try {
    execFileSync(
      "node",
      ["--env-file-if-exists=apps/api/.env", "e2e/support/dev-db.ts", "clean-e2e-sessions"],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
  } catch {
    // 건너뜀
  }
  if (process.env["E2E_RESET_DEMO"] !== "1") return;
  execFileSync("pnpm", ["--filter", "@wolgyeham/api", "db:seed", "--", "--reset-demo"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}
