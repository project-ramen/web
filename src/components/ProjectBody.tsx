import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { CodeBlockWithCopy } from './CodeBlockWithCopy';

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
  return (
    <div className="project-body-markdown markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
