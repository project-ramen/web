import { useState } from 'react';

const API_URL = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000') : '';

/** 댓글이 참조하던 구간이 삭제된 경우 표시. "자세히 보기" 시 해당 리비전 내용 일부(위 3줄/해당/아래 3줄) 표시 */
type Props = { revisionId: number; anchorLabel?: string };

export default function DeletedSectionNotice({ revisionId, anchorLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = () => {
    if (!API_URL || open) return;
    setLoading(true);
    fetch(`${API_URL}/api/revisions/${revisionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rev: { body_md?: string } | null) => {
        if (!rev?.body_md) {
          setSnippet('(내용 없음)');
          return;
        }
        const lines = rev.body_md.split('\n');
        // 간단히 위 3줄 + ... + 아래 3줄 (실제로는 앵커 위치 기준으로 잘라야 함)
        const top = lines.slice(0, 3).join('\n');
        const bottom = lines.slice(-3).join('\n');
        setSnippet([top, '...', bottom].join('\n'));
      })
      .finally(() => setLoading(false));
    setOpen(true);
  };

  return (
    <div className="deleted-section-notice">
      <span className="label">삭제된 부분입니다.</span>
      <button type="button" className="link" onClick={loadPreview} disabled={loading}>
        지워진 부분 자세히 보기
      </button>
      {open && snippet !== null && (
        <pre className="revision-snippet">{snippet}</pre>
      )}
    </div>
  );
}
