/** 선택 영역을 marker로 감싼다 (굵게 **, 기울임 * 등). 선택 없으면 placeholder 텍스트를 넣고 선택 상태로 둔다. */
export function wrapSelection(
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
