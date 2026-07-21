/**
 * @param {object | null | undefined} item
 */
export function mapIntelligenceItemForClient(item) {
  if (!item) return null;
  return {
    item_id: item.id,
    source_id: item.sourceId,
    review_status: item.reviewStatus,
    title_zh: item.locale?.titleZh || "",
    summary_zh: item.locale?.summaryZh || "",
    title_original: item.locale?.titleOriginal || "",
    snippet_original: item.locale?.snippetOriginal || "",
    canonical_url: item.canonicalUrl,
    published_at: item.publishedAt,
    school_ids: item.schoolIds || [],
    info_type: item.infoType,
    product_curated: Boolean(item.productCurated),
    feed_id: item.feedId || null,
    content_hash: item.contentHash || null,
    structured: item.structured || null,
    content_text: item.locale?.contentText ? item.locale.contentText.slice(0, 2000) : null,
    last_snapshot_id: item.lastSnapshotId || null,
  };
}
