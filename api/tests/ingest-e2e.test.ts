import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IngestResponse } from "../src/schemas/ingest.js";
import { extractArticle } from "../src/services/ingest-service.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

interface FixtureCase {
  id: number;
  file: string;
  url: string;
  label: string;
  noiseAbsent: string[];
  authorExpected?: string;
}

const FIXTURE_CASES: FixtureCase[] = [
  {
    id: 1,
    file: "ingest-e2e-1-techcrunch-wbd.html",
    url: "https://techcrunch.com/2026/02/28/warner-bros-netflix-paramount-acquisition-timeline-wbd/",
    label: "TechCrunch: WBD sale",
    noiseAbsent: ["Techcrunch event", "Boston, MA | June 9, 2026"],
  },
  {
    id: 2,
    file: "ingest-e2e-2-techcrunch-anthropic.html",
    url: "https://techcrunch.com/2026/02/28/the-trap-anthropic-built-for-itself/",
    label: "TechCrunch: Anthropic trap",
    noiseAbsent: ["Techcrunch event", "San Francisco, CA | October 13-15, 2026"],
  },
  {
    id: 3,
    file: "ingest-e2e-3-techcrunch-netflix.html",
    url: "https://techcrunch.com/2026/02/28/why-did-netflix-back-down-from-its-deal-to-acquire-warner-bros/",
    label: "TechCrunch: Netflix backs down",
    noiseAbsent: [
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
    file: "ingest-e2e-4-arstechnica-chatgpt.html",
    url: "https://arstechnica.com/health/2026/02/did-chatgpt-help-health-officials-solve-a-weird-outbreak-maybe/",
    label: "Ars Technica: ChatGPT outbreak",
    noiseAbsent: [],
    authorExpected: "Beth Mole",
  },
];

describe("ingest E2E (fixture-based snapshot)", () => {
  for (const fixture of FIXTURE_CASES) {
    describe(`Article #${fixture.id}: ${fixture.label}`, () => {
      let result: IngestResponse | null;

      beforeAll(async () => {
        const html = readFileSync(resolve(FIXTURES_DIR, fixture.file), "utf-8");
        const fetcher = vi.fn().mockResolvedValue(html);
        result = await extractArticle(fixture.url, fetcher);
      });

      it("should match snapshot", () => {
        expect(result).toMatchSnapshot();
      });

      if (fixture.noiseAbsent.length > 0) {
        it("should not contain known noise patterns", () => {
          for (const noise of fixture.noiseAbsent) {
            expect(result?.body).not.toContain(noise);
          }
        });
      }

      if (fixture.authorExpected) {
        it("should have trimmed author field", () => {
          expect(result?.author).toBe(fixture.authorExpected);
        });
      }
    });
  }
});
