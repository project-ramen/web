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

export default function ProjectPostList() {
  const [posts, setPosts] = useState<ProjectPost[]>([]);

  useEffect(() => {
    if (!getApiBase()) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/posts/projects`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectPost[]) => {
        if (!cancelled) setPosts(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
