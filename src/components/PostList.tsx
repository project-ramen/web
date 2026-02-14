import { useEffect, useState } from 'react';

const API_URL = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000') : '';

type Post = { id: number; slug: string; title: string; published: number; created_at: string; updated_at: string };

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!API_URL) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/posts`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setPosts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>로딩 중…</p>;
  if (error) return <p>목록을 불러올 수 없습니다. ({error}) 서버가 실행 중인지 확인하세요.</p>;
  if (posts.length === 0) return <p>등록된 포스트가 없습니다.</p>;

  return (
    <ul className="post-list">
      {posts.map((p) => (
        <li key={p.id}>
          <a href={`/post/${p.slug}`}>{p.title || p.slug}</a>
          <span className="meta"> {p.published ? '· 공개' : '· 비공개'}</span>
        </li>
      ))}
    </ul>
  );
}
