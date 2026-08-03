/**
 * API/WS base URL. Same-origin when PUBLIC_* is unset (e.g. blog.foxstar.app).
 */
export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const env = (import.meta.env.PUBLIC_API_URL as string)?.trim().replace(/\/+$/, "") || "";
  return env || window.location.origin;
}

