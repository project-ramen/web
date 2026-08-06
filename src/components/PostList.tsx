import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiChevronDown, FiChevronRight, FiMessageCircle, FiPlus, FiSearch, FiSliders } from 'react-icons/fi';
import { slugToNumericId } from '../lib/slugId.js';

import { getApiBase } from '../lib/apiBase';

type Post = { id: number; slug: string; title: string; published: number; created_at: string; updated_at: string; comment_count: number; tags?: string[]; category?: string[] };

function parseTags(tags: string | undefined): string[] {
  if (!tags) return [];
  try {
    const t = JSON.parse(tags);
    return Array.isArray(t) ? t.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseCategory(category: string | undefined): string[] {
  if (!category) return [];
  try {
    const c = JSON.parse(category);
    return Array.isArray(c) ? c.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type ApiPost = {
  slug: string;
  title: string;
  published: number;
  tags: string | string[];
  category: string | string[];
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  comment_count?: number;
};

function apiPostToPost(p: ApiPost): Post {
  return {
    id: slugToNumericId(p.slug),
    slug: p.slug,
    title: p.title,
    published: p.published,
    created_at: p.created_at,
    updated_at: p.updated_at,
    comment_count: p.comment_count ?? 0,
    tags: parseTags(Array.isArray(p.tags) ? JSON.stringify(p.tags) : p.tags),
    category: parseCategory(Array.isArray(p.category) ? JSON.stringify(p.category) : p.category),
  };
}

/** post.category가 prefix로 시작하는지 (prefix가 비어 있으면 항상 true) */
function postMatchesCategory(post: Post, prefix: string[]): boolean {
  if (prefix.length === 0) return true;
  const cat = post.category ?? [];
  if (cat.length < prefix.length) return false;
  return prefix.every((s, i) => cat[i] === s);
}

function postMatchesSearch(post: Post, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const inTitle = (post.title ?? '').toLowerCase().includes(lower);
  const inSlug = (post.slug ?? '').toLowerCase().includes(lower);
  const inTags = (post.tags ?? []).some((t) => t.toLowerCase().includes(lower));
  const inCategory = (post.category ?? []).some((c) => c.toLowerCase().includes(lower));
  return inTitle || inSlug || inTags || inCategory;
}

/** slug를 URL 경로에 쓸 수 있게 정규화 (점이 있으면 확장자로 오인돼 404 방지) */
function slugForUrl(slug: string): string {
  if (!slug) return slug;
  return slug.replace(/\./g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || slug;
}

/** ISO 날짜 문자열을 YYYY-MM-DD로 표시 */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace(/\.$/, '');
  } catch {
    return iso;
  }
}

type CategoryNode = { name: string; path: string[]; children: CategoryNode[] };

function buildCategoryTree(posts: Post[]): CategoryNode[] {
  const root: CategoryNode[] = [];
  posts.forEach((p) => {
    const cat = p.category ?? [];
    let level = root;
    let pathAcc: string[] = [];
    cat.forEach((segment) => {
      pathAcc = [...pathAcc, segment];
      let node = level.find((n) => n.name === segment);
      if (!node) {
        node = { name: segment, path: pathAcc, children: [] };
        level.push(node);
      }
      level = node.children;
    });
  });
  const sortTree = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(root);
  return root;
}

function CategoryTreeList({
  nodes,
  depth,
  expanded,
  activeFilter,
  onToggle,
  onSelect,
}: {
  nodes: CategoryNode[];
  depth: number;
  expanded: Set<string>;
  activeFilter: string[];
  onToggle: (key: string) => void;
  onSelect: (path: string[]) => void;
}) {
  return (
    <ul className="list-none m-0 p-0">
      {nodes.map((node) => {
        const key = node.path.join('\0');
        const isOpen = expanded.has(key);
        const hasChildren = node.children.length > 0;
        const isActive = activeFilter.length === node.path.length && activeFilter.every((s, i) => node.path[i] === s);
        return (
          <li key={key}>
            <div className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(key)}
                  className="shrink-0 w-4 h-4 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer text-neutral-400 dark:text-neutral-500"
                  aria-label={isOpen ? '하위 카테고리 접기' : '하위 카테고리 펼치기'}
                >
                  <FiChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
                </button>
              ) : (
                <span className="shrink-0 w-4 h-4" />
              )}
              <button
                type="button"
                onClick={() => onSelect(node.path)}
                className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                  isActive
                    ? 'font-semibold text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-700'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                {node.name}
              </button>
            </div>
            {hasChildren && isOpen && (
              <CategoryTreeList nodes={node.children} depth={depth + 1} expanded={expanded} activeFilter={activeFilter} onToggle={onToggle} onSelect={onSelect} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [expandedCategoryPaths, setExpandedCategoryPaths] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!getApiBase()) {
      setLoading(false);
      return;
    }
    fetch(`${getApiBase()}/api/posts`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((rows: ApiPost[]) => {
        if (cancelled) return;
        const list = rows
          .filter((p) => !p.deleted_at && p.published)
          .map(apiPostToPost);
        setPosts(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const postsWithCounts = posts;

  const categoryTree = useMemo(() => buildCategoryTree(postsWithCounts), [postsWithCounts]);

  const recentCategories = useMemo(() => {
    const sorted = [...postsWithCounts]
      .filter((p) => (p.category?.length ?? 0) > 0)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const p of sorted) {
      const key = (p.category ?? []).join('\0');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(p.category ?? []);
      if (result.length >= 3) break;
    }
    return result;
  }, [postsWithCounts]);

  const toggleExpandedCategoryPath = (key: string) => {
    setExpandedCategoryPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!categoryPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (categoryPanelRef.current && !categoryPanelRef.current.contains(e.target as Node)) {
        setCategoryPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [categoryPanelOpen]);

  const filteredPosts = useMemo(() => {
    const filtered = postsWithCounts.filter(
      (p) => postMatchesCategory(p, categoryFilter) && postMatchesSearch(p, searchQuery)
    );
    const order = sortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const tA = new Date(a[sortBy] as string).getTime();
      const tB = new Date(b[sortBy] as string).getTime();
      return order === 1 ? tA - tB : tB - tA;
    });
  }, [postsWithCounts, categoryFilter, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const newPostButton = (
    <a
      href="/post/new"
      className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 hover:opacity-90 transition-opacity no-underline"
    >
      <FiPlus className="w-4 h-4" aria-hidden />
      새 포스트
    </a>
  );

  if (loading)
    return (
      <>
        <div className="mb-4">{newPostButton}</div>
        <p className="text-neutral-600 dark:text-neutral-400">로딩 중…</p>
      </>
    );
  if (error)
    return (
      <>
        <div className="mb-4">{newPostButton}</div>
        <p className="text-neutral-600 dark:text-neutral-400">목록을 불러올 수 없습니다. ({error}) 서버가 실행 중인지 확인하세요.</p>
      </>
    );
  if (posts.length === 0)
    return (
      <>
        <div className="mb-4">{newPostButton}</div>
        <p className="text-neutral-600 dark:text-neutral-400">등록된 포스트가 없습니다.</p>
      </>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {newPostButton}
        <div
          className="flex items-center overflow-hidden rounded-full bg-neutral-50 dark:bg-neutral-800 transition-[width] duration-300 ease-out"
          style={{ width: searchOpen ? 200 : 32 }}
        >
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            className="shrink-0 w-8 h-8 flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors"
            aria-label={searchOpen ? '검색 닫기' : '검색'}
          >
            <FiSearch className="w-4 h-4" aria-hidden />
          </button>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 태그, 카테고리…"
            className="shrink min-w-0 w-[168px] h-8 pr-3 bg-transparent border-none text-neutral-900 dark:text-neutral-100 text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none"
            aria-label="포스트 검색"
          />
        </div>
        {categoryTree.length > 0 && (
          <div className="relative" ref={categoryPanelRef}>
            <button
              type="button"
              onClick={() => setCategoryPanelOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                categoryFilter.length > 0
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              aria-expanded={categoryPanelOpen}
              aria-label="카테고리 필터"
            >
              카테고리{categoryFilter.length > 0 ? `: ${categoryFilter.join(' › ')}` : ''}
              <FiChevronDown className={`w-4 h-4 shrink-0 transition-transform ${categoryPanelOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {categoryPanelOpen && (
              <div className="absolute left-0 z-10 mt-1 min-w-[220px] max-h-72 overflow-y-auto p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter([]);
                    setCategoryPanelOpen(false);
                  }}
                  className={`block w-full text-left px-2 py-1 mb-1 rounded text-sm ${
                    categoryFilter.length === 0
                      ? 'font-semibold text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-700'
                      : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  전체
                </button>
                <CategoryTreeList
                  nodes={categoryTree}
                  depth={0}
                  expanded={expandedCategoryPaths}
                  activeFilter={categoryFilter}
                  onToggle={toggleExpandedCategoryPath}
                  onSelect={(path) => {
                    const isSame =
                      categoryFilter.length === path.length && categoryFilter.every((s, i) => path[i] === s);
                    setCategoryFilter(isSame ? [] : path);
                    setCategoryPanelOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        )}
        {recentCategories.length > 0 && (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">최근:</span>
            {recentCategories.map((path) => {
              const label = path.join(' › ');
              const isActive = categoryFilter.length === path.length && categoryFilter.every((s, i) => path[i] === s);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCategoryFilter(isActive ? [] : path)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <FiSliders className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
            aria-label="정렬 기준"
          >
            <option value="created_at">작성일</option>
            <option value="updated_at">수정일</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            title={sortOrder === 'desc' ? '최신순 (클릭 시 오래된순)' : '오래된순 (클릭 시 최신순)'}
            aria-label={sortOrder === 'desc' ? '최신순, 클릭하면 오래된순으로 변경' : '오래된순, 클릭하면 최신순으로 변경'}
          >
            {sortOrder === 'desc' ? <FiArrowDown className="w-4 h-4" aria-hidden /> : <FiArrowUp className="w-4 h-4" aria-hidden />}
          </button>
        </span>
      </div>
      {filteredPosts.length === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          {searchQuery.trim()
            ? '검색 결과가 없습니다.'
            : categoryFilter.length > 0
              ? `해당 카테고리(${categoryFilter.join(' › ')})에 포스트가 없습니다.`
              : '등록된 포스트가 없습니다.'}
        </p>
      ) : (
        <ul className="list-none p-0 [&_li]:py-2">
          {filteredPosts.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-3">
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span>
                  {(p.category?.length ?? 0) > 0 && (
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs mr-1.5">
                      {p.category!.length === 1 ? `카테고리 • ${p.category![0]}` : `카테고리 ${p.category![0]} ${p.category!.slice(1).map((s) => `· 서브 카테고리 ${s}`).join(' ')}`}
                      <span className="mx-1">·</span>
                    </span>
                  )}
                  <a href={`/post/${slugForUrl(p.slug)}`} className="no-underline text-neutral-900 dark:text-neutral-100 hover:underline underline-offset-2">{p.title || p.slug}</a>
                  <span className="text-neutral-500 dark:text-neutral-400 text-sm"> {p.published ? '· 공개' : '· 비공개'}</span>
                  {(p.tags?.length ?? 0) > 0 && (
                    <span className="ml-2 inline-flex flex-wrap gap-1">
                      {p.tags!.map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">{tag}</span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400 text-xs">
                  작성 {formatDate(p.created_at)}{p.updated_at && p.updated_at !== p.created_at ? ` · 수정 ${formatDate(p.updated_at)}` : ''}
                </span>
              </span>
              <span
                className="shrink-0 inline-flex items-center gap-1 py-1.5 px-2 text-base text-neutral-500 dark:text-neutral-400"
                aria-label={`${p.title || p.slug} 댓글 ${p.comment_count ?? 0}개`}
              >
                <FiMessageCircle className="inline-flex shrink-0 [&_svg]:w-[1em] [&_svg]:h-[1em]" aria-hidden />
                {(p.comment_count ?? 0) > 0 && (
                  <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{p.comment_count}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
