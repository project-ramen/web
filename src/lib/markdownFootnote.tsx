import type { ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { FiCornerUpLeft } from 'react-icons/fi';

type AnchorProps = ComponentProps<'a'> & ExtraProps;

/**
 * remark-gfm이 각주 "돌아가기" 링크에 기본으로 넣는 "↩" 텍스트를 아이콘으로 대체.
 * 다중 참조 각주면 뒤에 <sup>N</sup>이 같이 오므로 텍스트 노드만 걸러내고 남겨둔다.
 */
export function FootnoteBackrefAnchor({ children, className, ...rest }: AnchorProps) {
  if (!('data-footnote-backref' in rest)) {
    return <a className={className} {...rest}>{children}</a>;
  }
  const extra = Array.isArray(children) ? children.filter((c) => typeof c !== 'string') : [];
  return (
    <a className={[className, 'inline-flex items-center align-middle'].filter(Boolean).join(' ')} {...rest}>
      <FiCornerUpLeft aria-hidden="true" className="w-3.5 h-3.5" />
      {extra}
    </a>
  );
}
