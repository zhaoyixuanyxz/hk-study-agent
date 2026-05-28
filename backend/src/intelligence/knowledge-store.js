import { randomBytes } from "node:crypto";
import { loadSourcesRegistry } from "./source-registry.js";
import { isIntelligenceItemPublished, normalizeIntelligenceItem } from "./normalization-service.js";

function cryptoRandomId() {
  return randomBytes(16).toString("hex");
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 */
export function createKnowledgeStore(store) {
  return {
    /**
     * 将静态 sources.json 同步到 db.intelligenceSources（按 id upsert）。
     */
    syncSourcesFromRegistry() {
      const { sources } = loadSourcesRegistry();
      return store.syncIntelligenceSources(sources);
    },

    /**
     * @param {object} raw
     * @param {{ forceId?: string }} [opts]
     */
    upsertItem(raw, opts = {}) {
      const normalized = normalizeIntelligenceItem(raw, { id: opts.forceId });
      return store.upsertIntelligenceItem(normalized);
    },

    /**
     * @param {string} itemId
     */
    getItem(itemId) {
      return store.getIntelligenceItem(itemId);
    },

    /**
     * 仅返回对用户可见的条目。
     * @param {{ schoolId?: string, limit?: number }} [filter]
     */
    listPublishedItems(filter = {}) {
      return store.listIntelligenceItems({
        publishedOnly: true,
        schoolId: filter.schoolId,
        limit: filter.limit ?? 100,
      });
    },

    /**
     * @param {object} run
     */
    appendCollectionRun(run) {
      return store.appendIntelligenceCollectionRun(run);
    },
  };
}

export { isIntelligenceItemPublished, normalizeIntelligenceItem };
