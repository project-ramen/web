import type { AboutProfile } from './types';

export default {
  name: 'Ramen',
  tagline: '웹·앱 만들고 글 쓰는 중',
  // avatar: '/about/avatar.jpg',
  bio: [
    '안녕하세요. Ramen 블로그에 오신 걸 환영합니다.',
    '웹과 앱 개발에 관심이 많고, Tauri와 Astro로 사이드 프로젝트를 하고 있습니다. 이곳에는 로그와 프로젝트 소개를 올립니다.',
    '궁금한 점이 있으면 아래 링크로 연락 주세요.',
  ],
  languages: ['C', 'Python', 'JavaScript', 'TypeScript'],
  frameworks: ['React', 'Tauri'],
  links: [
    { label: 'GitHub', href: 'https://github.com', ariaLabel: 'GitHub 열기' },
    { label: '이메일', href: 'mailto:hello@example.com', ariaLabel: '이메일 보내기' },
  ],
  timeline: [
    { period: '2019', label: '학교 입학' },
    { period: '2020 – 2021.9.16', label: '군대' },
    { period: '2025.11–12', label: '인턴십' },
    { period: '2025', label: '졸업' },
    { period: '2026 –', label: '(주)아이젠' },
  ],
} satisfies AboutProfile;
