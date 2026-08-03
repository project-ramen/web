import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/apiBase';

type Props = {
  postId: number;
  postSlug?: string;
  onSuccess?: () => void;
  replyToCommentId?: number | null;
  onCancelReply?: () => void;
  editCommentId?: number | null;
  initialContent?: string;
  onCancelEdit?: () => void;
  deleteCommentId?: number | null;
  onCancelDelete?: () => void;
};

export default function CommentForm({
  postId,
  postSlug,
  onSuccess,
  replyToCommentId = null,
  onCancelReply,
  editCommentId = null,
  initialContent = '',
  onCancelEdit,
  deleteCommentId = null,
  onCancelDelete,
}: Props) {
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setPassword('');
    setErrorMessage('');
    if (deleteCommentId != null) return;
    if (editCommentId != null) {
      setContent(initialContent);
    } else {
      setContent('');
    }
    setNickname('');
  }, [deleteCommentId, editCommentId, initialContent, replyToCommentId]);

  const submitDelete = (e: React.FormEvent) => {
    e.preventDefault();
    const apiUrl = getApiBase();
    if (deleteCommentId == null || !apiUrl) return;
    const pw = password.trim();
    if (!pw) {
      setErrorMessage('비밀번호를 입력하세요.');
      return;
    }
    setErrorMessage('');
    setStatus('sending');
    fetch(`${apiUrl}/api/comments/${deleteCommentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((data && (data as { error?: string }).error) || r.statusText);
      })
      .then(() => {
        setPassword('');
        setStatus('done');
        onSuccess?.();
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err?.message || '삭제에 실패했습니다.');
      })
      .finally(() => setStatus((s) => (s === 'sending' ? 'idle' : s)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const apiUrl = getApiBase();
    if (!content.trim() || !apiUrl) return;
    const pw = password.trim();
    if (!pw) {
      setErrorMessage('비밀번호를 입력하세요.');
      return;
    }
    setErrorMessage('');
    setStatus('sending');
    const normalized = content.trim();
    const finalContent = editCommentId == null && replyToCommentId != null ? `@댓글${replyToCommentId} ${normalized}` : normalized;
    const url = editCommentId != null ? `${apiUrl}/api/comments/${editCommentId}` : `${apiUrl}/api/comments`;
    const method = editCommentId != null ? 'PUT' : 'POST';
    const body =
      editCommentId != null
        ? { content: finalContent, password: pw }
        : {
            post_id: postId,
            ...(postSlug != null && postSlug !== '' && { post_slug: postSlug }),
            content: finalContent,
            user_id: nickname.trim() || null,
            password: pw,
            password_confirm: pw,
          };
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((data && (data as { error?: string }).error) || r.statusText);
        return data;
      })
      .then(() => {
        setContent('');
        setNickname('');
        setPassword('');
        setStatus('done');
        onSuccess?.();
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err?.message || '전송에 실패했습니다.');
      })
      .finally(() => setStatus((s) => (s === 'sending' ? 'idle' : s)));
  };

  if (deleteCommentId != null) {
    return (
      <form
        onSubmit={submitDelete}
        className="flex flex-col gap-2 [&_label]:text-sm [&_label]:font-sans [&_label]:text-neutral-700 [&_label]:dark:text-neutral-300 [&_input]:w-full [&_input]:!max-w-none [&_input]:p-2 [&_input]:border [&_input]:border-neutral-200 [&_input]:dark:border-neutral-600 [&_input]:rounded-md [&_input]:font-sans [&_input]:bg-white [&_input]:dark:bg-neutral-800 [&_input]:text-neutral-900 [&_input]:dark:text-neutral-100"
      >
        <p className="m-0 text-sm text-neutral-600 dark:text-neutral-400">비밀번호를 입력한 뒤 삭제를 눌러주세요.</p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`comment-delete-pw-${deleteCommentId}`}>비밀번호</label>
          <input
            id={`comment-delete-pw-${deleteCommentId}`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            disabled={status === 'sending'}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={status === 'sending' || !password.trim()}
          className="py-2 px-4 font-sans text-[0.9375rem] text-white bg-red-600 hover:enabled:bg-red-700 border-none rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? '삭제 중…' : '삭제하기'}
        </button>
        {onCancelDelete ? (
          <button
            type="button"
            onClick={onCancelDelete}
            className="py-2 px-4 font-sans text-[0.9375rem] text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
            disabled={status === 'sending'}
          >
            삭제 취소
          </button>
        ) : null}
        {status === 'done' && <span className="text-green-600 dark:text-green-400">삭제되었습니다.</span>}
        {(status === 'error' || errorMessage) && <span className="text-red-600 dark:text-red-400">{errorMessage || '삭제에 실패했습니다.'}</span>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 [&_textarea]:w-full [&_textarea]:max-w-[480px] [&_textarea]:p-2 [&_textarea]:border [&_textarea]:border-neutral-200 [&_textarea]:dark:border-neutral-600 [&_textarea]:rounded-md [&_textarea]:font-sans [&_textarea]:bg-white [&_textarea]:dark:bg-neutral-800 [&_textarea]:text-neutral-900 [&_textarea]:dark:text-neutral-100 [&_input]:max-w-[280px] [&_input]:p-2 [&_input]:border [&_input]:border-neutral-200 [&_input]:dark:border-neutral-600 [&_input]:rounded-md [&_input]:font-sans [&_input]:bg-white [&_input]:dark:bg-neutral-800 [&_input]:text-neutral-900 [&_input]:dark:text-neutral-100 [&_button]:py-2 [&_button]:px-4 [&_button]:font-sans [&_button]:text-[0.9375rem] [&_button]:text-neutral-900 [&_button]:dark:text-neutral-100 [&_button]:bg-neutral-50 [&_button]:dark:bg-neutral-800 [&_button]:border [&_button]:border-neutral-200 [&_button]:dark:border-neutral-600 [&_button]:rounded-md [&_button]:cursor-pointer [&_button]:transition-colors hover:[&_button]:enabled:bg-neutral-100 hover:[&_button]:enabled:dark:bg-neutral-700 hover:[&_button]:enabled:border-neutral-300 hover:[&_button]:enabled:dark:border-neutral-500 [&_button]:disabled:opacity-60 [&_button]:disabled:cursor-not-allowed">
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="닉네임 (선택)"
        disabled={status === 'sending'}
        maxLength={24}
        className="w-full !max-w-none"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="댓글을 입력하세요."
        rows={3}
        disabled={status === 'sending'}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-sans text-neutral-700 dark:text-neutral-300">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          disabled={status === 'sending'}
          className="w-full !max-w-none"
          autoComplete="new-password"
        />
      </div>
      <button type="submit" disabled={status === 'sending' || !content.trim() || !password.trim()}>
        {status === 'sending' ? '전송 중…' : editCommentId != null ? '수정하기' : replyToCommentId != null ? '답글 달기' : '댓글 달기'}
      </button>
      {editCommentId != null && onCancelEdit ? (
        <button
          type="button"
          onClick={onCancelEdit}
          className="py-2 px-4 font-sans text-[0.9375rem] text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
          disabled={status === 'sending'}
        >
          수정 취소
        </button>
      ) : null}
      {replyToCommentId != null && onCancelReply ? (
        <button
          type="button"
          onClick={onCancelReply}
          className="py-2 px-4 font-sans text-[0.9375rem] text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
          disabled={status === 'sending'}
        >
          답글 취소
        </button>
      ) : null}
      {status === 'done' && <span className="text-green-600 dark:text-green-400">등록되었습니다.</span>}
      {(status === 'error' || errorMessage) && <span className="text-red-600 dark:text-red-400">{errorMessage || '전송에 실패했습니다.'}</span>}
    </form>
  );
}
