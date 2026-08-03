/**
 * Pull-only sync: POST /api/sync/posts (checkpoint 기반)
 * 구 rxdb-server (GET /ramen/0) 방식에서 새 REST API로 교체.
 */
import { getApiBase } from "./apiBase.js";
import { getPostsCollection } from "./rxdb.js";

const CHECKPOINT_KEY = "ramen-web-sync-checkpoint";

interface SyncDoc {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  published: number;
  tags: string | unknown[];
  category: string | unknown[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function startRxReplication(): Promise<void> {
  const base = getApiBase();
  if (!base) return;

  const checkpoint = localStorage.getItem(CHECKPOINT_KEY) ?? null;
  const res = await fetch(`${base}/api/sync/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkpoint, documents: [] }),
  });

  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  const { checkpoint: newCheckpoint, documents } = await res.json() as {
    checkpoint: string;
    documents: SyncDoc[];
  };

  const col = await getPostsCollection();
  for (const doc of documents) {
    const tags = Array.isArray(doc.tags)
      ? JSON.stringify(doc.tags)
      : String(doc.tags ?? "[]");
    const category = Array.isArray(doc.category)
      ? JSON.stringify(doc.category)
      : String(doc.category ?? "[]");
    try {
      await col.upsert({
        id: doc.id,
        type: "post" as const,
        slug: doc.slug,
        title: doc.title,
        body_md: doc.body_md ?? "",
        published: doc.published,
        tags,
        category,
        deleted_at: doc.deleted_at ?? null,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      });
    } catch {
      // 개별 문서 upsert 실패 무시 (스키마 불일치 등)
    }
  }

  localStorage.setItem(CHECKPOINT_KEY, newCheckpoint);
}
