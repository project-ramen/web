import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { TbBold, TbItalic, TbH1, TbBlockquote, TbLink, TbCode, TbList, TbListNumbers, TbListCheck, TbPhoto } from 'react-icons/tb';
import { getApiBase } from '../lib/apiBase';
import { setAdminPassword } from '../lib/adminAuth';
import remarkWikilinks from '../lib/remarkWikilinks';
import { usePostLinkIndex } from '../lib/usePostLinkIndex';

export type PostEditorSaved = {
  slug: string;
  title: string;
  body_md: string;
  published: number;
  tags: string[];
};

type PostEditorProps = {
  mode: 'create' | 'edit';
  initial?: {
    slug: string;
    title: string;
    body_md: string;
    published: number;
    tags?: string[];
  };
  onCancel: () => void;
  onSaved: (saved: PostEditorSaved) => void;
};

/** 점(.)만 대시로 바꿔 URL에 안전한 slug로 (Obsidian/app 쪽 slug 정규화와 동일한 규칙) */
function slugNormalize(s: string): string {
  return s.trim().replace(/\./g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

type ToolbarAction = 'bold' | 'italic' | 'heading' | 'quote' | 'link' | 'code' | 'ul' | 'ol' | 'task';

/** 선택 영역을 marker로 감싸고, 비어 있으면 placeholder를 채운 뒤 그 부분을 선택 상태로 남김 */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  setValue: (v: string) => void,
  marker: string,
  placeholder: string
) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const text = selected || placeholder;
  const next = value.slice(0, selectionStart) + marker + text + marker + value.slice(selectionEnd);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const start = selectionStart + marker.length;
    textarea.setSelectionRange(start, start + text.length);
  });
}

/** 커서(또는 선택 영역) 위치에 텍스트를 삽입하고 그 뒤로 커서를 이동 */
function insertAtCursor(textarea: HTMLTextAreaElement, value: string, setValue: (v: string) => void, text: string) {
  const { selectionStart, selectionEnd } = textarea;
  const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = selectionStart + text.length;
    textarea.setSelectionRange(pos, pos);
  });
}

/** 선택 영역이 걸친 줄들 전체 앞에 prefix를 붙임 */
function prefixLines(
  textarea: HTMLTextAreaElement,
  value: string,
  setValue: (v: string) => void,
  prefix: string | ((lineIndex: number) => string)
) {
  const { selectionStart, selectionEnd } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selectionEnd > lineStart ? selectionEnd - 1 : selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const prefixed = lines.map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l).join('\n');
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
  });
}

function applyToolbarAction(
  textarea: HTMLTextAreaElement,
  action: ToolbarAction,
  value: string,
  setValue: (v: string) => void
) {
  switch (action) {
    case 'bold':
      wrapSelection(textarea, value, setValue, '**', '굵게 강조할 텍스트');
      return;
    case 'italic':
      wrapSelection(textarea, value, setValue, '*', '기울일 텍스트');
      return;
    case 'code': {
      const { selectionStart, selectionEnd } = textarea;
      const selected = value.slice(selectionStart, selectionEnd);
      if (selected.includes('\n')) {
        const next = value.slice(0, selectionStart) + '```\n' + (selected || '코드') + '\n```' + value.slice(selectionEnd);
        setValue(next);
        requestAnimationFrame(() => textarea.focus());
      } else {
        wrapSelection(textarea, value, setValue, '`', '코드');
      }
      return;
    }
    case 'link': {
      const { selectionStart, selectionEnd } = textarea;
      const selected = value.slice(selectionStart, selectionEnd);
      const text = selected || '링크 텍스트';
      const next = value.slice(0, selectionStart) + `[${text}](url)` + value.slice(selectionEnd);
      setValue(next);
      requestAnimationFrame(() => {
        textarea.focus();
        const urlStart = selectionStart + text.length + 3;
        textarea.setSelectionRange(urlStart, urlStart + 3);
      });
      return;
    }
    case 'heading':
      prefixLines(textarea, value, setValue, '## ');
      return;
    case 'quote':
      prefixLines(textarea, value, setValue, '> ');
      return;
    case 'ul':
      prefixLines(textarea, value, setValue, '- ');
      return;
    case 'ol':
      prefixLines(textarea, value, setValue, (i) => `${i + 1}. `);
      return;
    case 'task':
      prefixLines(textarea, value, setValue, '- [ ] ');
      return;
  }
}

const TOOLBAR_ITEMS: { action: ToolbarAction; label: string; Icon: typeof TbBold }[] = [
  { action: 'heading', label: '제목', Icon: TbH1 },
  { action: 'bold', label: '굵게', Icon: TbBold },
  { action: 'italic', label: '기울임', Icon: TbItalic },
  { action: 'quote', label: '인용', Icon: TbBlockquote },
  { action: 'code', label: '코드', Icon: TbCode },
  { action: 'link', label: '링크', Icon: TbLink },
  { action: 'ul', label: '목록', Icon: TbList },
  { action: 'ol', label: '번호 목록', Icon: TbListNumbers },
  { action: 'task', label: '체크리스트', Icon: TbListCheck },
];

