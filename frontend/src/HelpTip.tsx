import { useId, useState } from 'react';

export default function HelpTip({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="help-tip"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => setOpen(false)}
    onBlur={() => setOpen(false)}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    }}>
    <button type="button" className="help-tip-button" data-form-help
      aria-label={`Ajuda: ${label}`} aria-expanded={open} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>?</button>
    {open && <span id={id} role="tooltip" className="help-tip-content">{children}</span>}
  </span>;
}
