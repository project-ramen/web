import { useEffect, useState } from 'react';
import PostRealtimeViewer from './PostRealtimeViewer';
import CommentForm from './CommentForm';

const API_URL = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000') : '';

type Post = { id: number; slug: string; title: string; body_md: string; published: number; created_at: string };
type Comment = { id: number; post_id: number; content: string; user_id: string | null; created_at: string };

type Props = { slug: string };

export default function PostDetailPage({ slug }: Props) {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = (id: number) => {
    if (!API_URL) return;
    fetch(`${API_URL}/api/posts/${id}/comments`).then((r) => (r.ok ? r.json() : [])).then(setComments);
  };

  useEffect(() => {
    if (!API_URL || !slug) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/posts/by-slug/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        setPost(p);
        if (p) fetchComments(p.id);
        return p;
      })
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [slug]);


  if (loading) return <p>로딩 중…</p>;
  if (!post) return <p>포스트를 찾을 수 없습니다.</p>;

  return (
    <div className="post-detail-page">
      <PostRealtimeViewer slug={slug} initialContent={post.body_md ?? ''} />
      <section className="comments-section" aria-label="댓글">
        <h2>댓글</h2>
        <CommentForm postId={post.id} onSuccess={() => fetchComments(post.id)} />
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id}>
              <p className="comment-content">{c.content}</p>
              <span className="comment-meta">{c.created_at}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
