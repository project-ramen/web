import type { AboutProfile } from './types';

export default {
  name: '고동현',
  // avatar: '/about/avatar.jpg',
  languages: ['C', 'C++', 'Python', 'JavaScript', 'TypeScript'],
  links: [
    { label: 'GitHub', href: 'https://github.com/dennis0324', ariaLabel: 'GitHub 열기' },
    { label: '이메일', href: 'mailto:dennis0324@naver.com', ariaLabel: '이메일 보내기' },
  ],
  workExperience: [
    {
      name: 'Open Source Software Contributor',
      initial: 'OS',
      roles: [
        {
          title: 'Volunteer Developer',
          period: '2019.12 – 현재',
          duration: '6년 8개월',
          location: '전 세계 (원격)',
          employmentType: '자원봉사',
          current: true,
          bullets: [
            'GitHub·SourceForge의 다양한 오픈소스 프로젝트에 기여',
            'interactions-py/interactions.py (Discord 봇 프레임워크): 서브 커맨드 예제 코드 개선',
            'mermaid-js/mermaid (JS 기반 다이어그램/차트 도구): 문서 안내 오류 수정',
          ],
        },
      ],
    },
    {
      name: '아이젠',
      initial: '아이',
      roles: [
        {
          title: 'R&D 소프트웨어 엔지니어',
          period: '2025.2 – 2026.8',
          duration: '1년 6개월',
          location: '판교, 대한민국',
          employmentType: '정규직',
          bullets: [
            '종량제 봉투 인식 IoT 엣지 디바이스 네트워크 재설계: 신규 보드가 LAN 인터페이스 1개로 축소되면서, PoE 스위치의 VLAN 기능과 CM5 게이트웨이를 활용해 포트포워딩·NAT·VLAN 구조로 다시 설계',
            'GStreamer 기반 영상 인식 파이프라인을 AI 가속기와 최적화해 표시 프레임 12→25fps, 처리 프레임 20→25fps로 개선하면서 CPU 사용률은 최대 80%→75%로 절감',
          ],
        },
      ],
    },
    {
      name: '디파인',
      initial: '디파',
      roles: [
        {
          title: 'R&D 소프트웨어 엔지니어',
          period: '2024.7 – 2025.2',
          duration: '7개월',
          location: '판교, 대한민국',
          employmentType: '정규직',
          bullets: [
            '스마트팩토리 IoT 감지센서 개발: STM32(FreeRTOS)+ESP8266 감지센서와 MQTT 서버 연동 개발, 인터넷 연결 확인 로직을 짧은 간격 폴링 방식으로 개선해 부팅 시간을 15초→5초(약 68.6% 단축)로 줄임',
            '인터랙티브 배치도: 엑셀로 관리되던 스토리지 대여 현황을 SVG 기반 인터랙티브 도면 컴포넌트로 구현, 클릭 한 번으로 대여 상태·대여자 정보 확인 가능하도록 개선',
            'PDF 계약서 자동 생성: jsPDF 기반 클라이언트 사이드 생성 모듈로 계약서 발급을 자동화하고, 한글 폰트 깨짐·페이지 분할 이슈를 해결해 안정적인 문서 출력 환경 구축',
            'SMS 발송 시스템: Next.js API Routes 기반 서버리스 발송 API로 NHN Cloud API Key 노출 없이 SMS를 발송하고, 발송 이력 조회·필터링 UI 구현',
          ],
        },
      ],
    },
    {
      name: 'GST',
      initial: 'GST',
      roles: [
        {
          title: 'Intern',
          period: '2024.1 – 2024.2',
          duration: '2개월',
          location: '서울, 대한민국',
          employmentType: '인턴',
          bullets: [
            'C#/WinForm/DevExpress 기반 스마트팩토리 ERP 시스템의 커스텀 메뉴 기능 개발',
            '커스텀 메뉴 데이터를 위한 SQL Transaction 작성',
            'GROUP BY, ROLLUP, CUBE, GROUPING SET 등 고급 SQL 집계 기법을 적용해 프로덕션 수준의 쿼리 작성',
          ],
        },
      ],
    },
    {
      name: '대한민국 육군',
      initial: '육군',
      roles: [
        {
          title: '병장',
          period: '2020.4 – 2022.1',
          duration: '1년 9개월',
          location: '양주, 대한민국',
          employmentType: '군 복무',
          bullets: ['기관총 사수(Machine Gunner)로 병역 의무 수행'],
        },
      ],
    },
  ],
} satisfies AboutProfile;
