# About(소개) 데이터

`profile.ts` 하나만 수정하면 `/about` 페이지에 반영됩니다.

- **name**, **tagline**, **avatar**, **bio**, **links**: 소개 카드
- **languages**: 사용 언어 배열 (예: C, Python, JavaScript, TypeScript)
- **frameworks**: 프레임워크 배열 (예: React, Tauri)
- **timeline**: 연혁 배열. `{ period, label }` 형태로 과거 → 현재 순으로 나열

타입 정의는 `types.ts`를 참고하세요.
