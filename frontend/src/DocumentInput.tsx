import { useRef, useState, type InputHTMLAttributes } from 'react';
import { digits, formatDocument } from './field-formats';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  kind?: 'cpf' | 'document'; value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
};
export default function DocumentInput({ kind = 'document', name, value, defaultValue = '', onValueChange, ...props }: Props) {
  const [local, setLocal] = useState(digits(defaultValue));
  const input = useRef<HTMLInputElement>(null);
  const raw = value === undefined ? local : digits(value);
  return <>
    <input {...props} ref={input} type="text" inputMode="numeric" value={formatDocument(raw, kind)}
      placeholder={kind === 'cpf' ? '000.000.000-00' : 'CPF ou CNPJ'}
      pattern={kind === 'cpf' ? '[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}' : '([0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}|[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2})'}
      onKeyDown={event => {
        props.onKeyDown?.(event);
        const el = event.currentTarget, position = el.selectionStart ?? 0;
        if (event.defaultPrevented || el.readOnly || position !== el.selectionEnd) return;
        if (event.key === 'Backspace' && position > 1 && /[.\/-]/.test(el.value[position - 1]))
          el.setSelectionRange(position - 2, position);
        if (event.key === 'Delete' && /[.\/-]/.test(el.value[position] ?? ''))
          el.setSelectionRange(position, position + 2);
      }}
      onChange={event => {
        const before = digits(event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length)).length;
        const next = digits(event.target.value).slice(0, kind === 'cpf' ? 11 : 14);
        setLocal(next); onValueChange?.(next);
        requestAnimationFrame(() => {
          const el = input.current;
          if (!el || document.activeElement !== el) return;
          let position = 0, count = 0;
          while (position < el.value.length && count < before) { if (/\d/.test(el.value[position])) count++; position++; }
          el.setSelectionRange(position, position);
        });
      }} />
    <input type="hidden" name={name} value={raw} disabled={props.disabled} />
  </>;
}
