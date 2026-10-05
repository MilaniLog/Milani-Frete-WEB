// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdminDeletionApproval from './AdminDeletionApproval';
import { api } from './api';
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Harness() {
  const [status,setStatus]=useState('');
  return <><AdminDeletionApproval/><button onClick={() => void api('/registrations/vehicles/ABC1234','operator-token',{method:'DELETE'}).then(()=>setStatus('Excluído')).catch(e=>setStatus(e.message))}>Excluir</button><p>{status}</p></>;
}
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
it('solicita senha, permite corrigir senha incorreta e mantém o token do operador',async()=>{
  vi.stubGlobal('fetch',vi.fn(async (_url,options)=>{
    const auth=JSON.parse(options.body||'{}').admin_authorization;
    return auth?.password==='correct' ? response({}) : response({code:'ADMIN_APPROVAL_REQUIRED',message:auth?'Credenciais inválidas':'Autorização necessária'},403);
  }));
  render(<Harness/>);fireEvent.click(screen.getByText('Excluir'));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Código do administrador'),{target:{value:'8'}});
  fireEvent.change(screen.getByLabelText('Senha do administrador'),{target:{value:'wrong'}});
  fireEvent.click(screen.getByText('Autorizar e excluir'));
  await screen.findByText('Credenciais inválidas');
  expect((screen.getByLabelText('Senha do administrador') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Senha do administrador'),{target:{value:'correct'}});
  fireEvent.click(screen.getByText('Autorizar e excluir'));
  await screen.findByText('Excluído');
  expect(screen.queryByRole('dialog')).toBeNull();
  const calls=vi.mocked(fetch).mock.calls;
  expect(calls).toHaveLength(3);
  expect((calls[2][1]?.headers as any).Authorization).toBe('Bearer operator-token');
});
it('cancelar não repete a exclusão',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({code:'ADMIN_APPROVAL_REQUIRED'},403)));
  render(<Harness/>);fireEvent.click(screen.getByText('Excluir'));
  fireEvent.click(await screen.findByText('Cancelar'));
  await screen.findByText('Exclusão cancelada.');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('ADM autorizado pelo servidor exclui sem pedir senha',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({})));
  render(<Harness/>);fireEvent.click(screen.getByText('Excluir'));
  await screen.findByText('Excluído');expect(screen.queryByRole('dialog')).toBeNull();
});
