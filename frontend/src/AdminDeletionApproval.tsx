import { useEffect, useRef, useState } from 'react';
import { registerDeletionApproval, type ApprovalRequest } from './deletion-approval';

export default function AdminDeletionApproval() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const pending = useRef<ApprovalRequest | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const unregister = registerDeletionApproval(next => {
      if (pending.current) { next.reject(new Error('Conclua a autorização de exclusão em andamento.')); return; }
      pending.current = next; setError(''); setRequest(next);
    });
    return () => { unregister(); pending.current?.reject(new Error('Exclusão cancelada.')); pending.current = null; };
  }, []);
  useEffect(() => { if (request) dialog.current?.showModal(); }, [request]);
  function cancel() {
    if (busy) return;
    pending.current?.reject(new Error('Exclusão cancelada.'));
    pending.current = null; setRequest(null);
  }
  if (!request) return null;
  return <dialog ref={dialog} className="admin-delete-dialog" aria-labelledby="admin-delete-title" onCancel={e => { e.preventDefault(); cancel(); }}>
    <h2 id="admin-delete-title">Autorizar exclusão</h2>
    <p>Um administrador deve informar seu código e senha para autorizar somente esta exclusão.</p>
    {error && <p role="alert" className="alert">{error}</p>}
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const form = event.currentTarget, data = new FormData(form);
      setBusy(true); setError('');
      try {
        const result = await request.execute({ cod: String(data.get('cod')), password: String(data.get('password')) });
        request.resolve(result); pending.current = null; setRequest(null);
      } catch (e) { setError((e as Error).message); }
      finally { (form.elements.namedItem('password') as HTMLInputElement).value = ''; setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        <label>Código do administrador<input name="cod" inputMode="numeric" pattern="[0-9]+" required autoComplete="off" autoFocus /></label>
        <label>Senha do administrador<input name="password" type="password" required maxLength={256} autoComplete="off" /></label>
        <button type="submit" className="primary">{busy ? 'Autorizando…' : 'Autorizar e excluir'}</button>{' '}
        <button type="button" className="secondary" onClick={cancel}>Cancelar</button>
      </fieldset>
    </form>
  </dialog>;
}
