import { Children, Fragment, cloneElement, isValidElement, useState, type ReactNode, type ReactElement, type TableHTMLAttributes } from 'react';

type Element = ReactElement<Record<string, any>>;
function elements(children: ReactNode, prefix = ''): Element[] {
  return Children.toArray(children).flatMap(node => isValidElement(node)
    ? node.type === Fragment ? elements((node as Element).props.children, `${prefix}${node.key}/`) : [cloneElement(node as Element, { key: `${prefix}${node.key}` })] : []);
}
function text(node: ReactNode): string {
  return Children.toArray(node).map(n => isValidElement(n) ? text((n as Element).props.children) : String(n)).join('');
}
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
function value(raw: string, label: string): string | number {
  const s = raw.trim().replace(/\u00a0/g, ' ');
  const date = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (date) return Number(date[3] + date[2] + date[1]);
  if (/semana/i.test(label) && /^\d{4}$/.test(s)) return Number(s.slice(2) + s.slice(0, 2));
  const n = s.replace(/R\$|%|\s/g, '');
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(n)) return Number(n.replace(/\./g, '').replace(',', '.'));
  return s;
}
function cellText(row: Element, column: number, part: number, split: boolean): string {
  const cell = elements(row.props.children)[column];
  if (!cell) return '';
  const explicit = cell.props[['data-sort-primary', 'data-sort-secondary', 'data-sort-tertiary'][part]];
  if (explicit != null) return String(explicit);
  if (!split) return text(cell.props.children);
  const nodes = Children.toArray(cell.props.children);
  return text(nodes.filter(n => (isValidElement(n) && n.type === 'small') === Boolean(part)));
}

/** Sort React rows rather than moving DOM nodes, preserving row actions and updates. */
export default function SortableTable({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const [sort, setSort] = useState<{ column: number; part: number; label: string; split: boolean; descending: boolean } | null>(null);
  const sections = elements(children);
  return <table {...props}>{sections.map(section => {
    if (section.type === 'thead') return cloneElement(section, {}, elements(section.props.children).map(row =>
      cloneElement(row, {}, elements(row.props.children).map((cell, column) => {
        const title = text(cell.props.children);
        if (/^aç(?:ão|ões)$/i.test(title.trim()) || !title.trim()) return cell;
        const labels = title.split(' / ');
        return cloneElement(cell, { 'aria-sort': sort?.column === column ? sort.descending ? 'descending' : 'ascending' : 'none' },
          labels.map((label, part) => <Fragment key={part}>{part > 0 && ' / '}<button type="button" className="table-sort"
            title="Ordenar: crescente, decrescente e ordem original" aria-label={`Ordenar por ${label}`}
            onClick={() => setSort(current => current?.column === column && current.part === part
              ? current.descending ? null : { ...current, descending: true }
              : { column, part, label, split: labels.length > 1, descending: false })}>
            {label}<span aria-hidden="true">{sort?.column === column && sort.part === part ? sort.descending ? ' ▼' : ' ▲' : ' ↕'}</span>
          </button></Fragment>));
      }))));
    if (section.type === 'tbody' && sort) {
      const rows = elements(section.props.children).map((row, index) => ({ row, index }));
      rows.sort((a, b) => {
        const av = value(cellText(a.row, sort.column, sort.part, sort.split), sort.label);
        const bv = value(cellText(b.row, sort.column, sort.part, sort.split), sort.label);
        const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv));
        return comparison * (sort.descending ? -1 : 1) || a.index - b.index;
      });
      return cloneElement(section, {}, rows.map(({ row }) => row));
    }
    return section;
  })}</table>;
}
