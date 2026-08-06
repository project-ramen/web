import type { Root, Blockquote, Paragraph, PhrasingContent, BlockContent, DefinitionContent, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/** Obsidian 콜아웃 마커: `[!info]`, `[!warning]+ Custom Title`, `[!tip]- 접힌 제목` 등. */
const MARKER_RE = /^\[!(\w+)\]([+-])?(?:[ \t]+(.*))?$/;

/** Obsidian 공식 타입 + alias → { canonical CSS 타입, 기본 표시 라벨 } */
const CALLOUT_ALIASES: Record<string, { canonical: string; label: string }> = {
	note: { canonical: 'note', label: 'Note' },
	abstract: { canonical: 'abstract', label: 'Abstract' },
	summary: { canonical: 'abstract', label: 'Summary' },
	tldr: { canonical: 'abstract', label: 'Tldr' },
	info: { canonical: 'info', label: 'Info' },
	todo: { canonical: 'todo', label: 'Todo' },
	tip: { canonical: 'tip', label: 'Tip' },
	hint: { canonical: 'tip', label: 'Hint' },
	important: { canonical: 'tip', label: 'Important' },
	success: { canonical: 'success', label: 'Success' },
	check: { canonical: 'success', label: 'Check' },
	done: { canonical: 'success', label: 'Done' },
	question: { canonical: 'question', label: 'Question' },
	help: { canonical: 'question', label: 'Help' },
	faq: { canonical: 'question', label: 'FAQ' },
	warning: { canonical: 'warning', label: 'Warning' },
	caution: { canonical: 'warning', label: 'Caution' },
	attention: { canonical: 'warning', label: 'Attention' },
	failure: { canonical: 'failure', label: 'Failure' },
	fail: { canonical: 'failure', label: 'Fail' },
	missing: { canonical: 'failure', label: 'Missing' },
	danger: { canonical: 'danger', label: 'Danger' },
	error: { canonical: 'danger', label: 'Error' },
	bug: { canonical: 'bug', label: 'Bug' },
	example: { canonical: 'example', label: 'Example' },
	quote: { canonical: 'quote', label: 'Quote' },
	cite: { canonical: 'quote', label: 'Cite' },
};

function resolveType(rawType: string): { canonical: string; label: string } {
	const alias = CALLOUT_ALIASES[rawType.toLowerCase()];
	if (alias) return alias;
	// 미지원 타입: note 스타일로 폴백하되, 라벨은 원문 그대로(첫 글자만 대문자)
	const label = rawType.charAt(0).toUpperCase() + rawType.slice(1);
	return { canonical: 'note', label };
}

type CalloutChild = BlockContent | DefinitionContent;

/**
 * Obsidian 콜아웃(`> [!info] 제목`)을 `<details>/<summary>`(폴더블) 또는 `<div>`(일반)로 렌더링하는 remark 플러그인.
 *
 * 커스텀 제목이 없을 때는 타입 기본 라벨("Info" 등)을 실제 텍스트 노드로 넣지 않고
 * `data-callout-label` 속성 + CSS `content: attr(...)`로만 표시한다 — raw 원문에 없는 문자열을
 * 렌더된 텍스트로 만들어버리면 PostRealtimeViewer의 raw↔렌더 오프셋 매핑(댓글 앵커링)이 깨지기 때문.
 * 본문/커스텀 제목은 원문 텍스트 그대로 옮기므로 안전하다.
 */
const remarkCallouts: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'blockquote', (node: Blockquote) => {
		const first = node.children[0];
		if (!first || first.type !== 'paragraph') return;

		const firstChild = (first as Paragraph).children[0];
		if (!firstChild || firstChild.type !== 'text') return;

		const text = firstChild as Text;
		const newlineIndex = text.value.indexOf('\n');
		const markerLine = newlineIndex >= 0 ? text.value.slice(0, newlineIndex) : text.value;

		const match = MARKER_RE.exec(markerLine.trim());
		if (!match) return;

		const [, rawType, fold, customTitle] = match;
		const { canonical, label } = resolveType(rawType);

		// 마커 줄 다음(같은 paragraph 안 나머지) + 이후 형제 블록들 = 본문
		const bodyChildren: CalloutChild[] = [];
		const restOfFirstText = newlineIndex >= 0 ? text.value.slice(newlineIndex + 1) : '';
		const restOfFirstParagraphInline: PhrasingContent[] = (first as Paragraph).children.slice(1);
		if (restOfFirstText) {
			bodyChildren.push({
				type: 'paragraph',
				children: [{ type: 'text', value: restOfFirstText }, ...restOfFirstParagraphInline],
			});
		} else if (restOfFirstParagraphInline.length > 0) {
			bodyChildren.push({ type: 'paragraph', children: restOfFirstParagraphInline });
		}
		bodyChildren.push(...(node.children.slice(1) as CalloutChild[]));

		// 아이콘은 텍스트 없는 빈 span(CSS background-image로 그림)이라 raw↔렌더 매핑에 영향 없음
		const iconNode: PhrasingContent = {
			type: 'text',
			value: '',
			data: { hName: 'span', hProperties: { className: ['callout-icon'] } },
		};
		const titleChildren: PhrasingContent[] = customTitle?.trim()
			? [iconNode, { type: 'text', value: customTitle.trim() }]
			: [iconNode];

		const isFoldable = fold === '+' || fold === '-';
		const hasCustomTitle = !!customTitle?.trim();
		const titleNode: Paragraph = {
			type: 'paragraph',
			children: titleChildren,
			data: {
				hName: isFoldable ? 'summary' : 'div',
				hProperties: {
					className: ['callout-title'],
					...(hasCustomTitle ? {} : { 'data-callout-label': label }),
				},
			},
		};

		const newChildren: (Paragraph | Blockquote)[] = [titleNode];
		if (bodyChildren.length > 0) {
			newChildren.push({
				type: 'blockquote',
				children: bodyChildren as Blockquote['children'],
				data: { hName: 'div', hProperties: { className: ['callout-content'] } },
			});
		}

		node.children = newChildren as Blockquote['children'];
		node.data = {
			hName: isFoldable ? 'details' : 'div',
			hProperties: {
				className: ['callout', `callout-${canonical}`],
				'data-callout': canonical,
				...(fold === '+' ? { open: true } : {}),
			},
		};
	});
};

export default remarkCallouts;
