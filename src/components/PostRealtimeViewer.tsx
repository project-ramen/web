import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { FiAtSign, FiChevronDown, FiEdit2, FiTrash2 } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { CodeBlockWithCopy } from './CodeBlockWithCopy';
import { getApiBase } from '../lib/apiBase';
import remarkWikilinks from '../lib/remarkWikilinks';

/** Parse title "width:50%" → style (same as app). */
function imageWidthStyle(title: string | undefined): React.CSSProperties | undefined {
  if (!title || typeof title !== 'string') return undefined;
  const m = title.match(/^width:\s*(.+)$/i);
  if (!m) return undefined;
  const value = m[1].trim();
  return value ? { width: value, maxWidth: '100%' } : undefined;
}

/** 빈 줄·블록 경계 보존: 블록 끝에 \n을 넣어 raw 마크다운과 DOM 텍스트 순서를 맞춤 (커서/선택 싱크용) */
const blockWithNewline = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
  function Block({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) {
    return <Tag {...rest}>{children ?? ''}{'\n'}</Tag>;
  };

const markdownComponents: Components = {
  p: blockWithNewline('p'),
  h1: blockWithNewline('h1'),
  h2: blockWithNewline('h2'),
  h3: blockWithNewline('h3'),
  h4: blockWithNewline('h4'),
  h5: blockWithNewline('h5'),
  h6: blockWithNewline('h6'),
  pre: CodeBlockWithCopy,
  table: ({ children, ...rest }) => (
    <div className="table-scroll-wrapper">
      <table {...rest}>{children}</table>
    </div>
  ),
  img: ({ src, alt, title, style: restStyle, ...rest }) => {
    const widthStyle = imageWidthStyle(title);
    const displayTitle = widthStyle ? undefined : title;
    return (
      <img
        src={src}
        alt={alt ?? ''}
        title={displayTitle}
        style={widthStyle ? { ...restStyle, ...widthStyle } : restStyle}
        {...rest}
      />
    );
  },
};

const ANCHOR_POPUP_WIDTH = 320;
const ANCHOR_GUTTER_RESERVED_WIDTH = 40; // w-8(32px) + ml-2(8px)

/** 렌더된 DOM에서 텍스트 노드별 (node, offset) 목록을 문서 순으로 수집 */
function collectRenderedCharPositions(root: Node): { node: Text; offset: number }[] {
  const out: { node: Text; offset: number }[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).textContent || '';
      for (let i = 0; i < text.length; i++) out.push({ node: node as Text, offset: i });
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  }
  walk(root);
  return out;
}

/** raw 마크다운 인덱스 → 렌더된 문자 인덱스 매핑 생성 (렌더 텍스트 = 마크다운 문법 제거) */
function buildRawToRenderedMapping(
  raw: string,
  renderedPositions: { node: Text; offset: number }[]
): number[] {
  const rawIndexForRendered: number[] = [];
  let rawIdx = 0;
  for (let i = 0; i < renderedPositions.length; i++) {
    const { node, offset } = renderedPositions[i];
    const c = (node.textContent || '')[offset];
    while (rawIdx < raw.length && raw[rawIdx] !== c) rawIdx++;
    rawIndexForRendered.push(rawIdx);
    if (rawIdx < raw.length) rawIdx++;
  }
  return rawIndexForRendered;
}

/** 노드 서브트리 내 텍스트 길이 (문자 수) */
function countTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).textContent?.length ?? 0;
  let n = 0;
  for (let i = 0; i < node.childNodes.length; i++) n += countTextLength(node.childNodes[i]);
  return n;
}

/**
 * root 기준 문서 순서로 (targetNode, targetOffset) 직전까지의 문자 개수를 반환.
 * targetNode가 텍스트 노드면 offset은 문자 인덱스, 요소면 offset은 자식 인덱스.
 * 코드 블록·표·여러 줄 선택 등 요소 경계에서도 동작.
 */
function getCharacterOffsetBefore(root: Node, targetNode: Node, targetOffset: number): number {
  let count = 0;
  function walk(node: Node): boolean {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        count += Math.min(Math.max(0, targetOffset), (node as Text).textContent?.length ?? 0);
        return true;
      }
      for (let i = 0; i < targetOffset && i < node.childNodes.length; i++)
        count += countTextLength(node.childNodes[i]);
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += (node as Text).textContent?.length ?? 0;
      return false;
    }
    for (let i = 0; i < node.childNodes.length; i++)
      if (walk(node.childNodes[i])) return true;
    return false;
  }
  walk(root);
  return count;
}

