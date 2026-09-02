import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/apiBase';

type ProjectPost = {
  slug: string;
  title: string;
  tags: string[];
  category: string[];
  created_at: string;
  banner?: string | null;
  description?: string | null;
};

function ProjectPostListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <article className="project-row" key={i} aria-hidden="true">
          <div className="project-row-link" style={{ pointerEvents: 'none' }}>
            <div className="project-row-bg animate-pulse bg-neutral-200 dark:bg-neutral-700" />
            <div className="project-row-island">
              <span className="inline-block h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
              <span className={`block mt-2 h-5 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'} rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse`} />
              <span className="block mt-2 h-3 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

export default function ProjectPostList() {
  const [posts, setPosts] = useState<ProjectPost[] | null>(null);

  useEffect(() => {
    if (!getApiBase()) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/posts/projects`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectPost[]) => {
        if (!cancelled) setPosts(rows);
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (posts === null) return <ProjectPostListSkeleton />;
  if (posts.length === 0) return null;

  return (
    <>
      {posts.map((p) => {
        const category = p.category.length > 0 ? p.category.join(' · ') : 'POST';
        const tagline = p.tags.join(', ');
        return (
          <article className="project-row" data-project={p.slug} key={p.slug}>
            <a href={`/projects/${p.slug}`} className="project-row-link" aria-label={p.title}>
              <div
                className="project-row-bg"
                style={p.banner ? { backgroundImage: `url(${p.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
              >
                {!p.banner && <span className="project-row-bg-icon" aria-hidden="true">📝</span>}
              </div>
              <div className="project-row-island">
                <span className="project-row-category">{category}</span>
                <h2 className="project-row-title">{p.title}</h2>
                {tagline && <p className="project-row-tagline">{tagline}</p>}
                {p.description && <p className="project-row-desc">{p.description}</p>}
                <span className="project-row-cta">자세히 보기 →</span>
              </div>
            </a>
          </article>
        );
      })}
    </>
  );
}
