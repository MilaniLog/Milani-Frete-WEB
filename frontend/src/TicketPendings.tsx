import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import SearchableSelect from "./SearchableSelect";

type Pending = {
  id: number;
  invoice: string | null;
  unit: number | null;
  subject: string | null;
  raw_message: string | null;
  source_status: string | null;
  error_reason: string;
};

export default function TicketPendings({ token, expired, back }: {
  token: string;
  expired: () => void;
  back: () => void;
}) {
  const [rows, setRows] = useState<Pending[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState<Pending | null>(null);
  const [type, setType] = useState("");
  const [freight, setFreight] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) expired();
    else setError((reason as Error).message);
  }

  useEffect(() => {
    Promise.all([
      api<{ rows: Pending[]; total: number }>("/tickets/pending", token),
      api<{ types: string[] }>("/tickets/options", token),
    ]).then(([pending, options]) => {
      setRows(pending.rows);
      setTotal(pending.total);
      setTypes(options.types);
    }).catch(fail);
  }, [token]);

  function edit(item: Pending) {
    setEditing(item);
    setType("");
    setFreight("");
    setMessage(item.raw_message ?? "");
    window.setTimeout(() => document.getElementById("ticket-pending-edit")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tickets/pending/${editing.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ type, freight: Number(freight.replace(",", ".")), message }),
      });
      setRows((current) => current.filter((item) => item.id !== editing.id));
      setTotal((value) => Math.max(0, value - 1));
      setEditing(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      fail(reason);
    } finally {
      setBusy(false);
    }
  }

  return <div className="content tickets-page">
    {error && <p role="alert" className="alert">{error}</p>}
    <div className="actions ticket-top-actions">
      <button type="button" className="secondary" onClick={back}>Voltar para Tickets</button>
    </div>
    <section className="panel ticket-pending">
      <div className="ticket-results-heading">
        <h2>Pendências de extração</h2>
        <span>{total.toLocaleString("pt-BR")} registro(s) preservado(s)</span>
      </div>
      <p>Registros que não foram inseridos como tickets porque a mensagem não estava no padrão combinado.</p>
      {rows.length ? <div className="table-scroll"><table><thead><tr>
        <th>Nota</th><th>Unidade</th><th>Assunto</th><th>Status</th><th>Motivo</th><th>Mensagem original</th><th>Ações</th>
      </tr></thead><tbody>{rows.map((item) => <tr key={item.id}>
        <td>{item.invoice ?? ""}</td><td>{item.unit ?? ""}</td><td>{item.subject ?? ""}</td>
        <td>{item.source_status ?? ""}</td><td>{item.error_reason}</td>
        <td className="ticket-pending-message">{item.raw_message ?? ""}</td>
        <td><button type="button" className="text-button" onClick={() => edit(item)}>Ajustar</button></td>
      </tr>)}</tbody></table></div> : <p>Nenhuma pendência de extração.</p>}
    </section>
    {editing && <section id="ticket-pending-edit" className="panel ticket-pending-edit">
      <h2>Ajustar pendência da nota {editing.invoice ?? ""}</h2>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>Tipo<SearchableSelect value={type} onChange={(event) => setType(event.target.value)} required>
            <option value="">Selecione</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}
          </SearchableSelect></label>
          <label>Valor<input value={freight} onChange={(event) => setFreight(event.target.value)} inputMode="decimal" placeholder="0,00" required /></label>
          <label className="ticket-pending-edit-message">Mensagem<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} required /></label>
        </div>
        <div className="actions">
          <button className="primary" disabled={busy}>Salvar ajuste</button>
          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
        </div>
      </form>
    </section>}
  </div>;
}
