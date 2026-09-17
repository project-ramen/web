import { getThumbmark } from '@thumbmarkjs/thumbmarkjs';

const STORAGE_KEY = 'ramen_fp_v1';
const CACHE_MS = 24 * 60 * 60 * 1000; // 하루 지나면 재계산(기기 특성 드리프트 반영)

/**
 * 방문자 지문 해시. thumbmarkjs를 옵션(api_key/simple_request) 없이 호출하므로
 * 외부 서버 통신 없이 브라우저 로컬에서만 계산됨.
 */
export async function getVisitorFingerprint(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const { value, at } = JSON.parse(cached) as { value: string; at: number };
      if (value && Date.now() - at < CACHE_MS) return value;
    }
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 그냥 재계산
  }

  const { thumbmark } = await getThumbmark();
  if (!thumbmark) return null;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ value: thumbmark, at: Date.now() }));
  } catch {
    // 저장 실패해도 지문 자체는 반환
  }
  return thumbmark;
}
