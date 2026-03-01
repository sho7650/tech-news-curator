/**
 * Phase 2 ノイズ除去の実データ検証スクリプト
 * Usage: npx tsx scripts/verify-phase2.ts
 */
import { extractArticle } from "../src/services/ingest-service.js";

const TEST_URLS = [
  {
    id: 1,
    label: "TechCrunch: WBD sale (イベントプロモ検証)",
    url: "https://techcrunch.com/2026/02/28/warner-bros-netflix-paramount-acquisition-timeline-wbd/",
    checkNoise: ["Techcrunch event", "Boston, MA | June 9, 2026"],
  },
  {
    id: 2,
    label: "TechCrunch: Anthropic trap (イベントプロモ検証)",
    url: "https://techcrunch.com/2026/02/28/the-trap-anthropic-built-for-itself/",
    checkNoise: ["Techcrunch event", "San Francisco, CA | October 13-15, 2026"],
  },
  {
    id: 3,
    label: "TechCrunch: Netflix WBD (メタデータ+ナビ残骸検証)",
    url: "https://techcrunch.com/2026/02/28/why-did-netflix-back-down-from-its-deal-to-acquire-warner-bros/",
    checkNoise: [
      "In Brief",
      "Posted:",
      "2:07 PM PST",
      "### Newsletters",
      "Subscribe for the industry",
      "## Related",
      "## Latest in Media",
    ],
  },
  {
    id: 4,
    label: "Ars Technica: ChatGPT outbreak (author trim 検証)",
    url: "https://arstechnica.com/health/2026/02/did-chatgpt-help-health-officials-solve-a-weird-outbreak-maybe/",
    checkNoise: [],
    checkAuthorTrim: true,
  },
];

async function main() {
  for (const test of TEST_URLS) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Article #${test.id}: ${test.label}`);
    console.log(`URL: ${test.url}`);
    console.log("=".repeat(70));

    try {
      const result = await extractArticle(test.url);
      if (!result) {
        console.log("  ❌ extractArticle returned null");
        continue;
      }

      // Author trim check
      if (test.checkAuthorTrim) {
        const authorRaw = result.author;
        const hasTrimIssue = authorRaw !== authorRaw?.trim();
        console.log(`\n  [Author] "${result.author}"`);
        console.log(
          `  ${hasTrimIssue ? "❌ Still has whitespace" : "✅ Properly trimmed"}`,
        );
      } else {
        console.log(`\n  [Author] ${result.author}`);
      }

      // Noise check
      if (test.checkNoise.length > 0) {
        console.log("\n  [Noise Check]");
        for (const noise of test.checkNoise) {
          const found = result.body?.includes(noise);
          console.log(`  ${found ? "❌ FOUND" : "✅ REMOVED"}: "${noise}"`);
        }
      }

      // Body preview (first 500 chars + last 300 chars)
      if (result.body) {
        console.log(`\n  [Body length] ${result.body.length} chars`);
        console.log("\n  [Body - first 500 chars]");
        console.log(
          result.body
            .slice(0, 500)
            .split("\n")
            .map((l) => `  │ ${l}`)
            .join("\n"),
        );
        console.log("\n  [Body - last 300 chars]");
        console.log(
          result.body
            .slice(-300)
            .split("\n")
            .map((l) => `  │ ${l}`)
            .join("\n"),
        );
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Done.");
}

main();
