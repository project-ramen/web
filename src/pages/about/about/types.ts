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
  /** 프로필 이미지 경로 (public 기준). 없으면 생략 */
  avatar?: string;
  /** 사용 언어 (예: C, Python, JavaScript, TypeScript) */
  languages: string[];
  /** 링크 버튼 목록 */
  links: AboutLink[];
  /** 경력 (최신 → 과거 순으로 위에서 아래로 표시) */
  workExperience: WorkExperienceCompany[];
}

/** 경력 트리에서 하나의 회사(또는 단체) 블록. */
export interface WorkExperienceCompany {
  /** 회사/단체명 */
  name: string;
  /** 원형 로고 자리에 표시할 이니셜 (로고 이미지 없을 때) */
  initial: string;
  /** 로고 이미지 경로. 있으면 initial 대신 사용 */
  logo?: string;
  /** 이 회사에서의 role(들). 여러 개면 하나의 줄기에서 가지가 갈라지는 형태로 표시 */
  roles: WorkExperienceRole[];
}

/** 경력 트리에서 회사 아래 하나의 role(직무) 항목. */
export interface WorkExperienceRole {
  /** 직무 타이틀 (예: 'R&D 소프트웨어 엔지니어') */
  title: string;
  /** 근무 기간 표시 (예: '2025.2 – 2026.8', '2019.12 – 현재') */
  period: string;
  /** 총 근속 기간 (예: '1년 6개월') */
  duration: string;
  /** 근무지 */
  location: string;
  /** 고용 형태 (예: '정규직', '인턴', '군 복무', '자원봉사') */
  employmentType: string;
  /** 현재 진행 중인 role이면 true (초록색으로 강조) */
  current?: boolean;
  /** 세부 성과/업무 bullet 목록 */
  bullets?: string[];
}
