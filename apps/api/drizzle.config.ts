import { defineConfig } from "drizzle-kit";

// db:generate는 DB에 접속하지 않습니다. 마이그레이션 적용은 src/db/migrate.ts가 합니다.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
