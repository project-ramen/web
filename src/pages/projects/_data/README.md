# 프로젝트 목록

이 폴더에 `.ts` 파일을 추가하면 `/project` 페이지에 카드가 자동으로 나타납니다.

**추가 방법:** `ramen-blog.ts` 또는 `ramen-app.ts`를 복사한 뒤 내용만 수정해 새 파일로 저장하세요.  
`types.ts`의 `Project` 타입을 참고해 필드를 채우면 됩니다.  
- **배너**: `banner` 필드에 경로(예: `/projects/내프로젝트-banner.svg`)를 넣으면 카드·상세 페이지 상단에 표시됩니다.
- **본문**: 같은 파일(.tsx) 안에 `export function page() { return <div>...</div>; }` 로 React 컴포넌트를 넣으면 상세 페이지에 본문이 렌더링됩니다. 별도 파일로 두고 `export { default as page } from './Page';` 해도 됩니다.
