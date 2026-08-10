import { useEffect, useRef, useState } from 'react';
import ProjectBody from './ProjectBody';
import { getApiBase } from '../lib/apiBase';

type ProjectPost = {
  slug: string;
  title: string;
  body_md: string;
  published: number;
  tags: string[];
  category: string[];
  banner?: string | null;
  banner_url?: string | null;
  /** true면 body_md를 마크다운 대신 raw HTML로 그대로 표시 */
  html_mode?: boolean;
  deleted?: boolean;
  deleted_at?: string | null;
};

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

type Props = { slug: string };

function ProjectDetailSkeleton() {
  const bar = 'rounded-md bg-neutral-200 dark:bg-neutral-700';
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="project-detail-banner-wrap" />
      <div className="project-detail-header">
        <div className="project-detail-head-row">
          <div className={`w-16 h-16 rounded-2xl shrink-0 ${bar}`} />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className={`h-6 w-1/2 ${bar}`} />
            <div className={`h-4 w-1/3 ${bar}`} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-5/6 ${bar}`} />
        <div className={`h-4 w-2/3 ${bar}`} />
      </div>
    </div>
  );
}

export default function PostProjectDetail({ slug }: Props) {
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<ProjectPost | null>(null);
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);

  // html_mode iframe이 스크롤바 없이 실제 콘텐츠 높이만큼 늘어나도록 로드 후 측정해서 반영
  const resizeHtmlFrame = () => {
    const frame = htmlFrameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    // 내부 문서 자체는 스크롤되지 않도록 고정 — iframe 높이를 콘텐츠에 맞추는 방식이라 스크롤이 필요 없음
    if (doc.documentElement) doc.documentElement.style.overflow = 'hidden';
    if (doc.body) doc.body.style.overflow = 'hidden';
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    // 라운딩/서브픽셀 오차로 인한 잔여 스크롤 방지용 여유값
    if (height > 0) frame.style.height = `${height + 2}px`;
  };

  // 뷰포트 리사이즈로 iframe 내부 레이아웃이 바뀔 때도 높이 재측정
  useEffect(() => {
    if (!post?.html_mode) return;
    window.addEventListener('resize', resizeHtmlFrame);
    return () => window.removeEventListener('resize', resizeHtmlFrame);
  }, [post?.html_mode]);

  useEffect(() => {
    if (!getApiBase() || !slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`${getApiBase()}/api/posts/by-slug/${encodeURIComponent(slug)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${getApiBase()}/api/settings/project-tag`).then((r) => (r.ok ? r.json() : { value: '' })),
    ])
      .then(([rawPost, tagSetting]: [Record<string, unknown> | null, { value?: string }]) => {
        if (cancelled) return;
        const projectTag = tagSetting.value ?? '';
        if (!rawPost || rawPost.deleted || Number(rawPost.published) !== 1 || !projectTag) {
          setPost(null);
          return;
        }
        const tags = parseJsonArray(rawPost.tags);
        if (!tags.includes(projectTag)) {
          setPost(null);
          return;
        }
        setPost({
          slug: String(rawPost.slug),
          title: String(rawPost.title ?? ''),
          body_md: String(rawPost.body_md ?? ''),
          published: Number(rawPost.published ?? 0),
          tags,
          category: parseJsonArray(rawPost.category),
          banner: typeof rawPost.banner === 'string' && rawPost.banner ? rawPost.banner : null,
          banner_url: typeof rawPost.banner_url === 'string' && rawPost.banner_url ? rawPost.banner_url : null,
          html_mode: Number(rawPost.html_mode ?? 0) === 1,
        });
      })
      .catch(() => {
        if (!cancelled) setPost(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="project-detail">
        <a href="/projects" className="project-detail-back">← 프로젝트 목록</a>
        <ProjectDetailSkeleton />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="project-detail">
        <a href="/projects" className="project-detail-back">← 프로젝트 목록</a>
        <p className="project-detail-404">해당 프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="project-detail">
      <a href="/projects" className="project-detail-back">← 프로젝트 목록</a>
      {post.banner && (
        <div className="project-detail-banner-wrap">
          {post.banner_url ? (
            <a
              href={post.banner_url}
              className="project-detail-banner-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={post.title}
            >
              <img className="project-detail-banner" src={post.banner} alt="" width="720" height="360" />
            </a>
          ) : (
            <img className="project-detail-banner" src={post.banner} alt="" width="720" height="360" />
          )}
        </div>
      )}
      <div className="project-detail-content">
        {post.html_mode ? (
          <iframe
            ref={htmlFrameRef}
            className="project-detail-html-frame"
            srcDoc={post.body_md}
            title={post.title}
            sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
            scrolling="no"
            onLoad={resizeHtmlFrame}
          />
        ) : (
          <ProjectBody content={post.body_md} />
        )}
      </div>
    </div>
  );
}
