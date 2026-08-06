// 댓글 본문의 굵게(**)/기울임(*)/밑줄(__)만 안전하게 파싱해서 렌더링 (댓글은 마크다운 전체를 지원하지 않음)
const INLINE_FORMAT_RE = /\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__/g;

export function renderInlineFormatting(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  INLINE_FORMAT_RE.lastIndex = 0;
  while ((match = INLINE_FORMAT_RE.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={key++}>{match[2]}</em>);
    else if (match[3] !== undefined) nodes.push(<u key={key++}>{match[3]}</u>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
