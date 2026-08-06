import { useEffect, useRef, useState } from 'react';
import { TbBold, TbItalic, TbUnderline } from 'react-icons/tb';
import { FiX } from 'react-icons/fi';
import { getApiBase } from '../lib/apiBase';
import { wrapSelection } from '../lib/textareaFormatting';
import PasswordConfirmModal from './PasswordConfirmModal';

type Props = {
  postId: number;
  postSlug?: string;
  onSuccess?: () => void;
  replyToCommentId?: number | null;
  onCancelReply?: () => void;
  editCommentId?: number | null;
  initialContent?: string;
  onCancelEdit?: () => void;
  /** 연필 아이콘 클릭 시 이미 비밀번호를 확인해둔 경우 — 있으면 제출할 때 모달 없이 바로 이 비밀번호로 전송 */
  editVerifiedPassword?: string;
  /** 있으면 닉네임 라벨과 같은 줄 오른쪽에 닫기(X) 버튼을 렌더링 */
  onRequestClose?: () => void;
};

const TOOLBAR_ITEMS = [
  { marker: '**', placeholder: '굵게 강조할 텍스트', label: '굵게', Icon: TbBold },
  { marker: '*', placeholder: '기울일 텍스트', label: '기울임', Icon: TbItalic },
  { marker: '__', placeholder: '밑줄 그을 텍스트', label: '밑줄', Icon: TbUnderline },
] as const;

export default function CommentForm({
  postId,
  postSlug,
  onSuccess,
  replyToCommentId = null,
  onCancelReply,
  editCommentId = null,
  initialContent = '',
  onCancelEdit,
  editVerifiedPassword,
  onRequestClose,
}: Props) {
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setErrorMessage('');
    setPasswordModalOpen(false);
    setNicknameEditing(false);
    if (editCommentId != null) {
      setContent(initialContent);
    } else {
      setContent('');
    }
    setNickname('');
  }, [editCommentId, initialContent, replyToCommentId]);

  const doSubmit = (pw: string) => {
    const apiUrl = getApiBase();
    if (!content.trim() || !apiUrl) return;
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
        setPasswordModalOpen(false);
        setStatus('done');
        onSuccess?.();
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err?.message || '전송에 실패했습니다.');
      })
      .finally(() => setStatus((s) => (s === 'sending' ? 'idle' : s)));
  };

  return (
    <>
      <div className="flex flex-col gap-1.5 w-full">
        <div className="flex items-center justify-between">
          {nicknameEditing ? (
            <input
              type="text"
              autoFocus
              className="max-w-[140px] py-0.5 px-1 text-left text-sm font-sans bg-transparent border-0 border-b border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 focus:outline-none"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onBlur={() => setNicknameEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setNicknameEditing(false);
                }
              }}
              placeholder="닉네임"
              disabled={status === 'sending'}
              maxLength={24}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNicknameEditing(true)}
              className="py-0.5 px-1 text-sm font-sans bg-transparent border-0 border-b border-transparent cursor-pointer text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {nickname.trim() || '익명'}
            </button>
          )}
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              className="p-1.5 -m-1.5 rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              aria-label="닫기"
            >
              <FiX className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="relative rounded-md bg-white dark:bg-neutral-800">
          <div className="flex items-center gap-0.5 px-1 pt-1">
            {TOOLBAR_ITEMS.map(({ marker, placeholder, label, Icon }) => (
              <button
                key={marker}
                type="button"
                aria-label={label}
                title={label}
                disabled={status === 'sending'}
                className="p-1 rounded text-neutral-500 dark:text-neutral-400 bg-transparent border-none cursor-pointer hover:enabled:bg-neutral-100 dark:hover:enabled:bg-neutral-700 hover:enabled:text-neutral-800 dark:hover:enabled:text-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  wrapSelection(el, content, setContent, marker, placeholder);
                }}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="w-full max-w-none py-1.5 px-2 pb-9 border-none rounded-md font-sans text-sm resize-none bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요."
            rows={3}
            disabled={status === 'sending'}
          />
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
            {editCommentId != null && onCancelEdit ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="py-1 px-2 font-sans text-[0.8125rem] text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
                disabled={status === 'sending'}
              >
                수정 취소
              </button>
            ) : null}
            {replyToCommentId != null && onCancelReply ? (
              <button
                type="button"
                onClick={onCancelReply}
                className="py-1 px-2 font-sans text-[0.8125rem] text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
                disabled={status === 'sending'}
              >
                답글 취소
              </button>
            ) : null}
            <button
              type="button"
              disabled={status === 'sending' || !content.trim()}
              onClick={() => {
                if (!content.trim()) return;
                setErrorMessage('');
                if (editCommentId != null && editVerifiedPassword) {
                  doSubmit(editVerifiedPassword);
                  return;
                }
                setPasswordModalOpen(true);
              }}
              className="py-1.5 px-3 text-[0.8125rem] font-sans text-neutral-900 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-md cursor-pointer transition-colors hover:enabled:bg-neutral-100 hover:enabled:dark:bg-neutral-600 hover:enabled:border-neutral-300 hover:enabled:dark:border-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'sending' ? '전송 중…' : editCommentId != null ? '수정하기' : replyToCommentId != null ? '답글 달기' : '댓글 달기'}
            </button>
          </div>
        </div>

        {status === 'done' && <span className="text-green-600 dark:text-green-400">등록되었습니다.</span>}
        {(status === 'error' || errorMessage) && <span className="text-red-600 dark:text-red-400">{errorMessage || '전송에 실패했습니다.'}</span>}
      </div>
      {passwordModalOpen && (
        <PasswordConfirmModal
          title={editCommentId != null ? '댓글 수정' : '비밀번호 확인'}
          message={editCommentId != null ? '작성 시 입력한 비밀번호를 입력하면 수정됩니다.' : undefined}
          submitLabel={editCommentId != null ? '수정' : '등록'}
          requireConfirm={editCommentId == null}
          sending={status === 'sending'}
          error={errorMessage}
          onCancel={() => {
            if (status === 'sending') return;
            setPasswordModalOpen(false);
          }}
          onConfirm={(pw) => doSubmit(pw)}
        />
      )}
    </>
  );
}
