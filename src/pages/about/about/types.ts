/**
 * About(소개) 페이지 데이터 타입.
 * about/profile.ts에서 이 타입으로 데이터를 내보내면 페이지에 반영됩니다.
 */
export interface AboutLink {
  label: string;
  href: string;
  /** 접근성용 (예: 'GitHub 열기') */
  ariaLabel?: string;
}

export interface AboutProfile {
  /** 이름 */
  name: string;
  /** 한 줄 소개 (헤더 아래) */
  tagline: string;
  /** 프로필 이미지 경로 (public 기준). 없으면 생략 */
  avatar?: string;
  /** 소개 문단들 (순서대로 표시) */
  bio: string[];
  /** 사용 언어 (예: C, Python, JavaScript, TypeScript) */
  languages: string[];
  /** 사용 프레임워크 (예: React, Tauri) */
  frameworks: string[];
  /** 링크 버튼 목록 */
  links: AboutLink[];
  /** 연혁 (과거 → 현재 순) */
  timeline: TimelineItem[];
}

/** 연혁 한 항목. profile.timeline에 넣으면 됩니다. */
export interface TimelineItem {
  /** 기간 표시 (예: '2019', '2020 – 2021', '2026 –') */
  period: string;
  /** 내용 (예: '학교 입학', '(주)아이젠') */
  label: string;
}
