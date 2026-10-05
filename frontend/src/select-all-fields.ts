export function focusNextField(field: HTMLElement) {
  const scope = field.closest('form') ?? field.closest('[role="dialog"]') ?? document.body;
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('input, select, textarea, button'))
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled, [readonly], [type="hidden"], [data-form-help]') && el.getClientRects().length > 0)
    .sort((a,b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
  const index = controls.indexOf(field);
  if (index >= 0) controls[index + 1]?.focus();
}

/** Delegation also covers forms opened later in dialogs and other pages. */
export function installSelectAllFields(root: Document) {
  const advance = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    if (field instanceof HTMLInputElement && ['submit','button','reset','file'].includes(field.type)) return;
    event.preventDefault();
    focusNextField(field);
  };
  const select = (event: Event) => {
    const field = event.target;
    if (
      !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) ||
      field.disabled || field.readOnly
    ) return;
    if (field instanceof HTMLInputElement && ![
      'text', 'search', 'tel', 'url', 'email', 'password', 'number',
    ].includes(field.type)) return;
    field.select();
  };
  root.addEventListener('focusin', select);
  // A mouse click can collapse the selection made during focus.
  root.addEventListener('click', select);
  root.addEventListener('keydown', advance);
  return () => {
    root.removeEventListener('focusin', select);
    root.removeEventListener('click', select);
    root.removeEventListener('keydown', advance);
  };
}
