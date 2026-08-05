import type { Root, Text, PhrasingContent } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/** Obsidian wikilink: [[파일 이름]] 또는 [[파일 이름|별칭]]. 별칭이 있으면 별칭, 없으면 파일 이름만 캡처. */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Obsidian의 [[파일 이름|별칭]] 위키링크 문법을 표시 텍스트(별칭 또는 파일 이름)로 변환하는 remark 플러그인.
 * 링크 대상은 블로그에 게시된 별도 페이지가 아닐 수 있으므로 클릭 가능한 링크가 아닌 일반 텍스트로만 렌더링한다.
 *
 * raw 마크다운 문자열 자체는 건드리지 않고 렌더 결과(mdast)만 바꾸므로,
 * PostRealtimeViewer의 raw↔렌더 오프셋 매핑(댓글 앵커링)과 안전하게 호환된다.
 */
const remarkWikilinks: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'text', (node: Text, index, parent) => {
		if (!parent || index == null) return;
		const value = node.value;
		if (!value.includes('[[')) return;

		WIKILINK_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		let lastIndex = 0;
		const replacement: PhrasingContent[] = [];

		while ((match = WIKILINK_RE.exec(value))) {
			const [full, target, alias] = match;
			if (match.index > lastIndex) {
				replacement.push({ type: 'text', value: value.slice(lastIndex, match.index) });
			}
			replacement.push({ type: 'text', value: (alias ?? target).trim() });
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
