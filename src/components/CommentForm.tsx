import { useState } from 'react';

const API_URL = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000') : '';

type Props = { postId: number; onSuccess?: () => void };

export default function CommentForm({ postId, onSuccess }: Props) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !API_URL) return;
    setStatus('sending');
    fetch(`${API_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, content: content.trim(), user_id: null }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(() => {
        setContent('');
        setStatus('done');
        onSuccess?.();
      })
      .catch(() => setStatus('error'))
      .finally(() => setStatus((s) => (s === 'sending' ? 'idle' : s)));
  };

  return (
    <form onSubmit={submit} className="comment-form">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="댓글을 입력하세요."
        rows={3}
        disabled={status === 'sending'}
      />
      <button type="submit" disabled={status === 'sending' || !content.trim()}>
        {status === 'sending' ? '전송 중…' : '댓글 달기'}
      </button>
      {status === 'done' && <span className="success">등록되었습니다.</span>}
      {status === 'error' && <span className="error">전송에 실패했습니다.</span>}
    </form>
  );
}
