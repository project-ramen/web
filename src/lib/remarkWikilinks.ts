import type { Root, Text, PhrasingContent } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import GithubSlugger from 'github-slugger';

/** Obsidian wikilink: [[파일 이름]], [[파일 이름|별칭]], [[파일 이름#헤딩]], [[#헤딩]](같은 문서) 등. */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export interface ResolvedWikilink {
	href: string;
	/** hover 시 title 속성으로 보여줄 대상 글의 실제 제목 (별칭과 다를 수 있음) */
	title: string;
}

export interface WikilinkOptions {
	/** notePart(파일 이름/노트 제목, `#헤딩` 제외)를 블로그 내부 URL로 변환. 못 찾으면 undefined → 일반 텍스트로 표시 */
	resolve?: (notePart: string) => ResolvedWikilink | undefined;
}

/** "test#Section" → { notePart: "test", headingText: "Section" }. 블록 참조(^id)는 앵커 없이 노트만 링크. */
function splitTarget(target: string): { notePart: string; headingText: string } {
	const hashIndex = target.indexOf('#');
	if (hashIndex < 0) return { notePart: target.trim(), headingText: '' };

	const notePart = target.slice(0, hashIndex).trim();
	const fragment = target.slice(hashIndex + 1).trim();
	if (!fragment || fragment.startsWith('^')) return { notePart, headingText: '' };

	// [[note#H1#H2]] 같은 다단계 헤딩은 마지막 조각(실제 헤딩 텍스트)만 앵커로 사용
	const headingText = fragment.split('#').pop()?.trim() ?? '';
	return { notePart, headingText };
}

/**
 * Obsidian의 [[파일 이름|별칭]] 위키링크 문법을 렌더링하는 remark 플러그인.
 * `resolve`로 notePart(파일 이름)가 실제 게시된 포스트/프로젝트와 매칭되면 클릭 가능한 링크로,
 * 매칭되지 않으면(또는 resolve 미제공 시) 표시 텍스트(별칭 또는 파일 이름)로만 렌더링한다.
 *
 * `#헤딩` 부분이 있으면 rehype-slug와 동일한 규칙(github-slugger)으로 앵커를 만들어 붙인다.
 * `[[#헤딩]]`처럼 노트 이름이 없으면 같은 문서 안의 헤딩으로 보고 `#앵커`만 만든다.
 * (주의: 대상 노트에 같은 텍스트의 헤딩이 여러 개면 rehype-slug가 붙이는 "-1" 같은 중복 접미사까지는
 *  재현하지 못한다 — 헤딩 텍스트가 노트 안에서 유일한 일반적인 경우에만 정확히 맞는다.)
 *
 * raw 마크다운 문자열 자체는 건드리지 않고 렌더 결과(mdast)만 바꾸므로,
 * PostRealtimeViewer의 raw↔렌더 오프셋 매핑(댓글 앵커링)과 안전하게 호환된다.
 */
const remarkWikilinks: Plugin<[WikilinkOptions?], Root> = (options = {}) => (tree) => {
	const { resolve } = options;

	visit(tree, 'text', (node: Text, index, parent) => {
		if (!parent || index == null) return;
		const value = node.value;
		if (!value.includes('[[')) return;

		WIKILINK_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		let lastIndex = 0;
		const replacement: PhrasingContent[] = [];

		while ((match = WIKILINK_RE.exec(value))) {
			const [full, rawTarget, alias] = match;
			const { notePart, headingText } = splitTarget(rawTarget);
			if (match.index > lastIndex) {
				replacement.push({ type: 'text', value: value.slice(lastIndex, match.index) });
			}

			// `??`는 빈 문자열을 "값 있음"으로 취급하므로, notePart가 빈 문자열인 [[#헤딩]] 케이스를 위해 `||`로 폴백
			const displayText = (alias ?? (notePart || headingText || rawTarget)).trim();

			let href: string | undefined;
			let title: string | undefined;
			if (notePart) {
				const resolved = resolve?.(notePart);
				href = resolved?.href;
				title = resolved?.title;
				if (href && headingText) href += `#${new GithubSlugger().slug(headingText)}`;
			} else if (headingText) {
				// 노트 이름 없는 [[#헤딩]] — 지금 렌더링 중인 문서 자신을 가리킴
				href = `#${new GithubSlugger().slug(headingText)}`;
			}

			if (href) {
				replacement.push({
					type: 'link',
					url: href,
					title: title ?? null,
					children: [{ type: 'text', value: displayText }],
				});
			} else {
				replacement.push({ type: 'text', value: displayText });
			}
			lastIndex = match.index + full.length;
		}
		if (replacement.length === 0) return;

		if (lastIndex < value.length) {
			replacement.push({ type: 'text', value: value.slice(lastIndex) });
		}

		parent.children.splice(index, 1, ...replacement);
		return index + replacement.length;
	});
};

export default remarkWikilinks;
