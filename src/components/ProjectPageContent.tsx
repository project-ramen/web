import type { ComponentType } from 'react';

interface ProjectPageContentProps {
  component?: ComponentType | null;
}

/** 상세 본문용 React 컴포넌트를 동적으로 렌더 */
export default function ProjectPageContent({ component: Component }: ProjectPageContentProps) {
  if (!Component) return null;
  return <Component />;
}
