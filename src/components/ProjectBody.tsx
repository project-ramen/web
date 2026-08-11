import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import type { Components } from 'react-markdown';
import { CodeBlockWithCopy } from './CodeBlockWithCopy';
import remarkWikilinks from '../lib/remarkWikilinks';
import remarkCallouts from '../lib/remarkCallouts';
import { usePostLinkIndex } from '../lib/usePostLinkIndex';

/** Parse title "width:50%" or "width: 200px" → style (same as app). */
function imageWidthStyle(title: string | undefined): React.CSSProperties | undefined {
  if (!title || typeof title !== 'string') return undefined;
  const m = title.match(/^width:\s*(.+)$/i);
  if (!m) return undefined;
  const value = m[1].trim();
  return value ? { width: value, maxWidth: '100%' } : undefined;
}

const markdownComponents: Components = {
  pre: CodeBlockWithCopy,
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

interface ProjectBodyProps {
  content: string;
}

export default function ProjectBody({ content }: ProjectBodyProps) {
  const { resolve } = usePostLinkIndex();
  return (
    <div className="project-body-markdown markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkCallouts, [remarkWikilinks, { resolve }]]} rehypePlugins={[rehypeRaw, rehypeKatex, rehypeSlug, [rehypeHighlight, { detect: true }]]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
