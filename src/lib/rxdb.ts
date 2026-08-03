/**
 * Web RxDB for ramen posts; pull from server via replicateServer.
 */
import { createRxDatabase } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { postSchema, type PostDoc } from "./postSchema.js";

const DB_NAME = "ramen-web";

let _db: Awaited<ReturnType<typeof createRxDatabase<{ posts: import("rxdb").RxCollection<PostDoc> }>>> | null = null;

function getStorage() {
  const dexie = getRxStorageDexie();
  if (import.meta.env.DEV) {
    return wrappedValidateAjvStorage({ storage: dexie });
  }
  return dexie;
}

export async function getRxDatabase() {
  if (_db) return _db;
  _db = await createRxDatabase({
    name: DB_NAME,
    storage: getStorage(),
    closeDuplicates: import.meta.env.DEV,
  });
  await _db.addCollections({
    posts: { schema: postSchema },
  });
  return _db;
}

export async function getPostsCollection() {
  const db = await getRxDatabase();
  return db.posts;
}
