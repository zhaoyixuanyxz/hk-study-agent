import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isDemoSeedUrl,
  resolveCuratedCanonicalUrl,
  normalizeCuratedSeedRow,
} from "../src/intelligence/curated-urls.js";

describe("curated-urls", () => {
  it("detects demo seed host", () => {
    assert.equal(isDemoSeedUrl("https://seed.study-agent.local/hku/tuition/2026"), true);
    assert.equal(isDemoSeedUrl("https://www.hku.hk/fees"), false);
  });

  it("resolves HKU tuition to official site path", () => {
    const url = resolveCuratedCanonicalUrl({ schoolIds: ["hku"], infoType: "tuition" });
    assert.equal(url, "https://www.hku.hk/fees");
  });

  it("normalizeCuratedSeedRow replaces demo URL", () => {
    const row = normalizeCuratedSeedRow({
      schoolIds: ["cuhk"],
      infoType: "admission",
      canonicalUrl: "https://seed.study-agent.local/cuhk/admission/2026",
    });
    assert.equal(row.canonicalUrl, "https://www.cuhk.edu.hk/admissions");
  });
});
