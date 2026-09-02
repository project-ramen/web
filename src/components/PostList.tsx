import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiCalendar, FiChevronDown, FiChevronRight, FiMessageCircle, FiPlus, FiSearch, FiSliders, FiTag, FiX } from 'react-icons/fi';
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

/** 서버 /api/posts/categories 응답 — 존재하는 카테고리 조합 하나당 그 카테고리의 최신 글 작성일 */
type CategoryInfo = { category: string[]; latest: string };

/** 서버 /api/posts/tags 응답 */
type TagInfo = { tag: string; count: number };

function buildCategoryTree(paths: string[][]): CategoryNode[] {
  const root: CategoryNode[] = [];
  paths.forEach((cat) => {
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

function PostListSkeleton() {
  const bar = 'rounded-md bg-neutral-200 dark:bg-neutral-700';
  return (
    <ul className="list-none p-0 [&_li]:py-2 animate-pulse" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-3">
          <span className="flex-1 min-w-0 flex flex-col gap-1.5">
            <span className={`h-4 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'} ${bar}`} />
            <span className={`h-3 w-24 ${bar}`} />
          </span>
          <span className={`h-4 w-6 shrink-0 ${bar}`} />
        </li>
      ))}
    </ul>
  );
}

/** URL의 ?category= 파라미터(경로 구분자 "/") → 카테고리 경로 배열 */
function categoryFromSearch(search: string): string[] {
  const raw = new URLSearchParams(search).get('category');
  return raw ? raw.split('/').filter(Boolean) : [];
}

/** 현재 categoryFilter를 ?category=로 URL에 반영 (히스토리는 늘리지 않고 replace) */
function syncCategoryToUrl(categoryFilter: string[]) {
  const url = new URL(window.location.href);
  if (categoryFilter.length > 0) url.searchParams.set('category', categoryFilter.join('/'));
  else url.searchParams.delete('category');
  window.history.replaceState(window.history.state, '', url);
}

const PAGE_SIZE = 20;

/** 검색창 안에 디스코드처럼 넣는 필터 토큰 */
const FILTER_PREFIXES = ['tag', 'date', 'before', 'after'] as const;
type FilterPrefix = (typeof FILTER_PREFIXES)[number];

type ParsedSearch = { text: string; tag: string; dateFrom: string; dateTo: string };

/** "설계 tag:frontend after:2024-01-01" 같은 입력에서 필터 토큰을 뽑아내고, 나머지를 자유 검색어로 남김 */
function parseSearchInput(raw: string): ParsedSearch {
  let tag = '';
  let dateFrom = '';
  let dateTo = '';
  const text = raw
    .replace(/\btag:(\S+)/gi, (_, v: string) => { tag = v; return ''; })
    .replace(/\bdate:(\d{4}-\d{2}-\d{2})/gi, (_, v: string) => { dateFrom = v; dateTo = v; return ''; })
    .replace(/\bafter:(\d{4}-\d{2}-\d{2})/gi, (_, v: string) => { dateFrom = v; return ''; })
    .replace(/\bbefore:(\d{4}-\d{2}-\d{2})/gi, (_, v: string) => { dateTo = v; return ''; })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, tag, dateFrom, dateTo };
}

/** 검색창에서 prefix:값 형태 토큰을 통째로 제거 (칩의 X 눌렀을 때 사용) */
function removeFilterTokens(raw: string, prefixes: FilterPrefix[]): string {
  const re = new RegExp(`\\b(${prefixes.join('|')}):\\S*`, 'gi');
  return raw.replace(re, '').replace(/\s+/g, ' ').trim();
}

