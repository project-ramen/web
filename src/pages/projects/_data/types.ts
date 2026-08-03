import type { ComponentType } from 'react';

/**
 * 프로젝트 카드 하나의 데이터.
 * projects/ 폴더에 새 .ts 파일을 만들고 default export로 이 타입을 내보내면 목록에 추가됩니다.
 */
export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  /** 배너 이미지 경로 (public 기준, 예: /projects/xxx-banner.svg). 없으면 카드 상단에 아이콘만 표시 */
  banner?: string;
  /** 상세 페이지 본문 (React 컴포넌트). export { default as page } from './Page.tsx' 로 넣으면 상세에 표시 */
  pageComponent?: ComponentType | null;
  /** 상세 페이지 본문 (마크다운). pageComponent 없을 때만 사용 */
  body?: string;
  link: string;
  linkLabel: string;
}
