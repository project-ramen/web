/**
 * RxDB post schema (must match server schema version 0).
 */
import type { RxJsonSchema } from "rxdb";

export const postSchema: RxJsonSchema<{
  id: string;
  type: "post";
  slug: string;
  title: string;
  body_md: string;
  published: number;
  tags: string;
  category: string;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 512 },
    type: { type: "string", enum: ["post"] },
    slug: { type: "string", maxLength: 512 },
    title: { type: "string" },
    body_md: { type: "string" },
    published: { type: "number" },
    tags: { type: "string" },
    category: { type: "string" },
    deleted_at: { type: ["string", "null"] },
    created_at: { type: "string" },
    updated_at: { type: "string" },
  },
  required: ["id", "type", "slug", "title", "body_md", "published", "tags", "category", "created_at", "updated_at"],
};

export type PostDoc = {
  id: string;
  type: "post";
  slug: string;
  title: string;
  body_md: string;
  published: number;
  tags: string;
  category: string;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};
