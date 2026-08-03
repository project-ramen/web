/**
 * When the server serves index.html for /post/:slug (no static file for that path),
 * this component detects the path and renders the post detail so the URL works.
 */
import { useEffect, useState } from 'react';
import PostDetailPage from './PostDetailPage';

export default function PathRouter() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/post\/(.+)$/);
    if (match && match[1]) {
      setSlug(decodeURIComponent(match[1]));
      const defaultHome = document.getElementById('default-home');
      if (defaultHome) defaultHome.style.display = 'none';
    }
  }, []);

  if (!slug) return null;

  return <PostDetailPage slug={slug} />;
}
