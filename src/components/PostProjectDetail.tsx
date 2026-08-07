import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!getApiBase() || !slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`${getApiBase()}/api/posts/by-slug/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)),
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
        <ProjectBody content={post.body_md} />
      </div>
    </div>
  );
}
