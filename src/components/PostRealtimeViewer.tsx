import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness';
import ReactMarkdown from 'react-markdown';

const WS_BASE = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_WS_URL || 'ws://localhost:3000') : '';
const WS_URL = WS_BASE ? (WS_BASE.endsWith('/ws') ? WS_BASE : `${WS_BASE.replace(/\/$/, '')}/ws`) : '';
const API_BASE = typeof window !== 'undefined' ? (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000') : '';

/** 원격 커서/선택 하이라이트 색 (고정) */
const REMOTE_CURSOR_COLOR = '#6af';

/** 드래그(선택) 중에는 원격 커서(캐럿)를 숨기고 선택 하이라이트만 표시. 해제 시 커서만 표시. */
const HIDE_CURSOR_WHEN_SELECTING = true;

type CursorState = {
  cursor?: number;
  selectionStart?: number;
  selectionEnd?: number;
  name?: string;
};
type AwarenessStates = Map<number, CursorState>;

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

type Props = { slug: string; initialContent?: string };

export default function PostRealtimeViewer({ slug, initialContent = '' }: Props) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<'static' | 'connected' | 'disconnected'>('static');
  const [awarenessStates, setAwarenessStates] = useState<AwarenessStates>(new Map());
  const [cursorPositions, setCursorPositions] = useState<
    Map<number, { top: number; left: number; height: number; width: number }>
  >(new Map());
  const [cursorSelections, setCursorSelections] = useState<
    Map<number, { left: number; top: number; width: number; height: number }[]>
  >(new Map());
  const overlayRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wsCleanupRef = useRef<(() => void) | null>(null);

  const POLL_INTERVAL_MS = 4000;

  // 초기 정적 본문 반영
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // 정적으로 시작 → 주기적으로 /live 확인 → 에디터 있으면 실시간 연결, 없으면(또는 연결 후 에디터 나감) 정적 유지
  useEffect(() => {
    if (!slug) {
      setStatus('disconnected');
      return;
    }
    if (!API_BASE) {
      setStatus('disconnected');
      return;
    }
    setContent((c) => c || initialContent);
    setStatus('static');

    let cancelled = false;
    const connectLive = (): (() => void) | void => {
      if (!WS_URL) return;
      const doc = new Y.Doc();
      const awareness = new Awareness(doc);
      const text = doc.getText('content');
      const url = `${WS_URL}?room=${encodeURIComponent(slug)}`;
      const ws = new WebSocket(url);

      const updateView = () => setContent(text.toString());
      text.observe(updateView);
      updateView();

      const flushAwareness = () => setAwarenessStates(new Map(awareness.getStates()));
      awareness.on('change', flushAwareness);

      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        if (!cancelled) setStatus('connected');
      };
      ws.onclose = () => {
        if (!cancelled) setStatus('static');
      };
      ws.onmessage = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          try {
            Y.applyUpdate(doc, new Uint8Array(e.data));
          } catch (_) {
            // ignore
          }
          return;
        }
        if (typeof e.data === 'string') {
          try {
            const msg = JSON.parse(e.data) as { type?: string; data?: number[] };
            if (msg.type === 'awareness' && Array.isArray(msg.data)) {
              applyAwarenessUpdate(awareness, new Uint8Array(msg.data), null);
            }
          } catch (_) {
            // ignore
          }
        }
      };

      return () => {
        text.unobserve(updateView);
        awareness.off('change', flushAwareness);
        ws.close();
      };
    };

    const fetchStaticContent = () => {
      if (!API_BASE) return;
      fetch(`${API_BASE}/api/posts/by-slug/${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: { body_md?: string } | null) => {
          if (!cancelled && p && p.body_md != null) setContent(p.body_md);
        })
        .catch(() => {});
    };

    const poll = () => {
      if (cancelled || !API_BASE) return;
      fetch(`${API_BASE}/api/posts/by-slug/${encodeURIComponent(slug)}/live`)
        .then((r) => (r.ok ? r.json() : { live: false }))
        .then((data: { live?: boolean }) => {
          if (cancelled) return;
          const live = !!data.live;
          if (live && !wsCleanupRef.current) {
            wsCleanupRef.current = connectLive() ?? null;
          } else if (!live && wsCleanupRef.current) {
            wsCleanupRef.current();
            wsCleanupRef.current = null;
            setStatus('static');
            setAwarenessStates(new Map());
            fetchStaticContent();
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('static');
        });
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      wsCleanupRef.current?.();
      wsCleanupRef.current = null;
    };
  }, [slug]);

  const hasRemoteCursors = Array.from(awarenessStates.keys()).some(
    (id) => awarenessStates.get(id)?.cursor != null
  );
  const hasRemoteCursorsOrSelections = Array.from(awarenessStates.keys()).some((id) => {
    const s = awarenessStates.get(id);
    if (!s) return false;
    if (s.cursor != null) return true;
    const start = s.selectionStart ?? 0;
    const end = s.selectionEnd ?? 0;
    return start !== end;
  });

  useLayoutEffect(() => {
    if (!hasRemoteCursorsOrSelections) {
      setCursorPositions(new Map());
      setCursorSelections(new Map());
      return;
    }
    const overlay = overlayRef.current;
    const mirror = mirrorRef.current;
    if (!overlay || !mirror) return;

    const renderedPositions = collectRenderedCharPositions(mirror);
    const raw = content;
    const rawIndexForRendered =
      renderedPositions.length > 0 && raw.length > 0
        ? buildRawToRenderedMapping(raw, renderedPositions)
        : [];

    const mirrorStyle = getComputedStyle(mirror);
    const fallbackFontSize = parseFloat(mirrorStyle.fontSize) || 16;
    const fallbackHeight = fallbackFontSize * (parseFloat(mirrorStyle.lineHeight) || 1.5);
    const fallbackWidth = Math.max(2, fallbackFontSize * 0.15);

    const rawToRenderedIdx = (rawIndex: number) => {
      if (rawIndexForRendered.length === 0) return 0;
      let lo = 0;
      let hi = rawIndexForRendered.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (rawIndexForRendered[mid] <= rawIndex) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    const measure = () => {
      const nextPositions = new Map<
        number,
        { top: number; left: number; height: number; width: number }
      >();
      const nextSelections = new Map<
        number,
        { left: number; top: number; width: number; height: number }[]
      >();
      const overlayRect = overlay.getBoundingClientRect();
      const clientIds = Array.from(awarenessStates.keys()).filter(
        (id) => awarenessStates.get(id)?.cursor != null
      );
      for (const clientId of clientIds) {
        const state = awarenessStates.get(clientId);
        const rawIndex = Math.min(Math.max(0, state?.cursor ?? 0), raw.length);
        try {
          const renderedIdx = rawToRenderedIdx(rawIndex);
          const pos = renderedPositions[renderedIdx];
          if (!pos) continue;
          const range = document.createRange();
          const nodeLen = (pos.node.textContent || '').length;
          const isAtEnd = rawIndex === raw.length && raw.length > 0;
          const lastPos = renderedPositions[renderedPositions.length - 1];
          const endNode = lastPos?.node ?? pos.node;
          const endNodeLen = (endNode.textContent || '').length;
          if (isAtEnd && endNodeLen > 0) {
            range.setStart(endNode, endNodeLen);
            range.setEnd(endNode, endNodeLen);
          } else {
            range.setStart(pos.node, pos.offset);
            range.setEnd(pos.node, pos.offset);
          }
          let rect = range.getBoundingClientRect();
          // collapsed range가 줄/블록 시작·끝이면 0 크기 반환 → 인접 문자 rect로 보정 (h1 다음, 블록 끝 등 범용)
          if (rect.width === 0 || rect.height === 0) {
            if (isAtEnd && endNodeLen > 0) {
              range.setStart(endNode, endNodeLen - 1);
              range.setEnd(endNode, endNodeLen);
              const prevRect = range.getBoundingClientRect();
              rect = new DOMRect(
                prevRect.right,
                prevRect.top,
                fallbackWidth,
                prevRect.height > 0 ? prevRect.height : fallbackHeight
              );
            } else if (pos.offset < nodeLen) {
              range.setStart(pos.node, pos.offset);
              range.setEnd(pos.node, pos.offset + 1);
              const nextRect = range.getBoundingClientRect();
              if (nextRect.width > 0 || nextRect.height > 0) {
                rect = new DOMRect(
                  nextRect.left,
                  nextRect.top,
                  fallbackWidth,
                  nextRect.height > 0 ? nextRect.height : fallbackHeight
                );
              }
            }
            if ((rect.width === 0 || rect.height === 0) && pos.offset > 0) {
              range.setStart(pos.node, pos.offset - 1);
              range.setEnd(pos.node, pos.offset);
              const prevRect = range.getBoundingClientRect();
              rect = new DOMRect(
                prevRect.right,
                prevRect.top,
                fallbackWidth,
                prevRect.height > 0 ? prevRect.height : fallbackHeight
              );
            }
            if ((rect.width === 0 || rect.height === 0) && pos.offset === 0 && renderedIdx > 0) {
              const prev = renderedPositions[renderedIdx - 1];
              if (prev) {
                const prevLen = (prev.node.textContent || '').length;
                range.setStart(prev.node, prev.offset);
                range.setEnd(prev.node, Math.min(prev.offset + 1, prevLen));
                const prevRect = range.getBoundingClientRect();
                rect = new DOMRect(
                  prevRect.right,
                  prevRect.top,
                  fallbackWidth,
                  prevRect.height > 0 ? prevRect.height : fallbackHeight
                );
              }
            }
          }
          const height = rect.height > 0 ? rect.height : fallbackHeight;
          const width = rect.width > 0 ? Math.max(2, rect.width) : fallbackWidth;
          nextPositions.set(clientId, {
            left: rect.left - overlayRect.left + overlay.scrollLeft,
            top: rect.top - overlayRect.top + overlay.scrollTop,
            height,
            width,
          });
        } catch (_) {
          // ignore
        }
        const start = state?.selectionStart ?? state?.cursor ?? 0;
        const end = state?.selectionEnd ?? state?.cursor ?? 0;
        if (start !== end && raw.length > 0 && renderedPositions.length > 0) {
          const s = Math.min(Math.max(0, start), raw.length);
          const e = Math.min(Math.max(0, end), raw.length);
          if (s !== e) {
            try {
              const idxStart = rawToRenderedIdx(s);
              const idxEnd = rawToRenderedIdx(e);
              const startPos = renderedPositions[idxStart];
              const endPos = renderedPositions[idxEnd];
              if (startPos && endPos) {
                const selRange = document.createRange();
                selRange.setStart(startPos.node, startPos.offset);
                const maxEnd = (endPos.node.textContent || '').length;
                selRange.setEnd(endPos.node, Math.min(endPos.offset + 1, maxEnd));
                const rects = Array.from(selRange.getClientRects());
                const overlayRects = rects
                  .filter((r) => r.width > 0 || r.height > 0)
                  .map((r) => ({
                    left: r.left - overlayRect.left + overlay.scrollLeft,
                    top: r.top - overlayRect.top + overlay.scrollTop,
                    width: r.width,
                    height: r.height,
                  }));
                if (overlayRects.length > 0) nextSelections.set(clientId, overlayRects);
              }
            } catch (_) {
              // ignore
            }
          }
        }
      }
      setCursorPositions(nextPositions);
      setCursorSelections(nextSelections);
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [content, awarenessStates, hasRemoteCursorsOrSelections]);

  const remoteEntries = Array.from(cursorPositions.entries());
  const selectionEntries = Array.from(cursorSelections.entries());
  const hasRemoteSelections = selectionEntries.length > 0;
  const cursorEntries = HIDE_CURSOR_WHEN_SELECTING
    ? remoteEntries.filter(([clientId]) => {
        const s = awarenessStates.get(clientId);
        const start = s?.selectionStart ?? s?.cursor;
        const end = s?.selectionEnd ?? s?.cursor;
        return start === end;
      })
    : remoteEntries;

  return (
    <div className="post-realtime-viewer">
      <div className="viewer-status">
        {status === 'connected' && <span className="connected">실시간 동기화됨</span>}
        {status === 'static' && <span>정적 보기</span>}
        {status === 'disconnected' && <span>오프라인 또는 미게시</span>}
      </div>
      <div className="viewer-content-wrap">
        <article className="viewer-content">
          {content ? (
            <ReactMarkdown>{content}</ReactMarkdown>
          ) : (
            <p className="empty">아직 내용이 없습니다. 글쓰기 앱에서 이 포스트를 열어 작성해 보세요.</p>
          )}
        </article>
        {(hasRemoteCursors || hasRemoteSelections) && (
          <div ref={overlayRef} className="viewer-cursor-overlay" aria-hidden>
            <div ref={mirrorRef} className="viewer-cursor-mirror viewer-content">
              {content ? (
                <ReactMarkdown>{content}</ReactMarkdown>
              ) : (
                <p className="empty">아직 내용이 없습니다.</p>
              )}
            </div>
            {selectionEntries.flatMap(([clientId, rects]) =>
              rects.map((r, i) => (
                <div
                  key={`sel-${clientId}-${i}`}
                  className="viewer-remote-selection"
                  style={{
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    backgroundColor: REMOTE_CURSOR_COLOR,
                  }}
                />
              ))
            )}
            {cursorEntries.map(([clientId, pos]) => (
              <div
                key={clientId}
                className="viewer-remote-cursor"
                style={{
                  left: pos.left,
                  top: pos.top,
                  height: pos.height,
                  width: pos.width,
                  backgroundColor: REMOTE_CURSOR_COLOR,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
