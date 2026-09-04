import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

function getLanguageFromCodeElement(pre: HTMLPreElement | null): string {
  const code = pre?.querySelector('code');
  const className = code?.className ?? '';
  const match = String(className).match(/\blanguage-(\S+)/);
  return match ? match[1] : '';
}

const copyButtonBase =
  'py-1 px-2 text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-neutral-400 dark:focus:ring-neutral-500 inline-flex items-center justify-center max-w-[6rem] truncate shrink-0';

export function CodeBlockWithCopy({
  children,
  ...preProps
}: ComponentProps<'pre'>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState('');

  useEffect(() => {
    const pre = wrapperRef.current?.querySelector('pre');
    setLang(getLanguageFromCodeElement(pre ?? null));
  }, [children]);

  const handleCopy = () => {
    const pre = wrapperRef.current?.querySelector('pre');
    const text = pre?.textContent ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  };

  return (
    // 예전엔 복사 버튼을 pre 위에 absolute로 띄우고 그 자리만큼 pre 오른쪽 padding을 넓혀서
    // 좌우 padding이 안 맞았음 — 버튼을 코드 위 별도 헤더 줄로 빼서 pre는 다시 좌우 대칭 padding.
    <div ref={wrapperRef} className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`${copyButtonBase} bg-neutral-200/90 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-700/90 dark:hover:bg-neutral-600 dark:text-neutral-200`}
          aria-label={copied ? '복사됨' : '코드 복사'}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre {...preProps}>{children}</pre>
    </div>
  );
}
