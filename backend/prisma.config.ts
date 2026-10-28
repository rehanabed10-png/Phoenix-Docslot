import dotenv from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --import jiti/register prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});