/** 선택 영역(Range)을 렌더된 문자 인덱스 [start, end]로 변환. 요소 노드(코드블록·표 등) 경계도 처리 */
function getRenderedIndicesFromRange(root: Node, range: Range): [number, number] | null {
  const a = getCharacterOffsetBefore(root, range.startContainer, range.startOffset);
  const b = getCharacterOffsetBefore(root, range.endContainer, range.endOffset);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (start >= end) return null;
  return [start, end];
}

/** 선택이 표 또는 코드 블록(pre/code) 안에 있는지 */
function isSelectionInTableOrCodeBlock(range: Range): boolean {
  const el = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? (range.commonAncestorContainer as Element)
    : (range.commonAncestorContainer as Node).parentElement;
  return !!el?.closest?.('td, th, pre, code');
}

/** 코드 블록·표: 선택 텍스트를 raw에서 찾아 [rawStart, rawEnd] 반환. 없으면 null */
function getRawRangeFromSelectedText(content: string, range: Range): [number, number] | null {
  const selectedText = range.toString();
  if (!selectedText) return null;
  const idx = content.indexOf(selectedText);
  if (idx >= 0) return [idx, idx + selectedText.length];
  return null;
}

/**
 * 표/코드 블록 내 앵커(댓글)의 Y 위치를 해당 블록 DOM에서 직접 구함.
 * 전역 positions 매핑은 표/코드에서 raw 순서가 달라 잘못된 위치를 가리킬 수 있음.
 */
