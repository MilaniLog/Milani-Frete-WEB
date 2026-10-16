import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import SortableTable from "./SortableTable";

type Unit = { codigo: number; local: string; dominio: "MLN" | "LOOG" | null };

export default function Units({ token, expired }: { token: string; expired: () => void }) {
  const [rows, setRows] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Unit | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function fail(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) expired();
    else setError((reason as Error).message);
  }
  async function load() {
    setBusy(true); setError("");
    try { setRows(await api<Unit[]>("/registrations/units", token)); }
    catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [token]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      codigo: Number(data.get("codigo")),
      local: String(data.get("local")),
      dominio: String(data.get("dominio")),
    };
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/registrations/units${editing !== "new" ? `/${editing!.codigo}` : ""}`, token, {
        method: editing === "new" ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setSuccess("Unidade salva com sucesso.");
      await load();
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }
  const current = editing === "new" ? null : editing;
  return <section className="content">
    <div className="page-heading">
      <button className="primary" disabled={busy || !!editing} onClick={() => setEditing("new")}>+ Nova unidade</button>
    </div>
    {error && <p className="alert" role="alert">{error}</p>}
    {success && <p className="success" role="status">{success}</p>}
    {editing && <section className="panel reference-form">
      <h2>{current ? "Editar unidade" : "Nova unidade"}</h2>
      <form className="legacy-register" onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label>Código<input name="codigo" type="number" min="1" required readOnly={!!current} defaultValue={current?.codigo ?? ""} /></label>
            <label>Local<input name="local" required minLength={2} maxLength={20} defaultValue={current?.local ?? ""} /></label>
            <label>Domínio<select name="dominio" required defaultValue={current?.dominio ?? ""}>
              <option value="">Selecione</option><option>MLN</option><option>LOOG</option>
            </select></label>
          </div>
          <button className="primary">Salvar unidade</button>{" "}
          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
        </fieldset>
      </form>
    </section>}
    <section className="panel">
      <button className="secondary" disabled={busy || !!editing} onClick={() => void load()}>Atualizar unidades</button>
      {busy && <p role="status">Carregando…</p>}
      <div className="table-scroll"><SortableTable><thead><tr><th>Código</th><th>Local</th><th>Domínio</th><th>Ações</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.codigo}><td>{row.codigo}</td><td>{row.local}</td><td>{row.dominio}</td><td><button className="text-button" disabled={busy || !!editing} onClick={() => setEditing(row)}>Editar unidade {row.codigo}</button></td></tr>)}</tbody>
      </SortableTable></div>
      {!busy && !rows.length && <p className="empty">Nenhuma unidade cadastrada.</p>}
    </section>
  </section>;
}