export default function PostEditor({ mode, initial, onCancel, onSaved }: PostEditorProps) {
  const { resolve: resolveWikilink } = usePostLinkIndex();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [body, setBody] = useState(initial?.body_md ?? '');
  const [published, setPublished] = useState(Boolean(initial?.published));
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(', '));
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (mode === 'create' && !slugTouched && slugNormalize(title) !== slug) {
    setSlug(slugNormalize(title));
  }

  const handleToolbarClick = (action: ToolbarAction) => {
    const el = textareaRef.current;
    if (!el) return;
    applyToolbarAction(el, action, body, setBody);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart, selectionEnd } = el;
    const next = body.slice(0, selectionStart) + '  ' + body.slice(selectionEnd);
    setBody(next);
    requestAnimationFrame(() => {
      el.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  };

  const uploadImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    const el = textareaRef.current;
    if (!password.trim()) {
      setError('이미지를 업로드하려면 관리자 비밀번호를 먼저 입력하세요.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      for (const file of images) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${getApiBase()}/api/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${password.trim()}` },
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `이미지 업로드 실패 (${res.status})`);
        const alt = file.name.replace(/\.[a-zA-Z0-9]+$/, '');
        if (el) insertAtCursor(el, body, setBody, `![${alt}](${data.url})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleImageButtonClick = () => fileInputRef.current?.click();

  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void uploadImages(files);
  };

  const handleTextareaDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void uploadImages(files);
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    void uploadImages(files);
  };

  const canSave = title.trim() && slug.trim() && password.trim() && !saving;

  const submit = async () => {
    if (!canSave) return;
    setError('');
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`${getApiBase()}/api/posts/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password.trim()}` },
        body: JSON.stringify({
          slug: slug.trim(),
          title: title.trim(),
          body_md: body,
          published: published ? 1 : 0,
          tags,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('비밀번호가 올바르지 않습니다.');
        }
        throw new Error(data?.error || `저장 실패 (${res.status})`);
      }
      setAdminPassword(password.trim());
      onSaved({ slug: data.slug ?? slug.trim(), title: title.trim(), body_md: body, published: published ? 1 : 0, tags });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="m-0 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {mode === 'create' ? '새 포스트' : '포스트 수정'}
        </h1>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="py-2 px-3 text-sm bg-transparent border-none text-neutral-500 dark:text-neutral-400 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-60"
        >
          취소
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="post-editor-title-input" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          제목
        </label>
        <input
          id="post-editor-title-input"
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          className="w-full py-2 px-3 border border-neutral-200 dark:border-neutral-600 rounded-lg text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="post-editor-slug-input" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          slug{mode === 'edit' ? ' (수정 불가)' : ''}
        </label>
        <input
          id="post-editor-slug-input"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          disabled={saving || mode === 'edit'}
          className="w-full py-2 px-3 border border-neutral-200 dark:border-neutral-600 rounded-lg text-sm font-mono bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
        />
      </div>

      <div className="flex flex-col gap-1 flex-1 min-h-[420px]">
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">본문 (마크다운)</label>
        <div className="flex flex-col flex-1 min-h-[420px] border border-neutral-200 dark:border-neutral-600 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800/60 pr-1">
            <div className="flex">
              <button
                type="button"
                onClick={() => setActiveTab('write')}
                className={`py-2 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'write'
                    ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`py-2 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'preview'
                    ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                Preview
              </button>
            </div>
            {activeTab === 'write' && (
              <div className="flex items-center gap-0.5">
                {TOOLBAR_ITEMS.map(({ action, label, Icon }) => (
                  <button
                    key={action}
                    type="button"
                    title={label}
                    aria-label={label}
                    disabled={saving}
                    onClick={() => handleToolbarClick(action)}
                    className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-50 transition-colors"
                  >
                    <Icon className="w-4 h-4" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  title="이미지"
                  aria-label="이미지 삽입"
                  disabled={saving || uploading}
                  onClick={handleImageButtonClick}
                  className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-50 transition-colors"
                >
                  <TbPhoto className="w-4 h-4" aria-hidden />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageFileSelected}
                  className="hidden"
                />
              </div>
            )}
          </div>
          {activeTab === 'write' ? (
            <textarea
              id="post-editor-body-input"
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onDrop={handleTextareaDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={handleTextareaPaste}
              disabled={saving}
              className="w-full flex-1 min-h-[380px] py-3 px-3 border-none resize-y font-mono text-sm leading-relaxed bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none"
              placeholder="마크다운으로 작성하세요… (이미지는 드래그, 붙여넣기, 툴바 버튼으로 삽입할 수 있습니다)"
            />
          ) : (
            <div className="flex-1 min-h-[380px] overflow-y-auto p-3">
              {body.trim() ? (
                <article className="markdown-content leading-[1.7] flow-root">
                  <ReactMarkdown remarkPlugins={[remarkGfm, [remarkWikilinks, { resolve: resolveWikilink }]]} rehypePlugins={[rehypeSlug, rehypeHighlight]}>
                    {body}
                  </ReactMarkdown>
                </article>
              ) : (
                <p className="text-neutral-400 dark:text-neutral-500 italic m-0">미리볼 내용이 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="post-editor-tags-input" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          태그 (쉼표로 구분)
        </label>
        <input
          id="post-editor-tags-input"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          disabled={saving}
          placeholder="예: kubernetes, 인프라"
          className="w-full py-2 px-3 border border-neutral-200 dark:border-neutral-600 rounded-lg text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 select-none">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          disabled={saving}
          className="w-4 h-4"
        />
        공개
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="post-editor-password-input" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          관리자 비밀번호
        </label>
        <input
          id="post-editor-password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          className="w-full py-2 px-3 border border-neutral-200 dark:border-neutral-600 rounded-lg text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
        />
      </div>

      {uploading ? <p className="m-0 text-sm text-neutral-500 dark:text-neutral-400">이미지 업로드 중…</p> : null}
      {error ? <p className="m-0 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="py-2 px-3 text-sm bg-transparent border-none text-neutral-500 dark:text-neutral-400 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-60"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="py-2 px-4 text-sm font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-lg cursor-pointer hover:enabled:opacity-90 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
