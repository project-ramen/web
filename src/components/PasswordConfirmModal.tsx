import { useState } from 'react';

interface PasswordConfirmModalProps {
  title?: string;
  /** 제목 아래에 보여줄 설명 문구 */
  message?: string;
  submitLabel?: string;
  /** 새 비밀번호를 정하는 상황(작성)이면 true(기본, 확인란 포함), 기존 비밀번호 검증이면(수정/삭제) false */
  requireConfirm?: boolean;
  /** 삭제처럼 위험한 동작이면 제출 버튼을 빨간색으로 */
  danger?: boolean;
  sending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}

/** 제출 직전 비밀번호(필요 시 확인란도)를 받는 공용 확인 모달. */
export default function PasswordConfirmModal({
  title = '비밀번호 확인',
  message,
  submitLabel = '등록',
  requireConfirm = true,
  danger = false,
  sending = false,
  error,
  onCancel,
  onConfirm,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pw = password.trim();
    if (!pw) {
      setLocalError('비밀번호를 입력하세요.');
      return;
    }
    if (requireConfirm && pw !== passwordConfirm.trim()) {
      setLocalError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setLocalError('');
    onConfirm(pw);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      onClick={sending ? undefined : onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-3 w-full max-w-[320px] bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-xl"
      >
        <h3 className="m-0 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        {message && <p className="m-0 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}
        <input
          type="password"
          autoFocus
          className="w-full py-2 px-2.5 border border-neutral-200 dark:border-neutral-600 rounded-md font-sans text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          disabled={sending}
          autoComplete={requireConfirm ? 'new-password' : 'current-password'}
        />
        {requireConfirm && (
          <input
            type="password"
            className="w-full py-2 px-2.5 border border-neutral-200 dark:border-neutral-600 rounded-md font-sans text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="비밀번호 확인"
            disabled={sending}
            autoComplete="new-password"
          />
        )}
        {(localError || error) && (
          <p className="m-0 text-xs text-red-600 dark:text-red-400">{localError || error}</p>
        )}
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="py-1.5 px-3 text-sm font-sans text-neutral-500 dark:text-neutral-400 bg-transparent border-none rounded-md cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={sending}
            className={
              danger
                ? 'py-1.5 px-3 text-sm font-sans text-white bg-red-600 hover:enabled:bg-red-700 border-none rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                : 'py-1.5 px-3 text-sm font-sans text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 border-none rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
            }
          >
            {sending ? '전송 중…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
