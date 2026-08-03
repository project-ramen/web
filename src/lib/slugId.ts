/**
 * Deterministic numeric id for slug (matches server docHelpers.slugToNumericId).
 * Used for API compatibility (post_id in comments, likes storage).
 */
export function slugToNumericId(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}
