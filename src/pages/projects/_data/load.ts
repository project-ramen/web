import type { ComponentType } from 'react';
import type { Project } from './types';

/** default = 카드용, page = 상세 본문(React 컴포넌트). .ts / .tsx 모두 로드 */
const projectModulesTs = import.meta.glob<{ default: Project; page?: ComponentType }>('./*.ts', { eager: true });
const projectModulesTsx = import.meta.glob<{ default: Project; page?: ComponentType }>('./*.tsx', { eager: true });
const moduleList = Object.values({ ...projectModulesTs, ...projectModulesTsx });

function rawProjects(): Project[] {
  return moduleList
    .map((m) => m.default)
    .filter((p): p is Project => p != null && 'id' in p)
    .sort((a, b) => a.id.localeCompare(b.id));
}

let cached: Project[] | null = null;

/** 프로젝트 목록 (메인 페이지 카드용). default만 사용 */
export function loadProjects(): Project[] {
  if (!cached) cached = rawProjects();
  return cached;
}

/** 프로젝트 상세. default + page(React 컴포넌트) 합쳐서 반환 */
export function getProject(id: string): Project | undefined {
  const mod = moduleList.find((m) => m.default?.id === id);
  if (!mod) return undefined;
  return {
    ...mod.default,
    ...(mod.page != null && { pageComponent: mod.page }),
  } as Project;
}
