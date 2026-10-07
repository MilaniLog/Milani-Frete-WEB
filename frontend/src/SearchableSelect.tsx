import { useEffect, useId, useRef, useState, type SelectHTMLAttributes } from "react";
import { focusNextField } from "./select-all-fields";
import { normalizePlate } from "./field-formats";

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Keeps the original select as the form value; typing never submits a made-up ID. */
export default function SearchableSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [options, setOptions] = useState<{value:string; label:string}[]>([]);
  const [filter, setFilter] = useState(false);
  useEffect(() => {
    // Parent forms may restore the selected value in their initialization effect.
    let live = true;
    queueMicrotask(() => {
      if (!live || !select.current) return;
      setOptions(Array.from(select.current.options).filter(o=>o.value && !o.disabled).map(o=>({value:o.value,label:o.text})));
      if (select.current.value) { setText(select.current.selectedOptions[0]?.text ?? ''); input.current?.setCustomValidity(''); }
      else if (!open) setText('');
    });
    return () => { live=false; };
  }, [props.children, props.value, open]);
  const matches = options.filter(o=>!filter || normalize(o.label).includes(normalize(text)));
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({block:'nearest'});
  }, [open, active, id]);
  function change(value:string) {
    if (!select.current) return;
    select.current.value=value;
    select.current.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function choose(option:typeof options[number]) {
    change(option.value); setText(option.label); setOpen(false); setFilter(false);
    input.current?.setCustomValidity('');
  }
  return <div className="searchable-select" onBlur={e=>{
    if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setFilter(false); }
  }}>

    <input ref={input} role="combobox" aria-label={props['aria-label']} aria-expanded={open} aria-controls={id}
      aria-autocomplete="list" aria-activedescendant={open && active>=0 && matches[active] ? `${id}-${active}` : undefined}
      autoComplete="off" disabled={props.disabled} required={props.required} value={text}
      placeholder="Digite para pesquisar ou selecione"
      onFocus={()=>{setOpen(props.name === 'cpf_motorista' ? false : !select.current?.value);setFilter(false);setActive(-1);}}
      onClick={()=>setOpen(true)}
      onChange={e=>{const value = props.name === 'placa' ? normalizePlate(e.target.value) : e.target.value;setText(value);setFilter(true);setOpen(true);setActive(-1);change('');e.target.setCustomValidity(value ? 'Selecione uma opção da lista.' : '');}}
      onKeyDown={e=>{
        if(e.key==='ArrowDown' || e.key==='ArrowUp') {e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(matches.length-1,i+(e.key==='ArrowDown'?1:-1))));}
        if(e.key==='Escape') {e.preventDefault();setOpen(false);}
        if(e.key==='Enter' && open && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const field = e.currentTarget;
          if (active >= 0 && matches[active]) {
            choose(matches[active]);
            queueMicrotask(() => focusNextField(field));
            return;
          }
          if (select.current?.value && !filter) {
            setOpen(false);
            queueMicrotask(() => focusNextField(field));
            return;
          }
          if(filter && matches.length === 1) {
            choose(matches[0]);
            queueMicrotask(() => focusNextField(field));
          }
        }
      }} />
    <select {...props} ref={select} required={false} aria-label={undefined} aria-hidden="true" tabIndex={-1} style={{display:'none'}} />
    {open && !props.disabled && <div id={id} role="listbox" className="searchable-options">
      {matches.map((option,i)=><div key={option.value} id={`${id}-${i}`} role="option" aria-selected={active===i}
        onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option)}>{option.label}</div>)}
      {!matches.length && <div role="status">Nenhuma opção encontrada.</div>}
    </div>}
  </div>;
}
