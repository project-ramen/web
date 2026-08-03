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
        <p className="m-0 text-neutral-500 dark:text-neutral-400">로딩 중…</p>
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

  const category = post.category.length > 0 ? post.category.join(' · ') : 'POST';
  const tagline = post.tags.join(', ');

  return (
    <div className="project-detail">
      <a href="/projects" className="project-detail-back">← 프로젝트 목록</a>
      {post.banner && (
        <div className="project-detail-banner-wrap">
          <img className="project-detail-banner" src={post.banner} alt="" width="720" height="360" />
        </div>
      )}
      <header className="project-detail-header">
        <span className="project-detail-category">{category}</span>
        <div className="project-detail-head-row">
          <span className="project-detail-icon bg-gradient-to-br from-neutral-400 to-neutral-600" aria-hidden="true">📝</span>
          <div className="project-detail-head-text">
            <h1 className="project-detail-title">{post.title}</h1>
            {tagline && <p className="project-detail-tagline">{tagline}</p>}
          </div>
        </div>
      </header>
      <div className="project-detail-content">
        <ProjectBody content={post.body_md} />
      </div>
    </div>
  );
}
