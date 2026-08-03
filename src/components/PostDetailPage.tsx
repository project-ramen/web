import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiMessageCircle, FiHeart, FiX, FiArrowLeft, FiEdit2, FiTrash2 } from 'react-icons/fi';
import PostRealtimeViewer, { type AnchorComment } from './PostRealtimeViewer';
import CommentForm from './CommentForm';
import PostEditor from './PostEditor';
import { slugToNumericId } from '../lib/slugId.js';

import { getApiBase } from '../lib/apiBase';

type Post = { id: number; slug: string; title: string; body_md: string; published: number; created_at: string; category?: string[] };
type DeletedPost = { id: number; slug: string; title: string; body_md: string; deleted: true; deleted_at: string; category?: string[] };
type Comment = {
  id: number;
  post_id: number;
  content: string;
  user_id: string | null;
  created_at: string;
  start_anchor?: string | null;
  end_anchor?: string | null;
  referenced_snippet?: string | null;
  referenced_text?: string | null;
};

function parseCategory(category: string | undefined): string[] {
  if (!category) return [];
  try {
    const c = JSON.parse(category);
    return Array.isArray(c) ? c.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function snippetFromBody(body: string): string {
  const lines = body.split('\n').filter(Boolean);
  if (lines.length <= 7) return body;
  const top = lines.slice(0, 3).join('\n');
  const bottom = lines.slice(-3).join('\n');
  return [top, '...', bottom].join('\n');
}

type Props = { slug: string };

const LIKE_STORAGE_KEY = 'ramen-post-likes';

function getStoredLikes(): Record<number, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LIKE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStoredLike(postId: number, liked: boolean) {
  try {
    const next = { ...getStoredLikes(), [postId]: liked };
    localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export default function PostDetailPage({ slug }: Props) {
  const [post, setPost] = useState<Post | DeletedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [liked, setLiked] = useState<boolean>(false);
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [editCommentId, setEditCommentId] = useState<number | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    setIsEditMode(new URLSearchParams(window.location.search).get('edit') === '1');
  }, []);

  const fetchComments = (idOrSlug: number | string) => {
    if (!getApiBase()) return;
    const path =
      typeof idOrSlug === 'string'
        ? `/api/posts/by-slug/${encodeURIComponent(idOrSlug)}/comments`
        : `/api/posts/${idOrSlug}/comments`;
    fetch(`${getApiBase()}${path}`).then((r) => (r.ok ? r.json() : [])).then(setComments);
  };

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!getApiBase()) {
      setLoading(false);
      return;
    }
    fetch(`${getApiBase()}/api/posts/by-slug/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Post | DeletedPost | null) => {
        if (cancelled) return;
        if (!p) { setPost(null); return; }
        // category가 JSON 문자열로 오는 경우 파싱
        if (typeof (p as { category?: unknown }).category === 'string') {
          try {
            (p as Post).category = JSON.parse((p as unknown as { category: string }).category) as string[];
            if (!Array.isArray((p as Post).category)) (p as Post).category = [];
          } catch {
            (p as Post).category = [];
          }
        }
        const postId = slugToNumericId(p.slug);
        (p as Post).id = postId;
        setPost(p);
        fetchComments(p.slug);
        setLiked(!!getStoredLikes()[postId]);
      })
      .catch(() => { if (!cancelled) setPost(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!commentPopupOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [commentPopupOpen]);

  const toggleLike = () => {
    if (!post || 'deleted' in post) return;
    const next = !liked;
    setLiked(next);
    setStoredLike(post.id, next);
  };

  const backLink = (
    <a
      href="/post"
      className="inline-flex items-center gap-2 text-[0.9375rem] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 no-underline mb-4 transition-colors"
      aria-label="글 목록으로 돌아가기"
    >
      <FiArrowLeft className="shrink-0" aria-hidden />
      뒤로가기
    </a>
  );
  const pageWrapClass = 'min-w-0 w-full';
  if (loading) return <div className={pageWrapClass}>{backLink}<p className="m-0">로딩 중…</p></div>;
  if (!post) return <div className={pageWrapClass}>{backLink}<p className="m-0">포스트를 찾을 수 없습니다.</p></div>;

  if ('deleted' in post) {
    const deletedPost = post;
    const snippet = snippetFromBody(deletedPost.body_md ?? '');
    const deletedDate = deletedPost.deleted_at
      ? new Date(deletedPost.deleted_at).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';
    const catArr = deletedPost.category?.length ? deletedPost.category : [];
    const categoryLabel = catArr.length === 1 ? `카테고리 ${catArr[0]}` : catArr.length > 1 ? `카테고리 ${catArr[0]} · ${catArr.slice(1).map((s) => `서브 카테고리 ${s}`).join(' · ')}` : '';
    return (
      <div className={pageWrapClass}>
        {backLink}
        <header className="mb-6 sm:mb-8">
          {categoryLabel && <p className="m-0 mb-1 text-[0.9375rem] text-neutral-500 dark:text-neutral-400">{categoryLabel}</p>}
          <h1 className="font-display text-[clamp(1.5rem,4vw,2.5rem)] font-bold m-0 mb-1.5 text-neutral-900 dark:text-neutral-100 leading-tight break-words">{deletedPost.title || deletedPost.slug}</h1>
          {deletedDate && <time className="text-[0.9375rem] text-neutral-500 dark:text-neutral-400" dateTime={deletedPost.deleted_at}>삭제됨 · {deletedDate}</time>}
        </header>
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 dark:border-amber-600 rounded-r-md my-4">
          <span className="block font-medium mb-2">해당 개시글 지워짐</span>
          <button type="button" className="bg-transparent border-none text-blue-600 cursor-pointer underline text-[0.9375rem] p-0" onClick={() => setSnippetOpen((o) => !o)}>
            자세히 보기
          </button>
          {snippetOpen && (
            <pre className="text-sm whitespace-pre-wrap mt-3 p-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-md">{snippet || '(내용 없음)'}</pre>
          )}
        </div>
        <CommentPopup
          open={commentPopupOpen}
          onClose={() => setCommentPopupOpen(false)}
          postId={deletedPost.id}
          postSlug={deletedPost.slug}
          comments={comments}
          onCommentSuccess={() => fetchComments(deletedPost.slug)}
        />
        <FloatingPill
          commentCount={comments.length}
          liked={liked}
          onCommentClick={() => setCommentPopupOpen(true)}
          onLikeClick={toggleLike}
        />
      </div>
    );
  }

  const anchorComments: AnchorComment[] = comments
    .filter((c) => c.start_anchor != null && c.end_anchor != null)
    .map((c) => ({
      id: c.id,
      start_anchor: c.start_anchor ?? null,
      end_anchor: c.end_anchor ?? null,
      content: c.content,
      created_at: c.created_at,
      ...(c.referenced_snippet != null && { referenced_snippet: c.referenced_snippet }),
      ...(c.referenced_text != null && { referenced_text: c.referenced_text }),
    }));

  const normalPost = post;
  const displayDate = normalPost.created_at
    ? new Date(normalPost.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const catArr = normalPost.category?.length ? normalPost.category : [];
  const categoryLabel = catArr.length === 1 ? `카테고리 ${catArr[0]}` : catArr.length > 1 ? `카테고리 ${catArr[0]} · ${catArr.slice(1).map((s) => `서브 카테고리 ${s}`).join(' · ')}` : '';

  if (isEditMode) {
    return (
      <div className={pageWrapClass}>
        {backLink}
        <PostEditor
          mode="edit"
          initial={{
            slug: normalPost.slug,
            title: normalPost.title,
            body_md: normalPost.body_md ?? '',
            published: normalPost.published,
          }}
          onCancel={() => {
            window.location.href = `/post/${slug}`;
          }}
          onSaved={() => {
            window.location.href = `/post/${slug}`;
          }}
        />
      </div>
    );
  }

  return (
    <div className={pageWrapClass}>
      {backLink}
      <header className="mb-6 sm:mb-8">
        {categoryLabel && <p className="m-0 mb-1 text-[0.9375rem] text-neutral-500 dark:text-neutral-400">{categoryLabel}</p>}
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-[clamp(1.5rem,4vw,2.5rem)] font-bold m-0 mb-1.5 text-neutral-900 dark:text-neutral-100 leading-tight break-words">{normalPost.title || normalPost.slug}</h1>
          <a
            href="?edit=1"
            className="shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 border border-neutral-200 dark:border-neutral-600 rounded-md text-sm text-neutral-600 dark:text-neutral-300 no-underline hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <FiEdit2 className="w-4 h-4" aria-hidden />
            수정
          </a>
        </div>
        {displayDate && <time className="text-[0.9375rem] text-neutral-500 dark:text-neutral-400" dateTime={normalPost.created_at}>{displayDate}</time>}
      </header>
      <PostRealtimeViewer
        slug={slug}
        initialContent={normalPost.body_md ?? ''}
        postId={post.id}
        anchorComments={anchorComments}
        onSelectionCommentSuccess={() => fetchComments(slug)}
        onEditAnchorComment={(commentId) => {
          setCommentPopupOpen(true);
          setEditCommentId(commentId);
          setDeleteCommentId(null);
        }}
        onDeleteAnchorComment={(commentId) => {
          setCommentPopupOpen(true);
          setDeleteCommentId(commentId);
          setEditCommentId(null);
        }}
      />
      <CommentPopup
        open={commentPopupOpen}
        onClose={() => {
          setCommentPopupOpen(false);
          setEditCommentId(null);
          setDeleteCommentId(null);
        }}
        postId={post.id}
        postSlug={slug}
        comments={comments}
        editCommentId={editCommentId}
        deleteCommentId={deleteCommentId}
        onCommentSuccess={() => fetchComments(slug)}
      />
      <FloatingPill
        commentCount={comments.length}
        liked={liked}
        onCommentClick={() => setCommentPopupOpen(true)}
        onLikeClick={toggleLike}
      />
    </div>
  );
}

type CommentPopupProps = {
  open: boolean;
  onClose: () => void;
  postId: number;
  postSlug: string;
  comments: Comment[];
  editCommentId?: number | null;
  deleteCommentId?: number | null;
  onCommentSuccess: () => void;
};

function CommentPopup({ open, onClose, postId, postSlug, comments, editCommentId = null, deleteCommentId = null, onCommentSuccess }: CommentPopupProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open && editCommentId != null) {
      const c = comments.find((x) => x.id === editCommentId);
      if (c) {
        setEditingId(c.id);
        setEditContent(c.content);
      }
      setDeletingId(null);
    }
  }, [open, editCommentId, comments]);

  useEffect(() => {
    if (open && deleteCommentId != null) {
      setDeletingId(deleteCommentId);
      setEditingId(null);
    }
  }, [open, deleteCommentId]);

  useEffect(() => {
    if (open && deletingId != null && listRef.current) {
      const el = listRef.current.querySelector(`[data-comment-id="${deletingId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open, deletingId]);

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditContent(c.content);
    setReplyingId(null);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const startDelete = (id: number) => {
    setDeletingId(id);
    setEditingId(null);
    setReplyingId(null);
    setEditContent('');
  };

  const cancelDelete = () => {
    setDeletingId(null);
  };

  const startReply = (id: number) => {
    setReplyingId(id);
    setEditingId(null);
    setEditContent('');
    setDeletingId(null);
  };

  const cancelReply = () => {
    setReplyingId(null);
  };

  if (!open) return null;
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-[min(calc(100vw-2rem),420px)] max-w-[calc(100vw-1rem)] max-h-[min(80vh,85dvh)] flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comment-popup-title"
      >
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h2 id="comment-popup-title" className="text-lg font-semibold m-0 text-neutral-900 dark:text-neutral-100">댓글 {comments.length}개</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-2 rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label="닫기"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0 p-4">
          <ul ref={listRef} className="list-none p-0 m-0 flex-1 overflow-y-auto [&_li]:py-3">
            {comments.map((c) => (
              <li
                key={c.id}
                data-comment-id={c.id}
                className={
                  replyingId === c.id
                    ? 'rounded-md px-2 py-2 bg-blue-50/50 dark:bg-blue-950/20'
                    : editingId === c.id
                    ? 'rounded-md px-2 py-2 bg-amber-50/60 dark:bg-amber-950/20'
                    : deletingId === c.id
                    ? 'rounded-md px-2 py-2 bg-rose-50/70 dark:bg-rose-950/25'
                    : undefined
                }
              >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="font-medium text-neutral-600 dark:text-neutral-300">{c.user_id?.trim() ? c.user_id : '익명'}</span>
                          {c.created_at ? <span className="ml-1">{c.created_at}</span> : null}
                        </div>
                        <p className="m-0 text-neutral-900 dark:text-neutral-100">{c.content}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startReply(c.id)}
                          className="px-1.5 py-1 rounded text-[0.75rem] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                          aria-label="댓글에 답글 달기"
                        >
                          답글
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                          aria-label="댓글 수정"
                        >
                          <FiEdit2 className="w-4 h-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => startDelete(c.id)}
                          className="p-1.5 rounded text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          aria-label="댓글 삭제"
                        >
                          <FiTrash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                    </div>
              </li>
            ))}
          </ul>
          <div className="shrink-0 pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700">
            {replyingId != null ? (
              <div className="mb-2 inline-flex items-center gap-2 max-w-full rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-xs text-blue-700 dark:text-blue-300">
                <span className="truncate">답글 작성 중 · 댓글 #{replyingId}</span>
                <button
                  type="button"
                  onClick={cancelReply}
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  aria-label="답글 작성 취소"
                >
                  <FiX className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {editingId != null ? (
              <div className="mb-2 inline-flex items-center gap-2 max-w-full rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
                <span className="truncate">댓글 수정 중 · 댓글 #{editingId}</span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  aria-label="댓글 수정 취소"
                >
                  <FiX className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {deletingId != null ? (
              <div className="mb-2 inline-flex items-center gap-2 max-w-full rounded-full border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-1 text-xs text-rose-700 dark:text-rose-300">
                <span className="truncate">댓글 삭제 중 · 댓글 #{deletingId}</span>
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                  aria-label="댓글 삭제 취소"
                >
                  <FiX className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            <CommentForm
              postId={postId}
              postSlug={postSlug}
              replyToCommentId={replyingId}
              onCancelReply={replyingId != null ? cancelReply : undefined}
              editCommentId={editingId}
              initialContent={editContent}
              onCancelEdit={editingId != null ? cancelEdit : undefined}
              deleteCommentId={deletingId}
              onCancelDelete={deletingId != null ? cancelDelete : undefined}
              onSuccess={() => {
                setReplyingId(null);
                setEditingId(null);
                setEditContent('');
                setDeletingId(null);
                onCommentSuccess();
              }}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

type FloatingPillProps = {
  commentCount: number;
  liked: boolean;
  onCommentClick: () => void;
  onLikeClick: () => void;
};

function FloatingPill({ commentCount, liked, onCommentClick, onLikeClick }: FloatingPillProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-700/80 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12)] px-4 py-1.5 sm:bottom-6 sm:px-5 max-w-[calc(100vw-2rem)]"
      role="group"
      aria-label="댓글 및 좋아요"
    >
      <button
        type="button"
        onClick={onCommentClick}
        className="flex items-center gap-2 min-w-0 rounded-full py-1 px-3 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        aria-label={`댓글 ${commentCount}개`}
      >
        <FiMessageCircle className="shrink-0 w-5 h-5" aria-hidden />
        <span className="text-sm font-medium tabular-nums">{commentCount}</span>
      </button>
      <span className="w-px h-5 bg-neutral-200 dark:bg-neutral-600" aria-hidden />
      <button
        type="button"
        onClick={onLikeClick}
        className={`flex items-center gap-2 min-w-0 rounded-full py-1 px-3 transition-colors ${
          liked
            ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300'
        }`}
        aria-label={liked ? '좋아요 취소' : '좋아요'}
        aria-pressed={liked}
      >
        <FiHeart
          className={`shrink-0 w-5 h-5 ${liked ? 'fill-current' : ''}`}
          aria-hidden
        />
        <span className="text-sm font-medium">{liked ? '1' : '0'}</span>
      </button>
    </div>
  );
}