function getAnchorTopFromTableOrCodeBlock(
  article: HTMLElement,
  content: string,
  start: number,
  end: number,
  wrap: HTMLElement
): number | null {
  const snippet = content.slice(start, end);
  if (!snippet) return null;
  const blocks = article.querySelectorAll('table, pre');
  for (const block of blocks) {
    const positions = collectRenderedCharPositions(block);
    if (positions.length === 0) continue;
    const fullText = positions.map((p) => (p.node.textContent ?? '')[p.offset]).join('');
    const idx = fullText.indexOf(snippet);
    if (idx < 0) continue;
    const startPos = positions[idx];
    const endIdx = Math.min(idx + snippet.length, positions.length);
    const endPos = positions[endIdx - 1];
    if (!startPos || !endPos) continue;
    try {
      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      const maxEnd = (endPos.node.textContent ?? '').length;
      range.setEnd(endPos.node, Math.min(endPos.offset + 1, maxEnd));
      const rect = range.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      return rect.top - wrapRect.top + wrap.scrollTop + rect.height / 2;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

export type AnchorComment = {
  id: number;
  start_anchor: string | null;
  end_anchor: string | null;
  content?: string;
  created_at?: string;
  referenced_snippet?: string | null;
  referenced_text?: string | null;
};
export type PostRealtimeViewerProps = {
  slug: string;
  initialContent?: string;
  postId?: number;
  anchorComments?: AnchorComment[];
  onSelectionCommentSuccess?: () => void;
  onEditAnchorComment?: (commentId: number) => void;
  onDeleteAnchorComment?: (commentId: number) => void;
};

/** raw 인덱스 → 렌더된 인덱스 (rawIndexForRendered[i] <= raw 인 최대 i) */
function renderedIndexFromRaw(rawIndexForRendered: number[], rawIndex: number): number {
  let i = rawIndexForRendered.length - 1;
  while (i >= 0 && rawIndexForRendered[i] > rawIndex) i--;
  return Math.max(0, i);
}

/** 구간 [start, end]가 겹치는 앳글들을 그룹으로 묶음. 각 그룹은 AnchorComment[] */
function groupOverlappingAnchors(comments: AnchorComment[]): AnchorComment[][] {
  const withRange = comments
    .map((c) => {
      const start = parseInt(c.start_anchor ?? '', 10);
      const end = parseInt(c.end_anchor ?? '', 10);
      return { c, start: Number.isNaN(start) ? 0 : start, end: Number.isNaN(end) ? 0 : end };
    })
    .filter(({ start, end }) => start < end)
    .sort((a, b) => a.start - b.start);
  if (withRange.length === 0) return comments.map((c) => [c]);
  const groups: AnchorComment[][] = [];
  let current: { c: AnchorComment; start: number; end: number }[] = [withRange[0]];
  for (let i = 1; i < withRange.length; i++) {
    const prev = current[current.length - 1];
    if (withRange[i].start < prev.end) {
      current.push(withRange[i]);
    } else {
      groups.push(current.map((x) => x.c));
      current = [withRange[i]];
    }
  }
  groups.push(current.map((x) => x.c));
  const groupedIds = new Set(groups.flatMap((g) => g.map((c) => c.id)));
  comments.filter((c) => !groupedIds.has(c.id)).forEach((c) => groups.push([c]));
  return groups;
}

export default function PostRealtimeViewer({
  slug,
  initialContent = '',
  postId,
  anchorComments = [],
  onSelectionCommentSuccess,
  onEditAnchorComment,
  onDeleteAnchorComment,
}: PostRealtimeViewerProps) {
  const [content, setContent] = useState(initialContent);
  const [anchorPositions, setAnchorPositions] = useState<Map<number, { top: number }>>(new Map());
  const [hoveredAnchorRange, setHoveredAnchorRange] = useState<{ start: number; end: number } | null>(null);
  const [hoveredHighlightRects, setHoveredHighlightRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  const [hoveredHighlightWrapHeight, setHoveredHighlightWrapHeight] = useState(0);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [useInlineAnchorPopup, setUseInlineAnchorPopup] = useState(false);
  const [hideAnchorGutter, setHideAnchorGutter] = useState(false);
  const [fallbackPopupPos, setFallbackPopupPos] = useState<{ groupKey: string; top: number; left: number } | null>(null);
  const [expandedSnippetId, setExpandedSnippetId] = useState<number | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{
    start: number;
    end: number;
    x: number;
    y: number;
    bottom: number;
  } | null>(null);
  const [selectionCommentDraft, setSelectionCommentDraft] = useState('');
  const [selectionCommentNickname, setSelectionCommentNickname] = useState('');
  const [selectionCommentPassword, setSelectionCommentPassword] = useState('');
  const [selectionCommentPasswordConfirm, setSelectionCommentPasswordConfirm] = useState('');
  const [selectionCommentSending, setSelectionCommentSending] = useState(false);
  const [selectionFormOpen, setSelectionFormOpen] = useState(false);
  const [selectionCommentError, setSelectionCommentError] = useState('');
  const contentArticleRef = useRef<HTMLElement>(null);
  const selectionMirrorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 초기 정적 본문 반영
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // 드래그(선택) 후 마우스 업 시 댓글 쓰기 메뉴 표시 (postId 있을 때만)
  // 클릭으로 선택 해제할 때는 한 틱 뒤에 선택이 비므로, 그때 다시 확인해 메뉴를 띄우지 않음
  useEffect(() => {
    if (typeof document === 'undefined' || !postId) return;
    const onMouseUp = (e: MouseEvent) => {
      const mouseUpTarget = e.target as Element | null;
      // 메뉴 안을 클릭한 경우 지연 검사 자체를 하지 않음 → 댓글 쓰기 버튼 눌렀을 때 깜빡임 방지
      if (mouseUpTarget?.closest?.('.selection-comment-menu') || mouseUpTarget?.closest?.('.selection-comment-form')) return;

      const runAfterClickSettle = () => {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) {
          setSelectionMenu(null);
          setSelectionFormOpen(false);
          return;
        }
      const article = contentArticleRef.current;
      const wrap = wrapRef.current;
      if (!article || !wrap || !content) {
        setSelectionMenu(null);
        return;
      }
        if (!article.contains(sel.anchorNode) || !article.contains(sel.focusNode)) {
          setSelectionMenu(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const inTableOrCode = isSelectionInTableOrCodeBlock(range);
        let rawStart = -1;
        let rawEnd = -1;
        if (inTableOrCode) {
          const fallback = getRawRangeFromSelectedText(content, range);
          if (fallback) {
            rawStart = fallback[0];
            rawEnd = fallback[1];
          }
        }
        if (rawStart < 0) {
          const rendered = getRenderedIndicesFromRange(article, range);
          if (rendered) {
            const [renderedStart, renderedEnd] = rendered;
            const positions = collectRenderedCharPositions(article);
            if (positions.length > 0) {
              const rawIndexForRendered = buildRawToRenderedMapping(content, positions);
              rawStart = rawIndexForRendered[Math.min(renderedStart, rawIndexForRendered.length - 1)] ?? 0;
              rawEnd =
                renderedEnd >= rawIndexForRendered.length
                  ? content.length
                  : (rawIndexForRendered[renderedEnd] ?? content.length);
            }
          }
        }
        if (rawStart < 0 || rawEnd <= rawStart) {
          if (!inTableOrCode) {
            setSelectionMenu(null);
            return;
          }
          const fallback = getRawRangeFromSelectedText(content, range);
          if (fallback) {
            rawStart = fallback[0];
            rawEnd = fallback[1];
          }
        }
        if (rawStart < 0 || rawEnd <= rawStart) {
          setSelectionMenu(null);
          return;
        }
        const rect = range.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        setSelectionMenu({
          start: rawStart,
          end: rawEnd,
          x: rect.left - wrapRect.left + wrap.scrollLeft + rect.width / 2,
          y: rect.top - wrapRect.top + wrap.scrollTop - 8,
          bottom: rect.bottom - wrapRect.top + wrap.scrollTop,
        });
        setSelectionCommentDraft('');
        setSelectionCommentNickname('');
        setSelectionCommentPassword('');
        setSelectionCommentPasswordConfirm('');
        setSelectionFormOpen(false);
        setSelectionCommentError('');
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(runAfterClickSettle);
      });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [content, postId]);

  // 메뉴 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!selectionMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.selection-comment-menu') && !(e.target as Element).closest('.selection-comment-form')) {
        setSelectionMenu(null);
        setSelectionFormOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [selectionMenu]);

  // 앳글 팝오버 외부 클릭 시 닫기
  useEffect(() => {
    if (expandedGroupKey == null) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.at-article-marker-wrap')) {
        setExpandedGroupKey(null);
        setExpandedSnippetId(null);
        setFallbackPopupPos(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expandedGroupKey]);

  // 본문 오른쪽 남은 너비가 댓글창 너비 이하이면 줄 아래 팝업 모드로 전환
  useEffect(() => {
    const checkAnchorPopupMode = () => {
      const article = contentArticleRef.current;
      if (!article) return;
      const articleRect = article.getBoundingClientRect();
      const rightSpace = Math.max(0, window.innerWidth - articleRect.right);
      const popupSpace = Math.max(0, rightSpace - ANCHOR_GUTTER_RESERVED_WIDTH);
      setHideAnchorGutter(popupSpace < ANCHOR_POPUP_WIDTH);
      setUseInlineAnchorPopup(popupSpace <= ANCHOR_POPUP_WIDTH);
    };

    checkAnchorPopupMode();
    window.addEventListener('resize', checkAnchorPopupMode);
    window.addEventListener('scroll', checkAnchorPopupMode, true);
    return () => {
      window.removeEventListener('resize', checkAnchorPopupMode);
      window.removeEventListener('scroll', checkAnchorPopupMode, true);
    };
  }, [content]);

  useEffect(() => {
    if (!hideAnchorGutter) return;
    setExpandedGroupKey(null);
    setExpandedSnippetId(null);
    setFallbackPopupPos(null);
    setHoveredAnchorRange(null);
  }, [hideAnchorGutter]);

  // 앳글(위치 댓글) Y 위치 계산 → 오른쪽 거터에 표시용
  useLayoutEffect(() => {
    if (anchorComments.length === 0 || !content) {
      setAnchorPositions(new Map());
      return;
    }
    const article = contentArticleRef.current;
    const wrap = wrapRef.current;
    if (!article || !wrap) return;
    const positions = collectRenderedCharPositions(article);
    if (positions.length === 0) return;
    const rawIndexForRendered = buildRawToRenderedMapping(content, positions);
    const wrapRect = wrap.getBoundingClientRect();
    const next = new Map<number, { top: number }>();
    for (const c of anchorComments) {
      const start = parseInt(c.start_anchor ?? '', 10);
      const end = parseInt(c.end_anchor ?? '', 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) continue;
      // 표/코드 블록 안의 앵커는 전역 매핑이 잘못될 수 있으므로, 해당 블록 DOM에서 직접 위치 계산
      const tableOrCodeTop = getAnchorTopFromTableOrCodeBlock(article, content, start, end, wrap);
      if (tableOrCodeTop != null) {
        next.set(c.id, { top: tableOrCodeTop });
        continue;
      }
      const renderedStart = renderedIndexFromRaw(rawIndexForRendered, start);
      const renderedEnd = renderedIndexFromRaw(rawIndexForRendered, Math.min(end, content.length));
      const startPos = positions[renderedStart];
      const endPos = positions[Math.min(renderedEnd, positions.length - 1)];
      if (!startPos || !endPos) continue;
      try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        const maxEnd = (endPos.node.textContent || '').length;
        range.setEnd(endPos.node, Math.min(endPos.offset + 1, maxEnd));
        const rect = range.getBoundingClientRect();
        const top = rect.top - wrapRect.top + wrap.scrollTop + rect.height / 2;
        next.set(c.id, { top });
      } catch (_) {
        // ignore
      }
    }
    setAnchorPositions(next);
  }, [content, anchorComments]);

  // 댓글 목록 호버 시 해당 구간 하이라이트용 rect 계산
  useLayoutEffect(() => {
    if (!hoveredAnchorRange || !content) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
      return;
    }
    const article = contentArticleRef.current;
    const wrap = wrapRef.current;
    if (!article || !wrap) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
      return;
    }
    setHoveredHighlightWrapHeight(wrap.scrollHeight);
    const { start, end } = hoveredAnchorRange;
    if (start >= end) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
      return;
    }
    const positions = collectRenderedCharPositions(article);
    if (positions.length === 0) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
      return;
    }
    const rawIndexForRendered = buildRawToRenderedMapping(content, positions);
    const wrapRect = wrap.getBoundingClientRect();
    // 표/코드 블록 안이면 해당 블록 DOM에서 범위 찾기
    const snippet = content.slice(start, end);
    if (snippet) {
      const blocks = article.querySelectorAll('table, pre');
      for (const block of blocks) {
        const blockPositions = collectRenderedCharPositions(block);
        if (blockPositions.length === 0) continue;
        const fullText = blockPositions.map((p) => (p.node.textContent ?? '')[p.offset]).join('');
        const idx = fullText.indexOf(snippet);
        if (idx < 0) continue;
        const startPos = blockPositions[idx];
        const endIdx = Math.min(idx + snippet.length, blockPositions.length);
        const endPos = blockPositions[endIdx - 1];
        if (!startPos || !endPos) continue;
        try {
          const range = document.createRange();
          range.setStart(startPos.node, startPos.offset);
          const maxEnd = (endPos.node.textContent ?? '').length;
          range.setEnd(endPos.node, Math.min(endPos.offset + 1, maxEnd));
          const rects = Array.from(range.getClientRects());
          const overlayRects = rects
            .filter((r) => r.width > 0 || r.height > 0)
            .map((r) => ({
              left: r.left - wrapRect.left + wrap.scrollLeft,
              top: r.top - wrapRect.top + wrap.scrollTop,
              width: r.width,
              height: r.height,
            }));
          setHoveredHighlightRects(overlayRects);
          setHoveredHighlightWrapHeight(wrap.scrollHeight);
          return;
        } catch (_) {
          // ignore
        }
      }
    }
    // 일반 텍스트: 전역 매핑으로 범위 계산
    const renderedStart = renderedIndexFromRaw(rawIndexForRendered, start);
    const renderedEnd = renderedIndexFromRaw(rawIndexForRendered, Math.min(end, content.length));
    const startPos = positions[renderedStart];
    const endPos = positions[Math.min(renderedEnd, positions.length - 1)];
    if (!startPos || !endPos) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
      return;
    }
    try {
      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      const maxEnd = (endPos.node.textContent || '').length;
      range.setEnd(endPos.node, Math.min(endPos.offset + 1, maxEnd));
      const rects = Array.from(range.getClientRects());
      const overlayRects = rects
        .filter((r) => r.width > 0 || r.height > 0)
        .map((r) => ({
          left: r.left - wrapRect.left + wrap.scrollLeft,
          top: r.top - wrapRect.top + wrap.scrollTop,
          width: r.width,
          height: r.height,
        }));
      setHoveredHighlightRects(overlayRects);
      setHoveredHighlightWrapHeight(wrap.scrollHeight);
    } catch (_) {
      setHoveredHighlightRects([]);
      setHoveredHighlightWrapHeight(0);
    }
  }, [content, hoveredAnchorRange]);

  const viewerContentProse =
    'leading-[1.7] markdown-content [&_.empty]:text-gray-400 [&_.empty]:italic';

  return (
    <div className="mt-4">
      <div className="flex items-stretch gap-0">
        <div ref={wrapRef} className="relative flex-1 min-w-0">
        <article ref={contentArticleRef} className={`flow-root ${viewerContentProse}`}>
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkWikilinks]} rehypePlugins={[rehypeRaw, rehypeHighlight]} components={markdownComponents}>{content}</ReactMarkdown>
          ) : (
            <p className="empty">아직 내용이 없습니다. 글쓰기 앱에서 이 포스트를 열어 작성해 보세요.</p>
          )}
        </article>
        {/* 댓글 목록 호버 시 해당 구간 하이라이트 */}
        {hoveredHighlightRects.length > 0 && (
          <div
            className="absolute left-0 top-0 w-full z-[2] pointer-events-none overflow-hidden"
            style={{ minHeight: hoveredHighlightWrapHeight }}
            aria-hidden
          >
            {hoveredHighlightRects.map((r, i) => (
              <div
                key={i}
                className="absolute rounded-[2px]"
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                  backgroundColor: 'rgba(250, 204, 21, 0.4)',
                }}
              />
            ))}
          </div>
        )}
        {/* 선택 → raw 인덱스 매핑용 숨김 미러 (드래그 댓글 메뉴용) */}
        {postId != null && content ? (
          <div
            ref={selectionMirrorRef}
            className={`viewer-content selection-mirror-hidden absolute left-0 top-0 invisible pointer-events-none w-full h-0 overflow-hidden ${viewerContentProse}`}
            aria-hidden
          >
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkWikilinks]} rehypePlugins={[rehypeRaw, rehypeHighlight]} components={markdownComponents}>{content}</ReactMarkdown>
          </div>
        ) : null}
        {selectionMenu && postId != null && (
          <>
            <div
              className="selection-comment-menu absolute z-10 -translate-x-1/2 -translate-y-full -mt-1"
              style={{
                left: selectionMenu.x,
                top: selectionMenu.y,
              }}
            >
              <button
                type="button"
                className="py-1.5 px-3 text-sm font-sans text-neutral-900 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-md cursor-pointer whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-500"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectionFormOpen((o) => !o);
                }}
                aria-expanded={selectionFormOpen}
              >
                댓글 쓰기
              </button>
            </div>
            {selectionFormOpen && (
              <div
                className="selection-comment-form absolute left-0 right-0 z-10 w-full mt-2"
                style={{ top: selectionMenu.bottom + 8 }}
              >
                <div className="flex flex-col gap-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-md p-2 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] w-full">
                  <textarea
                    className="w-full py-1.5 px-1.5 border border-neutral-200 dark:border-neutral-500 rounded font-sans text-sm resize-y bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                    value={selectionCommentDraft}
                    onChange={(e) => setSelectionCommentDraft(e.target.value)}
                    placeholder="댓글 입력..."
                    rows={2}
                    disabled={selectionCommentSending}
                  />
                  <input
                    type="text"
                    className="w-full py-1.5 px-1.5 border border-neutral-200 dark:border-neutral-500 rounded font-sans text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                    value={selectionCommentNickname}
                    onChange={(e) => setSelectionCommentNickname(e.target.value)}
                    placeholder="닉네임 (선택)"
                    disabled={selectionCommentSending}
                    maxLength={24}
                  />
                  <div className="flex flex-row gap-2">
                    <input
                      type="password"
                      className="flex-1 min-w-0 py-1.5 px-1.5 border border-neutral-200 dark:border-neutral-500 rounded font-sans text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                      value={selectionCommentPassword}
                      onChange={(e) => setSelectionCommentPassword(e.target.value)}
                      placeholder="비밀번호"
                      disabled={selectionCommentSending}
                      autoComplete="new-password"
                    />
                    <input
                      type="password"
                      className="flex-1 min-w-0 py-1.5 px-1.5 border border-neutral-200 dark:border-neutral-500 rounded font-sans text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                      value={selectionCommentPasswordConfirm}
                      onChange={(e) => setSelectionCommentPasswordConfirm(e.target.value)}
                      placeholder="비밀번호 확인"
                      disabled={selectionCommentSending}
                      autoComplete="new-password"
                    />
                  </div>
                  {selectionCommentError ? (
                    <p className="text-[0.8125rem] text-red-600 dark:text-red-400">{selectionCommentError}</p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="py-1.5 px-2.5 text-[0.8125rem] bg-transparent border-none text-neutral-500 dark:text-neutral-400 cursor-pointer font-sans hover:text-neutral-900 dark:hover:text-neutral-100"
                      onClick={() => {
                        setSelectionMenu(null);
                        setSelectionCommentDraft('');
                        setSelectionCommentNickname('');
                        setSelectionCommentPassword('');
                        setSelectionCommentPasswordConfirm('');
                        setSelectionFormOpen(false);
                        setSelectionCommentError('');
                      }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="py-1.5 px-2.5 text-[0.8125rem] font-sans text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded cursor-pointer hover:enabled:bg-neutral-200 dark:hover:enabled:bg-neutral-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={
                        selectionCommentSending ||
                        !selectionCommentDraft.trim() ||
                        !selectionCommentPassword.trim() ||
                        selectionCommentPassword !== selectionCommentPasswordConfirm
                      }
                      onClick={async () => {
                        if (!getApiBase() || !selectionCommentDraft.trim()) return;
                        const pw = selectionCommentPassword.trim();
                        const pwConfirm = selectionCommentPasswordConfirm.trim();
                        if (!pw) {
                          setSelectionCommentError('비밀번호를 입력하세요.');
                          return;
                        }
                        if (pw !== pwConfirm) {
                          setSelectionCommentError('비밀번호가 일치하지 않습니다.');
                          return;
                        }
                        setSelectionCommentError('');
                        setSelectionCommentSending(true);
                        try {
                          const r = await fetch(`${getApiBase()}/api/comments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              post_id: postId,
                              post_slug: slug,
                              content: selectionCommentDraft.trim(),
                              user_id: selectionCommentNickname.trim() || null,
                              start_anchor: String(selectionMenu.start),
                              end_anchor: String(selectionMenu.end),
                              password: pw,
                              password_confirm: pwConfirm,
                            }),
                          });
                          const data = await r.json().catch(() => ({}));
                          if (!r.ok) throw new Error(data?.error || r.statusText);
                          setSelectionMenu(null);
                          setSelectionCommentDraft('');
                          setSelectionCommentNickname('');
                          setSelectionCommentPassword('');
                          setSelectionCommentPasswordConfirm('');
                          setSelectionFormOpen(false);
                          onSelectionCommentSuccess?.();
                        } catch (err) {
                          setSelectionCommentError(err instanceof Error ? err.message : '전송에 실패했습니다.');
                        } finally {
                          setSelectionCommentSending(false);
                        }
                      }}
                    >
                      {selectionCommentSending ? '전송 중…' : '등록'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
        {!hideAnchorGutter && (
          <div className="at-article-gutter shrink-0 w-8 relative ml-2" aria-label="앳글 위치">
            {groupOverlappingAnchors(anchorComments).map((group) => {
            const firstPos = anchorPositions.get(group[0].id);
            if (firstPos == null) return null;
            const groupKey = group.length === 1 ? String(group[0].id) : group.map((c) => c.id).sort((a, b) => a - b).join('-');
            const isExpanded = expandedGroupKey === groupKey;
            const renderCommentBlock = (c: AnchorComment) => {
              const start = parseInt(c.start_anchor ?? '', 10);
              const end = parseInt(c.end_anchor ?? '', 10);
              const hasReferenced = c.referenced_text != null && !Number.isNaN(start) && !Number.isNaN(end);
              const currentSlice = hasReferenced && content.length >= end ? content.slice(start, end) : null;
              const isModified = hasReferenced && (currentSlice === null || currentSlice !== c.referenced_text);
              const showSnippet = expandedSnippetId === c.id;
              const commentContent = (
                <>
                  <p className="m-0 mb-1.5 text-sm leading-normal whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100">{c.content || '(내용 없음)'}</p>
                  {c.created_at && (
                    <span className="block mt-1 text-xs text-neutral-500 dark:text-neutral-400">{c.created_at}</span>
                  )}
                </>
              );
              const actionButtons = (onEditAnchorComment || onDeleteAnchorComment) ? (
                <div className="shrink-0 flex items-center gap-0.5">
                  {onEditAnchorComment ? (
                    <button
                      type="button"
                      onClick={() => onEditAnchorComment(c.id)}
                      className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                      aria-label="댓글 수정"
                    >
                      <FiEdit2 className="w-4 h-4" aria-hidden />
                    </button>
                  ) : null}
                  {onDeleteAnchorComment ? (
                    <button
                      type="button"
                      onClick={() => onDeleteAnchorComment(c.id)}
                      className="p-1.5 rounded text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      aria-label="댓글 삭제"
                    >
                      <FiTrash2 className="w-4 h-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : null;
              if (isModified) {
                return (
                  <div key={c.id} className="w-full py-2.5 mt-2 pt-2s [li:first-child_&]:mt-0 [li:first-child_&]:pt-0 [li:first-child_&]:border-t-0 opacity-90 box-border">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-400 [&_p]:text-[0.8125rem] [&_span]:text-[0.7rem] [&_span]:text-neutral-500 dark:[&_span]:text-neutral-400">
                        {commentContent}
                      </div>
                      {actionButtons}
                    </div>

                    <div className="w-full py-1 px-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg box-border">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 m-0 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-transparent border-none rounded-none cursor-pointer no-underline font-sans transition-colors hover:text-neutral-500 dark:hover:text-neutral-400 ${showSnippet ? 'text-neutral-500 dark:text-neutral-400' : ''}`}
                        onClick={() => setExpandedSnippetId((id) => (id === c.id ? null : c.id))}
                        title={showSnippet ? '접기' : '자세히 보기'}
                        aria-label={showSnippet ? '접기' : '자세히 보기'}
                        aria-expanded={showSnippet}
                      >
                        <FiChevronDown className={`inline-flex shrink-0 text-[0.75em] leading-none transition-transform duration-200 [&_svg]:w-[1em] [&_svg]:h-[1em] ${showSnippet ? '-rotate-180' : ''}`} aria-hidden />
                        자세히 보기
                      </button>
                      {showSnippet && c.referenced_snippet != null && (
                        <div className="w-full mt-2 mb-0 py-2 box-border">
                          <pre className="m-0 p-0 w-full text-xs leading-[1.4] overflow-auto max-h-32 whitespace-pre-wrap break-words box-border text-neutral-900 dark:text-neutral-100 bg-transparent">
                            {c.referenced_text != null && c.referenced_text !== ''
                              ? (() => {
                                  const parts = c.referenced_snippet!.split(c.referenced_text!);
                                  if (parts.length === 2) {
                                    return (
                                      <>
                                        {parts[0]}
                                        <span className="bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 py-0 px-0.5 rounded-sm">{c.referenced_text}</span>
                                        {parts[1]}
                                      </>
                                    );
                                  }
                                  return c.referenced_snippet;
                                })()
                              : c.referenced_snippet}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={c.id} className="m-0 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">{commentContent}</div>
                  {actionButtons}
                </div>
              );
            };
            return (
              <div key={groupKey} className="at-article-marker-wrap absolute left-0 -translate-y-1/2 z-[5]" style={{ top: firstPos.top }}>
                <button
                  type="button"
                  className={`relative w-[1.35rem] h-[1.35rem] p-0 inline-flex items-center justify-center text-xs font-semibold text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-full cursor-pointer transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300 dark:hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 ${isExpanded ? 'text-neutral-900 dark:text-neutral-100 border-neutral-400 dark:border-neutral-500 bg-neutral-100 dark:bg-neutral-700' : ''} ${group.length > 1 ? 'font-bold' : ''}`}
                  title={group.length > 1 ? `해당 구간 댓글 ${group.length}개` : (group[0].content ?? '해당 구간 댓글')}
                  aria-label={group.length > 1 ? `해당 구간 댓글 ${group.length}개` : `해당 구간 댓글: ${(group[0].content ?? '').slice(0, 30)}`}
                  aria-expanded={isExpanded}
                  onClick={(e) => {
                    const nextExpanded = expandedGroupKey === groupKey ? null : groupKey;
                    setExpandedGroupKey(nextExpanded);
                    if (nextExpanded == null) {
                      setFallbackPopupPos(null);
                      setExpandedSnippetId(null);
                      setHoveredAnchorRange(null);
                      return;
                    }
                    if (useInlineAnchorPopup) {
                      const btnRect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const popupWidth = Math.min(320, Math.max(240, window.innerWidth - 32));
                      const left = Math.min(
                        Math.max(16, btnRect.left - popupWidth / 2),
                        Math.max(16, window.innerWidth - popupWidth - 16)
                      );
                      setFallbackPopupPos({
                        groupKey,
                        top: btnRect.bottom + 8,
                        left,
                      });
                    } else {
                      setFallbackPopupPos(null);
                    }
                  }}
                >
                  <FiAtSign className="inline-flex shrink-0 [&_svg]:w-[0.75em] [&_svg]:h-[0.75em]" aria-hidden />
                  {group.length > 1 && <span className="absolute -top-0.5 -right-0.5 min-w-[0.875rem] h-[0.875rem] py-0 px-0.5 text-[0.6rem] leading-[0.875rem] text-white bg-red-600 rounded-lg inline-flex items-center justify-center">{group.length}</span>}
                </button>
                {isExpanded && (
                  <div
                    className="py-2.5 px-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] z-10 box-border"
                    style={
                      useInlineAnchorPopup && fallbackPopupPos?.groupKey === groupKey
                        ? {
                            position: 'fixed',
                            top: fallbackPopupPos.top,
                            left: fallbackPopupPos.left,
                            width: 'min(20rem, calc(100vw - 2rem))',
                            minWidth: 'min(20rem, calc(100vw - 2rem))',
                            maxWidth: 'min(20rem, calc(100vw - 2rem))',
                          }
                        : {
                            position: 'absolute',
                            left: '100%',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            marginLeft: '0.5rem',
                            width: '20rem',
                            minWidth: '20rem',
                            maxWidth: '20rem',
                          }
                    }
                    role="dialog"
                    aria-label="댓글 내용"
                  >
                    {group.length > 1 ? (
                      <ul className="list-none m-0 p-0 max-h-64 overflow-auto [&_li]:py-2">
                        {group.map((c) => (
                          <li
                            key={c.id}
                            onMouseEnter={() => {
                              const s = parseInt(c.start_anchor ?? '', 10);
                              const e = parseInt(c.end_anchor ?? '', 10);
                              if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return;
                              const hasReferenced = c.referenced_text != null;
                              const currentSlice = hasReferenced && content.length >= e ? content.slice(s, e) : null;
                              const isModified = hasReferenced && (currentSlice === null || currentSlice !== c.referenced_text);
                              if (!isModified) setHoveredAnchorRange({ start: s, end: e });
                            }}
                            onMouseLeave={() => setHoveredAnchorRange(null)}
                          >
                            {renderCommentBlock(c)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div
                        onMouseEnter={() => {
                          const c = group[0];
                          const s = parseInt(c.start_anchor ?? '', 10);
                          const e = parseInt(c.end_anchor ?? '', 10);
                          if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return;
                          const hasReferenced = c.referenced_text != null;
                          const currentSlice = hasReferenced && content.length >= e ? content.slice(s, e) : null;
                          const isModified = hasReferenced && (currentSlice === null || currentSlice !== c.referenced_text);
                          if (!isModified) setHoveredAnchorRange({ start: s, end: e });
                        }}
                        onMouseLeave={() => setHoveredAnchorRange(null)}
                      >
                        {renderCommentBlock(group[0])}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