/** 현재 커서 위치가 아니라 마지막 공백 뒤 "입력 중인 토큰" 기준 — 작은 검색창이라 이 정도면 충분 */
function activeToken(raw: string): string {
  const parts = raw.split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** /api/posts 목록 요청 쿼리스트링 조립 — 카테고리/검색/태그/날짜/정렬/페이지 전부 서버가 처리 */
function buildPostsQuery(opts: {
  categoryFilter: string[];
  q: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: string;
  offset: number;
}): string {
  const sp = new URLSearchParams();
  if (opts.categoryFilter.length > 0) sp.set('category', opts.categoryFilter.join('/'));
  if (opts.q.trim()) sp.set('q', opts.q.trim());
  if (opts.tag.trim()) sp.set('tag', opts.tag.trim());
  if (opts.dateFrom) sp.set('dateFrom', opts.dateFrom);
  if (opts.dateTo) sp.set('dateTo', opts.dateTo);
  sp.set('sortBy', opts.sortBy);
  sp.set('sortOrder', opts.sortOrder);
  sp.set('limit', String(PAGE_SIZE));
  sp.set('offset', String(opts.offset));
  return sp.toString();
}

export default function PostList() {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  // 카테고리 선택 상태를 ?category= 쿼리에 저장 — 글 상세로 갔다가 뒤로가기해도 필터가 유지되게.
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : categoryFromSearch(window.location.search)
  );
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // 설정 아이콘으로 여닫는, 정렬/카테고리를 담은 확장 패널
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [expandedCategoryPaths, setExpandedCategoryPaths] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const categoryPanelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 검색창에 tag:/date:/before:/after: 토큰으로 넣은 필터 — 디바운스된 값 기준으로 뽑아서 서버 요청에 씀
  const parsedSearch = useMemo(() => parseSearchInput(debouncedQuery), [debouncedQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncCategoryToUrl(categoryFilter);
  }, [categoryFilter]);

  // 검색어는 타이핑마다 요청 안 나가게 300ms 디바운스
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // 카테고리 트리·"최근 카테고리" UI용 — 전체 글 목록과 별개로, 가벼운 전용 엔드포인트에서 한 번만 받아옴
  useEffect(() => {
    if (!getApiBase()) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/posts/categories`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((rows: CategoryInfo[]) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {
        // 카테고리 트리는 부가 기능 — 실패해도 목록 자체는 그대로 보여줌
      });
    return () => { cancelled = true; };
  }, []);

  // 검색창 tag: 자동완성용 태그 목록 — 마찬가지로 한 번만 받아옴
  useEffect(() => {
    if (!getApiBase()) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/posts/tags`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((rows: TagInfo[]) => {
        if (!cancelled) setTags(rows);
      })
      .catch(() => {
        // 자동완성은 부가 기능 — 실패해도 tag: 직접 타이핑은 그대로 동작함
      });
    return () => { cancelled = true; };
  }, []);

  // 카테고리/검색어(+태그/날짜 토큰)/정렬이 바뀌면 처음부터(offset 0) 다시 가져옴 — 쌓아둔 페이지는 버림
  useEffect(() => {
    let cancelled = false;
    if (!getApiBase()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const qs = buildPostsQuery({
      categoryFilter,
      q: parsedSearch.text,
      tag: parsedSearch.tag,
      dateFrom: parsedSearch.dateFrom,
      dateTo: parsedSearch.dateTo,
      sortBy,
      sortOrder,
      offset: 0,
    });
    fetch(`${getApiBase()}/api/posts?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { items: ApiPost[]; total: number }) => {
        if (cancelled) return;
        setItems(data.items.map(apiPostToPost));
        setTotal(data.total);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [categoryFilter, parsedSearch, sortBy, sortOrder]);

  const categoryTree = useMemo(() => buildCategoryTree(categories.map((c) => c.category)), [categories]);

  const recentCategories = useMemo(
    () =>
      [...categories]
        .sort((a, b) => b.latest.localeCompare(a.latest))
        .slice(0, 3)
        .map((c) => c.category),
    [categories]
  );

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

  // 검색창 자동완성 드롭다운 바깥 클릭하면 닫기
  useEffect(() => {
    if (!searchFocused) return;
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchFocused]);

  // 무한 스크롤: sentinel이 화면에 들어오면 다음 PAGE_SIZE개를 서버에서 이어서 받아옴
  const hasMore = items.length < total;
  useEffect(() => {
    if (loading || loadingMore || !hasMore || !getApiBase()) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setLoadingMore(true);
        const qs = buildPostsQuery({
          categoryFilter,
          q: parsedSearch.text,
          tag: parsedSearch.tag,
          dateFrom: parsedSearch.dateFrom,
          dateTo: parsedSearch.dateTo,
          sortBy,
          sortOrder,
          offset: items.length,
        });
        fetch(`${getApiBase()}/api/posts?${qs}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
          .then((data: { items: ApiPost[]; total: number }) => {
            setItems((prev) => [...prev, ...data.items.map(apiPostToPost)]);
            setTotal(data.total);
          })
          .catch(() => {
            // 추가분 로딩 실패는 조용히 무시 — 다시 스크롤하면 재시도됨
          })
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, items.length, categoryFilter, parsedSearch, sortBy, sortOrder]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // 검색창 자동완성 — 입력 중인 마지막 토큰이 "tag:", "date:"/"before:"/"after:"면 값 후보를,
  // 그 앞부분(예: "ta")만 쳤으면 prefix 자체를 제안 (디스코드 검색창 필터 자동완성 흉내)
  const suggestions = useMemo(() => {
    if (!searchFocused) return null;
    const token = activeToken(searchQuery);
    const tagMatch = /^tag:(.*)$/i.exec(token);
    if (tagMatch) {
      const partial = tagMatch[1].toLowerCase();
      return { kind: 'tag' as const, list: tags.filter((t) => t.tag.toLowerCase().includes(partial)).slice(0, 8) };
    }
    const dateMatch = /^(date|before|after):(.*)$/i.exec(token);
    if (dateMatch) {
      return { kind: 'date' as const, prefix: dateMatch[1].toLowerCase() as 'date' | 'before' | 'after' };
    }
    if (token && !token.includes(':')) {
      const list = FILTER_PREFIXES.filter((p) => p.startsWith(token.toLowerCase()));
      if (list.length > 0) return { kind: 'prefix' as const, list };
    }
    return null;
  }, [searchFocused, searchQuery, tags]);

  /** 검색창에서 입력 중이던 마지막 토큰을 완성된 토큰(+뒤 공백)으로 바꿔치기 */
  function replaceActiveToken(replacement: string) {
    const parts = searchQuery.split(/\s+/);
    parts[parts.length - 1] = replacement;
    setSearchQuery(parts.join(' ').replace(/^\s+/, ''));
    searchInputRef.current?.focus();
  }

  const datePresets: { label: string; value: string }[] = [
    { label: '오늘', value: todayIso() },
    { label: '1주 전', value: daysAgoIso(7) },
    { label: '1개월 전', value: daysAgoIso(30) },
    { label: '올해 시작', value: `${new Date().getFullYear()}-01-01` },
  ];

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
        <PostListSkeleton />
      </>
    );
  if (error)
    return (
      <>
        <div className="mb-4">{newPostButton}</div>
        <p className="text-neutral-600 dark:text-neutral-400">목록을 불러올 수 없습니다. ({error}) 서버가 실행 중인지 확인하세요.</p>
      </>
    );
  const hasActiveFilter =
    categoryFilter.length > 0 || !!parsedSearch.text.trim() || !!parsedSearch.tag || !!parsedSearch.dateFrom || !!parsedSearch.dateTo;

  if (total === 0 && !hasActiveFilter)
    return (
      <>
        <div className="mb-4">{newPostButton}</div>
        <p className="text-neutral-600 dark:text-neutral-400">등록된 포스트가 없습니다.</p>
      </>
    );

  return (
    <>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {newPostButton}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {(parsedSearch.tag || parsedSearch.dateFrom || parsedSearch.dateTo) && (
              <div className="flex items-center gap-1.5">
                {parsedSearch.tag && (
                  <span className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs font-medium bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900">
                    <FiTag className="w-3 h-3" aria-hidden />
                    {parsedSearch.tag}
                    <button
                      type="button"
                      onClick={() => setSearchQuery((q) => removeFilterTokens(q, ['tag']))}
                      className="p-0.5 rounded-full hover:bg-white/20"
                      aria-label="태그 필터 해제"
                    >
                      <FiX className="w-3 h-3" aria-hidden />
                    </button>
                  </span>
                )}
                {(parsedSearch.dateFrom || parsedSearch.dateTo) && (
                  <span className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs font-medium bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900">
                    <FiCalendar className="w-3 h-3" aria-hidden />
                    {parsedSearch.dateFrom === parsedSearch.dateTo ? parsedSearch.dateFrom : `${parsedSearch.dateFrom || '…'} ~ ${parsedSearch.dateTo || '…'}`}
                    <button
                      type="button"
                      onClick={() => setSearchQuery((q) => removeFilterTokens(q, ['date', 'before', 'after']))}
                      className="p-0.5 rounded-full hover:bg-white/20"
                      aria-label="기간 필터 해제"
                    >
                      <FiX className="w-3 h-3" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                settingsOpen || categoryFilter.length > 0 || sortBy !== 'created_at' || sortOrder !== 'desc'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
              aria-expanded={settingsOpen}
              aria-label={settingsOpen ? '정렬·카테고리 패널 닫기' : '정렬·카테고리 패널 열기'}
              title="정렬 · 카테고리"
            >
              <FiSliders className="w-4 h-4" aria-hidden />
            </button>
            <div className="relative" ref={searchBoxRef}>
              <div
                className="flex items-center overflow-hidden rounded-full bg-neutral-50 dark:bg-neutral-800 transition-[width] duration-300 ease-out"
                style={{ width: searchOpen ? 260 : 32 }}
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
                  onFocus={() => setSearchFocused(true)}
                  placeholder="제목… tag:태그 date:2024-01-01"
                  className="shrink min-w-0 w-[228px] h-8 pr-3 bg-transparent border-none text-neutral-900 dark:text-neutral-100 text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none"
                  aria-label="포스트 검색 (tag:, date:, before:, after: 필터 가능)"
                />
              </div>
              {searchOpen && suggestions && (
                <div className="absolute right-0 z-10 mt-1 min-w-[210px] max-w-[280px] max-h-64 overflow-y-auto p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg">
                  {suggestions.kind === 'prefix' &&
                    suggestions.list.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => replaceActiveToken(`${p}:`)}
                        className="block w-full text-left px-2 py-1.5 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      >
                        <span className="font-mono text-neutral-500 dark:text-neutral-400">{p}:</span>{' '}
                        {p === 'tag' ? '태그로 필터' : p === 'date' ? '작성일로 필터' : p === 'after' ? '이후 작성된 글' : '이전에 작성된 글'}
                      </button>
                    ))}
                  {suggestions.kind === 'tag' &&
                    (suggestions.list.length > 0 ? (
                      suggestions.list.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() => replaceActiveToken(`tag:${t.tag}`)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <FiTag className="w-3 h-3 shrink-0" aria-hidden />
                            <span className="truncate">{t.tag}</span>
                          </span>
                          <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{t.count}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">일치하는 태그가 없습니다.</p>
                    ))}
                  {suggestions.kind === 'date' && (
                    <>
                      <p className="px-2 pt-1 pb-1.5 text-xs text-neutral-400 dark:text-neutral-500">YYYY-MM-DD로 직접 입력하거나:</p>
                      {datePresets.map((d) => (
                        <button
                          key={d.label}
                          type="button"
                          onClick={() => replaceActiveToken(`${suggestions.prefix}:${d.value}`)}
                          className="block w-full text-left px-2 py-1.5 rounded text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                          {d.label} <span className="text-xs text-neutral-400 dark:text-neutral-500">({d.value})</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 설정 아이콘 누르면 위 바가 늘어나면서 정렬·카테고리를 보여줌 */}
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: settingsOpen ? '1fr' : '0fr' }}>
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
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
          </div>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          {parsedSearch.text.trim() || parsedSearch.tag || parsedSearch.dateFrom || parsedSearch.dateTo
            ? '검색 결과가 없습니다.'
            : categoryFilter.length > 0
              ? `해당 카테고리(${categoryFilter.join(' › ')})에 포스트가 없습니다.`
              : '등록된 포스트가 없습니다.'}
        </p>
      ) : (
        <ul className="list-none p-0 [&_li]:py-2">
          {items.map((p) => (
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
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{p.comment_count ?? 0}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div ref={loadMoreRef} className="py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
          불러오는 중…
        </div>
      )}
    </>
  );
}
