import { useEffect, useRef, useState } from 'react';
import { getApiBase } from './apiBase';

type IndexedPost = { slug: string; title: string };

export interface ResolvedPostLink {
  href: string;
  title: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * 발행된 포스트/프로젝트의 (제목 | 슬러그) → { 블로그 내부 URL, 실제 제목 } 매핑을 만들어,
 * Obsidian 위키링크([[파일 이름|별칭]])의 대상이 실제 게시된 글이면 클릭 가능한 링크로,
 * 실제 제목은 hover 툴팁으로 보여줄 수 있게 해준다.
 * 매칭 안 되면 remarkWikilinks가 알아서 텍스트로만 표시한다.
 */
export function usePostLinkIndex() {
  const mapRef = useRef<Map<string, ResolvedPostLink>>(new Map());
  const [, forceRender] = useState(0);

  useEffect(() => {
    const base = getApiBase();
    if (!base) return;
    let cancelled = false;

    async function load() {
      try {
        // cache: 'no-store' — 브라우저/중간 캐시가 이전 published 상태를 들고 있으면
        // 방금 공개로 전환한 글의 위키링크가 안 걸리는 문제가 생길 수 있어 항상 최신 상태를 받는다.
        const [posts, projects] = await Promise.all([
          fetch(`${base}/api/posts`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${base}/api/posts/projects`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;

        const map = new Map<string, ResolvedPostLink>();
        for (const p of (posts as IndexedPost[]) ?? []) {
          const entry = { href: `/post/${p.slug}`, title: p.title || p.slug };
          map.set(normalize(p.slug), entry);
          if (p.title) map.set(normalize(p.title), entry);
        }
        for (const p of (projects as IndexedPost[]) ?? []) {
          const entry = { href: `/projects/${p.slug}`, title: p.title || p.slug };
          map.set(normalize(p.slug), entry);
          if (p.title) map.set(normalize(p.title), entry);
        }
        mapRef.current = map;
        forceRender((n) => n + 1); // remarkPlugins 배열을 다시 만들어 재렌더링되게 트리거
      } catch {
        // 실패해도 위키링크는 그냥 텍스트로 표시되므로 조용히 무시
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolveRef = useRef((target: string) => mapRef.current.get(normalize(target)));
  return { resolve: resolveRef.current };
}
