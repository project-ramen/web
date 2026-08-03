/**
 * 브라우저에서 포스트 작성/수정 시 쓰는 관리자 비밀번호 (RAMEN_ADMIN_PASSWORD).
 * localStorage에 저장해 다음 편집 때 재사용한다.
 */
const KEY = 'ramen-admin-password';

export function getAdminPassword(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminPassword(password: string): void {
  try {
    localStorage.setItem(KEY, password);
  } catch {
    /* ignore */
  }
}

export function clearAdminPassword(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getAdminHeaders(): Record<string, string> {
  const pw = getAdminPassword();
  return pw ? { Authorization: `Bearer ${pw}` } : {};
}
