import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema/articles.ts",
    "./src/db/schema/sources.ts",
    "./src/db/schema/digests.ts",
  ],
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://news:CHANGEME@localhost:5432/news_curator",
  },
});
