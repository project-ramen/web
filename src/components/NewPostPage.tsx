import PostEditor from './PostEditor';

/** slug에 포함된 슬래시(카테고리 경로)는 URL 세그먼트로 그대로 두고, 나머지만 인코딩 */
function slugForUrl(slug: string): string {
  return slug.split('/').map(encodeURIComponent).join('/');
}

export default function NewPostPage() {
  return (
    <PostEditor
      mode="create"
      onCancel={() => {
        window.location.href = '/post';
      }}
      onSaved={(saved) => {
        window.location.href = `/post/${slugForUrl(saved.slug)}`;
      }}
    />
  );
}
