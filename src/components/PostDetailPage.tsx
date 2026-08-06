import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiMessageCircle, FiHeart, FiX, FiArrowLeft, FiEdit2, FiTrash2, FiMessageSquare } from 'react-icons/fi';
import { TbArrowsSort, TbList } from 'react-icons/tb';
import PostRealtimeViewer, { type AnchorComment } from './PostRealtimeViewer';
import CommentForm from './CommentForm';
import PasswordConfirmModal from './PasswordConfirmModal';
import PostEditor from './PostEditor';
import { slugToNumericId } from '../lib/slugId.js';

import { getApiBase } from '../lib/apiBase';
import { renderInlineFormatting } from '../lib/renderInlineFormatting';

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
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
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

  const scrollToHeading = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const stickyHeader = document.getElementById('site-header');
    const offset = (stickyHeader?.getBoundingClientRect().height ?? 0) + 16;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    setMobileTocOpen(false);
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
        onHeadingsChange={setHeadings}
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
        headings={headings}
        mobileTocOpen={mobileTocOpen}
        onToggleToc={() => setMobileTocOpen((o) => !o)}
        onHeadingClick={scrollToHeading}
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
  const [editVerifiedPassword, setEditVerifiedPassword] = useState<string | null>(null);
  const [editVerifyTarget, setEditVerifyTarget] = useState<Comment | null>(null);
  const [editVerifySending, setEditVerifySending] = useState(false);
  const [editVerifyError, setEditVerifyError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteSending, setDeleteSending] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');
  const listRef = useRef<HTMLUListElement>(null);
  // 서버는 created_at ASC(오래된순)로 내려줌 — newest는 뒤집어서 보여줌
  const sortedComments = sortOrder === 'newest' ? [...comments].reverse() : comments;

  useEffect(() => {
    if (open && editCommentId != null) {
      const c = comments.find((x) => x.id === editCommentId);
      if (c) {
        setEditVerifyTarget(c);
        setEditVerifyError('');
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
    setReplyingId(null);
    setDeletingId(null);
    setEditVerifyTarget(c);
    setEditVerifyError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditVerifiedPassword(null);
  };

  const cancelEditVerify = () => {
    if (editVerifySending) return;
    setEditVerifyTarget(null);
    setEditVerifyError('');
  };

  const confirmEditVerify = async (password: string) => {
    const apiUrl = getApiBase();
    if (!editVerifyTarget || !apiUrl) return;
    setEditVerifyError('');
    setEditVerifySending(true);
    try {
      // 별도 "비밀번호만 확인" API가 없어서, 기존 내용 그대로 재제출해 비밀번호를 검증한다.
      const r = await fetch(`${apiUrl}/api/comments/${editVerifyTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editVerifyTarget.content, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data && (data as { error?: string }).error) || r.statusText);
      setEditingId(editVerifyTarget.id);
      setEditContent(editVerifyTarget.content);
      setEditVerifiedPassword(password);
      setEditVerifyTarget(null);
    } catch (err) {
      setEditVerifyError(err instanceof Error ? err.message : '비밀번호 확인에 실패했습니다.');
    } finally {
      setEditVerifySending(false);
    }
  };

  const startDelete = (id: number) => {
    setDeletingId(id);
    setEditingId(null);
    setEditVerifiedPassword(null);
    setReplyingId(null);
    setEditContent('');
  };

  const cancelDelete = () => {
    if (deleteSending) return;
    setDeletingId(null);
    setDeleteError('');
  };

  const confirmDelete = async (password: string) => {
    const apiUrl = getApiBase();
    if (deletingId == null || !apiUrl) return;
    setDeleteError('');
    setDeleteSending(true);
    try {
      const r = await fetch(`${apiUrl}/api/comments/${deletingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data && (data as { error?: string }).error) || r.statusText);
      setDeletingId(null);
      onCommentSuccess();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeleteSending(false);
    }
  };

  const startReply = (id: number) => {
    setReplyingId(id);
    setEditingId(null);
    setEditVerifiedPassword(null);
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
        aria-label="댓글"
      >
        <div className="flex flex-col flex-1 min-h-0 p-4">
          <div className="shrink-0 pb-4 border-b border-neutral-200 dark:border-neutral-700">
            {replyingId != null ? (
              <div className="mb-2 inline-flex items-center gap-2 max-w-full rounded-full border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-300">
                <span className="truncate">답글 작성 중 · 댓글 #{replyingId}</span>
                <button
                  type="button"
                  onClick={cancelReply}
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  aria-label="답글 작성 취소"
                >
                  <FiX className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {editingId != null ? (
              <div className="mb-2 inline-flex items-center gap-2 max-w-full rounded-full border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-300">
                <span className="truncate">댓글 수정 중 · 댓글 #{editingId}</span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  aria-label="댓글 수정 취소"
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
              editVerifiedPassword={editVerifiedPassword ?? undefined}
              onCancelEdit={editingId != null ? cancelEdit : undefined}
              onRequestClose={onClose}
              onSuccess={() => {
                setReplyingId(null);
                setEditingId(null);
                setEditVerifiedPassword(null);
                setEditContent('');
                setDeletingId(null);
                onCommentSuccess();
              }}
            />
          </div>
          <div className="shrink-0 pt-4 pb-1 flex items-center justify-between gap-1.5">
            <p className="m-0 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
              <span>댓글</span>
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                {comments.length}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setSortOrder((o) => (o === 'oldest' ? 'newest' : 'oldest'))}
              className="inline-flex items-center gap-1 py-1 px-2 text-xs font-sans rounded text-neutral-500 dark:text-neutral-400 bg-transparent border-none cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              <TbArrowsSort className="w-3.5 h-3.5" aria-hidden />
              {sortOrder === 'oldest' ? '오래된순' : '최신순'}
            </button>
          </div>
          {sortedComments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8 text-sm text-neutral-400 dark:text-neutral-500">
              댓글이 존재하지 않습니다
            </div>
          ) : (
          <ul ref={listRef} className="list-none p-0 m-0 flex-1 overflow-y-auto [&_li]:py-3">
            {sortedComments.map((c, index) => (
              <li
                key={c.id}
                data-comment-id={c.id}
                className="relative"
              >
                    <div className="absolute inset-y-0 left-0 w-4 flex justify-center" aria-hidden>
                      {index > 0 && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 top-0 w-px bg-[#879e82] dark:bg-[#586954]"
                          style={{ height: '13px' }}
                        />
                      )}
                      {index < sortedComments.length - 1 && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 bottom-0 w-px bg-[#879e82] dark:bg-[#586954]"
                          style={{ top: '27px' }}
                        />
                      )}
                      <span className="absolute left-1/2 top-[20px] -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#879e82] dark:bg-[#586954]" />
                    </div>
                    <div
                      className={
                        'pl-4' +
                        (replyingId === c.id || editingId === c.id
                          ? ' rounded-md pr-2 py-2 border border-neutral-900 dark:border-white'
                          : '')
                      }
                    >
                      <div className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">{c.user_id?.trim() ? c.user_id : '익명'}</span>
                        {c.created_at ? <span className="ml-1">{c.created_at}</span> : null}
                      </div>
                      <p className="m-0 text-neutral-900 dark:text-neutral-100">{renderInlineFormatting(c.content)}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <button
                          type="button"
                          onClick={() => startReply(c.id)}
                          className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[0.75rem] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                          aria-label="댓글에 답글 달기"
                        >
                          <FiMessageSquare className="w-4 h-4" aria-hidden />
                          답글
                        </button>
                        <div className="shrink-0 flex items-center gap-0.5">
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
                            className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                            aria-label="댓글 삭제"
                          >
                            <FiTrash2 className="w-4 h-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
              </li>
            ))}
          </ul>
          )}
        </div>
      </div>
      {deletingId != null && (
        <PasswordConfirmModal
          title="댓글 삭제"
          message="삭제하면 되돌릴 수 없습니다. 작성 시 입력한 비밀번호를 입력해주세요."
          submitLabel="삭제"
          requireConfirm={false}
          danger
          sending={deleteSending}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={(pw) => void confirmDelete(pw)}
        />
      )}
      {editVerifyTarget != null && (
        <PasswordConfirmModal
          title="댓글 수정"
          message="비밀번호를 입력하면 수정할 수 있습니다."
          submitLabel="확인"
          requireConfirm={false}
          sending={editVerifySending}
          error={editVerifyError}
          onCancel={cancelEditVerify}
          onConfirm={(pw) => void confirmEditVerify(pw)}
        />
      )}
    </>,
    document.body
  );
}

type FloatingPillProps = {
  commentCount: number;
  liked: boolean;
  onCommentClick: () => void;
  onLikeClick: () => void;
  headings?: { id: string; text: string; level: number }[];
  mobileTocOpen?: boolean;
  onToggleToc?: () => void;
  onHeadingClick?: (id: string) => void;
};

function FloatingPill({
  commentCount,
  liked,
  onCommentClick,
  onLikeClick,
  headings = [],
  mobileTocOpen = false,
  onToggleToc,
  onHeadingClick,
}: FloatingPillProps) {
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileTocOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!pillRef.current?.contains(e.target as Node)) {
        onToggleToc?.();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileTocOpen, onToggleToc]);

  return (
    <div ref={pillRef} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 sm:bottom-6">
      {mobileTocOpen && headings.length > 0 && (
        <div className="lg:hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-w-[calc(100vw-2rem)] max-h-[50vh] overflow-y-auto rounded-xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-700/80 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12)] py-1.5">
          {headings.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                onHeadingClick?.(h.id);
              }}
              className="block truncate py-1.5 pr-3 no-underline text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100"
              style={{ paddingLeft: `${0.75 + (h.level - 1) * 0.75}rem` }}
            >
              {h.text}
            </a>
          ))}
        </div>
      )}
      <div
        className="relative flex items-center gap-1 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-700/80 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12)] px-4 py-1.5 sm:px-5 max-w-[calc(100vw-2rem)]"
        role="group"
        aria-label="댓글 및 좋아요"
      >
        {headings.length > 0 && (
          <>
            <button
              type="button"
              onClick={onToggleToc}
              className="lg:hidden flex items-center gap-2 min-w-0 rounded-full py-1 px-3 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              aria-label="목차"
              aria-expanded={mobileTocOpen}
            >
              <TbList className="shrink-0 w-5 h-5" aria-hidden />
            </button>
            <span className="lg:hidden w-px h-5 bg-neutral-200 dark:bg-neutral-600" aria-hidden />
          </>
        )}
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
    </div>
  );
}
