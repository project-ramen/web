import type { Element, Root } from 'hast';
import { toText } from 'hast-util-to-text';
import { common, createLowlight } from 'lowlight';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const lowlight = createLowlight(common);

/** `<code class="language-xxx">`/`<code class="lang-xxx">`에서 언어 이름 추출. 없으면 undefined. */
function getLanguage(node: Element): string | undefined {
	const list = node.properties?.className;
	if (!Array.isArray(list)) return undefined;
	for (const value of list) {
		const str = String(value);
		if (str.startsWith('language-')) return str.slice('language-'.length);
		if (str.startsWith('lang-')) return str.slice('lang-'.length);
	}
	return undefined;
}

/**
 * rehype-highlight은 `<code>`의 부모가 `<pre>`일 때만 처리하도록 하드코딩돼 있어서(라이브러리 자체 로직,
 * 옵션으로 못 끔) 인라인 코드(`` `code` ``)는 언어 클래스가 있든 없든 항상 건너뛰어 색이 전혀 안 붙는다.
 * 같은 lowlight 기반 로직을 그대로 복제하되 그 pre 제약만 빼서, 블록/인라인 코드 둘 다 동일하게
 * `.hljs`/`.hljs-*` 클래스를 붙인다 — 기존 하이라이트 CSS를 그대로 재사용할 수 있음.
 * 언어 클래스가 있는 블록 코드는 그 언어로, 없는 코드(대부분 인라인)는 항상 자동 감지.
 */
const rehypeHighlightAll: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'element', (node: Element) => {
		if (node.tagName !== 'code') return;

		const text = toText(node, { whitespace: 'pre' });
		if (!text.trim()) return;

		const lang = getLanguage(node);
		let result;
		try {
			result = lang ? lowlight.highlight(lang, text) : lowlight.highlightAuto(text);
		} catch {
			return; // 등록 안 된 언어 등 — 원문 그대로 둠
		}

		if (!Array.isArray(node.properties.className)) node.properties.className = [];
		if (!node.properties.className.includes('hljs')) node.properties.className.unshift('hljs');
		if (!lang && result.data?.language) {
			node.properties.className.push(`language-${result.data.language}`);
		}
		if (result.children.length > 0) {
			node.children = result.children as Element['children'];
		}
	});
};

export default rehypeHighlightAll;
