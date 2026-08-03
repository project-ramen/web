import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

function getLanguageFromCodeElement(pre: HTMLPreElement | null): string {
  const code = pre?.querySelector('code');
  const className = code?.className ?? '';
  const match = String(className).match(/\blanguage-(\S+)/);
  return match ? match[1] : '';
}

const copyButtonBase =
  'absolute top-2 right-0 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-neutral-400 dark:focus:ring-neutral-500 inline-flex items-center justify-center max-w-[6rem] truncate';

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

  const label = copied ? '복사됨' : (lang || 'code');

  return (
    <div ref={wrapperRef} className="code-block-wrapper relative">
      <pre {...preProps}>{children}</pre>
      <button
        type="button"
        onClick={handleCopy}
        className={`${copyButtonBase} bg-neutral-200/90 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-700/90 dark:hover:bg-neutral-600 dark:text-neutral-200`}
        aria-label={copied ? '복사됨' : '코드 복사'}
      >
        {label}
      </button>
    </div>
  );
}
