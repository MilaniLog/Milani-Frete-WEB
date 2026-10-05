// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SortableTable from './SortableTable';
afterEach(cleanup);
const initial = [
  { id: 1, name: 'Zelia', amount: 'R$ 1.200,00', date: '01/01/2027', plate: 'ABC1234' },
  { id: 2, name: 'Álvaro', amount: 'R$ 90,00', date: '31/12/2026', plate: 'XYZ1234' },
  { id: 3, name: 'Bruno', amount: 'R$ -5,00', date: '02/01/2027', plate: 'DEF1234' },
];
function table(rows = initial, action = vi.fn()) {
  return <SortableTable><thead><tr><><th>Veículo / Motorista</th><th>Valor</th></><th>Data</th><th>Ações</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.plate}</b><small>{r.name}</small></td><td>{r.amount}</td><td>{r.date}</td><td><button onClick={() => action(r.id)}>Editar {r.id}</button></td></tr>)}</tbody></SortableTable>;
}
const order = () => screen.getAllByRole('row').slice(1).map(row => within(row).getByRole('button').textContent);
it('ordena campo secundário com acentos, inverte e restaura ordem original', () => {
  render(table());
  const button = screen.getByRole('button', {name:'Ordenar por Motorista'});
  fireEvent.click(button); expect(order()).toEqual(['Editar 2','Editar 3','Editar 1']);
  fireEvent.click(button); expect(order()).toEqual(['Editar 1','Editar 3','Editar 2']);
  fireEvent.click(button); expect(order()).toEqual(['Editar 1','Editar 2','Editar 3']);
  expect(screen.queryByRole('button', {name:'Ordenar por Ações'})).toBeNull();
});
it('compara valores monetários e datas por valor real', () => {
  render(table());
  fireEvent.click(screen.getByRole('button', {name:'Ordenar por Valor'}));
  expect(order()).toEqual(['Editar 3','Editar 2','Editar 1']);
  fireEvent.click(screen.getByRole('button', {name:'Ordenar por Data'}));
  expect(order()).toEqual(['Editar 2','Editar 1','Editar 3']);
});
it('mantém ações vinculadas e ordena registros atualizados sem modificar o array', () => {
  const action = vi.fn(); const view = render(table(initial, action));
  fireEvent.click(screen.getByRole('button', {name:'Ordenar por Motorista'}));
  fireEvent.click(screen.getAllByRole('row')[1].querySelector('button')!);
  expect(action).toHaveBeenCalledWith(2);
  view.rerender(table([initial[0], initial[2]], action));
  expect(order()).toEqual(['Editar 3','Editar 1']);
  expect(initial.map(r => r.id)).toEqual([1,2,3]);
});
