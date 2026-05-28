import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractStructuredFields, passesExtractionQuality } from "../src/intelligence/structured-extract.js";
import { buildItemFromCrawl } from "../src/intelligence/real-crawler.js";
import { createStore } from "../src/store.js";
import { runRealCrawl } from "../src/intelligence/real-crawler.js";

const SAMPLE_HTML = `<!DOCTYPE html><html><head><title>HKU Fees</title></head><body><main>
<h1>Tuition Fees</h1>
<p>Application deadline: 31 January 2026. Tuition HK$120,000 per year for MSc programmes.</p>
<table><tr><th>Programme</th><th>Fee</th></tr><tr><td>MSc CS</td><td>HK$150,000</td></tr></table>
</main></body></html>`;

describe("real crawl structured extract", () => {
  it("extracts tuition fees and deadlines from HTML text", () => {
    const text =
      "Application deadline: 31 January 2026. Tuition HK$120,000 per year for taught postgraduate programmes. " +
      "Additional fees may apply for international students. Please refer to the official fee schedule.";
    const structured = extractStructuredFields("tuition", text, ["MSc CS | HK$150,000"], {
      schoolId: "hku",
      url: "https://www.hku.hk/fees",
    });
    assert.ok(structured.fees?.length >= 1);
    assert.ok(passesExtractionQuality(text, structured));
  });

  it("buildItemFromCrawl produces auto_published official item", () => {
    const item = buildItemFromCrawl(
      { id: "hku-tuition", url: "https://www.hku.hk/fees", sourceId: "hku-official", schoolIds: ["hku"], infoType: "tuition" },
      { html: SAMPLE_HTML, finalUrl: "https://www.hku.hk/fees" }
    );
    assert.equal(item.sourceId, "hku-official");
    assert.equal(item.reviewStatus, "auto_published");
    assert.ok(item.structured?.fees?.length);
    assert.ok(item.contentHash);
    assert.ok(item.locale?.contentText?.length > 50);
  });

  it("runRealCrawl upserts with mock fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crawl-test-"));
    const dbPath = join(dir, "db.json");
    const store = createStore(dbPath);
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      url: "https://www.hku.hk/fees",
      text: async () => SAMPLE_HTML,
    });
    const result = await runRealCrawl(store, {
      fetchEnabled: true,
      maxFetch: 1,
      feeds: [
        {
          id: "hku-tuition",
          url: "https://www.hku.hk/fees",
          sourceId: "hku-official",
          schoolIds: ["hku"],
          infoType: "tuition",
        },
      ],
      fetchImpl: mockFetch,
    });
    assert.equal(result.fetchCount, 1);
    assert.ok(result.itemsIngested + result.itemsUpdated >= 1);
    const items = store.listIntelligenceItems({ publishedOnly: true, limit: 10 });
    assert.ok(items.some((i) => i.feedId === "hku-tuition"));
    rmSync(dir, { recursive: true, force: true });
  });
});
