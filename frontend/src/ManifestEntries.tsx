import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import type { EntryWeek } from "./FreightEntries";

type Entry = {
  id: number;
  numero: number;
  codigo_despesa: string;
  nome_despesa: string;
  tipo_despesa: string;
  data_lancamento: string;
  valor: string;
  descricao: string | null;
  departamento: string | null;
  pago: boolean;
  fechamento_id: number | null;
  emitido_em?: string | null;
};
type Expense = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
};
type Props = {
  startCreating?: boolean;
  context?: {
    number: string;
    plate: string;
    driver: string;
    vehicleType: string;
    unit: number;
    weeks: EntryWeek[];
  };
  manifestId: number;
  date: string;
  locked: boolean;
  token: string;
  onBusy: (busy: boolean) => void;
  onExpired: () => void;
  onUpdated: (manifest: unknown) => void;
};
const currency = (value: string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ManifestEntries({
  manifestId,
  date,
  locked,
  token,
  onBusy,
  onExpired,
  onUpdated,
  context,
  startCreating = false,
}: Props) {
  const [launchDate, setLaunchDate] = useState(date.slice(0, 10));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const base = `/manifests/${manifestId}/entries`;
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError((e as Error).message);
  }
  async function reload() {
    setLoading(true);
    setError("");
    setEntries([]);
    try {
      const [rows, types] = await Promise.all([
        api<Entry[]>(base, token),
        api<Expense[]>("/freight-expenses", token),
      ]);
      setEntries(rows);
      setExpenses(types.filter((t) => t.ativo));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [manifestId, token]);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (startCreating && !started && !loading && !error && !locked && expenses.length) {
      setEditing("new");
      setLaunchDate(date.slice(0, 10));
      setStarted(true);
    }
  }, [startCreating, started, loading, error, locked, expenses.length, date]);
  async function mutate(method: string, id?: number, payload?: unknown) {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ manifesto: unknown }>(
        id === undefined ? base : `${base}/${id}`,
        token,
        { method, ...(payload ? { body: JSON.stringify(payload) } : {}) },
      );
      setEditing(null);
      setRemoving(null);
      setSuccess(
        method === "DELETE"
          ? "Lançamento excluído. Valores recalculados."
          : "Lançamento salvo. Valores recalculados.",
      );
      onUpdated(result.manifesto);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(
      editing === "new" ? "POST" : "PUT",
      editing && editing !== "new" ? editing.id : undefined,
      {
        despesa_id: Number(data.get("despesa_id")),
        data_lancamento: data.get("data_lancamento"),
        valor: Number(data.get("valor")),
        descricao: String(data.get("descricao") || "").trim(),
        departamento: String(data.get("departamento") || "").trim(),
      },
    );
  }
  const current = editing && editing !== "new" ? editing : null;
  const selectedWeek = context?.weeks.find(w => launchDate >= w.data_inicio.slice(0, 10) && launchDate <= w.data_fim.slice(0, 10));
  // Require an explicit choice if the expense catalog differs from the historic snapshot.
  const matching = current
    ? expenses.find(
        (e) =>
          e.codigo === current.codigo_despesa &&
          e.nome === current.nome_despesa &&
          e.tipo === current.tipo_despesa,
      )
    : undefined;
  return (
    <section className="entries">
      <h3>Lançamentos do manifesto</h3>
      {context && <p className="muted">{context.number} · {context.plate} · {context.driver}</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy || loading}
        onClick={() => void reload()}
      >
        Atualizar lançamentos
      </button>
      {loading ? (
        <p role="status">Carregando lançamentos…</p>
      ) : (
        <>
          {!entries.length && <p>Nenhum lançamento cadastrado.</p>}
          {!!entries.length && (
            <div className="table-scroll">
              <SortableTable>
                <thead>
                  <tr>
                    <th>Número / Despesa / Descrição</th>
                    <th>Data / Tipo</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td data-sort-primary={e.numero} data-sort-secondary={e.nome_despesa} data-sort-tertiary={e.descricao ?? ''}>
                        {e.numero} · {e.nome_despesa}
                        <small>{e.descricao}</small>
                      </td>
                      <td>
                        {e.data_lancamento
                          .slice(0, 10)
                          .split("-")
                          .reverse()
                          .join("/")}
                        <small>{e.tipo_despesa}</small>
                      </td>
                      <td>{currency(e.valor)}</td>
                      <td>
                        {e.pago || e.fechamento_id != null
                          ? "Pago / fechado"
                          : "Em aberto"}
                      </td>
                      <td>
                        {!locked && !e.pago && e.fechamento_id == null && (
                          <>
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy || !!editing || !!removing}
                              onClick={() => {
                                setEditing(e);
                                setLaunchDate(e.data_lancamento.slice(0, 10));
                                setError("");
                                setSuccess("");
                              }}
                            >
                              Editar lançamento {e.numero}
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy || !!editing || !!removing}
                              onClick={() => {
                                setRemoving(e);
                                setError("");
                                setSuccess("");
                              }}
                            >
                              Excluir lançamento {e.numero}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </SortableTable>
            </div>
          )}
          {locked ? (
            <p>
              Manifesto fechado: os lançamentos estão disponíveis apenas para
              consulta.
            </p>
          ) : (
            !editing &&
            !removing && (
              <button
                type="button"
                className="secondary"
                disabled={busy || !!error || !expenses.length}
                onClick={() => {
                  setEditing("new");
                  setLaunchDate(date.slice(0, 10));
                  setSuccess("");
                }}
              >
                + Novo lançamento
              </button>
            )
          )}
          {!locked && !expenses.length && (
            <p>
              Cadastre uma despesa ativa na unidade para incluir lançamentos.
            </p>
          )}
        </>
      )}
      {removing && (
        <div className="alert">
          <p>
            Excluir o lançamento {removing.numero}, de{" "}
            {currency(removing.valor)}? O manifesto será recalculado. Esta ação
            não pode ser desfeita.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void mutate("DELETE", removing.id)}
          >
            Confirmar exclusão
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            Cancelar exclusão
          </button>
        </div>
      )}
      {editing && (
        <form
          className="launch-form"
          key={current?.id ?? "new"}
          onSubmit={save}
        >
          <h3>
            {current
              ? `Editar lançamento ${current.numero}`
              : "Novo lançamento"}
          </h3>
          {current && !matching && (
            <p className="alert">
              O cadastro da despesa mudou ou está inativo. Selecione uma despesa
              ativa e confira o tipo antes de salvar.
            </p>
          )}
          <fieldset disabled={busy}>
            <div className="launch-heading">
              <label>
                Núm. lançamento
                <input
                  readOnly
                  value={current?.numero ?? "Automático ao salvar"}
                />
              </label>
              <label>
                Emissão
                <input
                  readOnly
                  value={
                    current?.emitido_em
                      ? new Date(current.emitido_em).toLocaleDateString("pt-BR")
                      : "Automática ao salvar"
                  }
                />
              </label>
            </div>
            {context && (
              <div className="launch-context">
                <label>
                  Semana
                  <input
                    readOnly
                    value={
                      context.weeks.find(
                        (w) =>
                          launchDate >= w.data_inicio.slice(0, 10) &&
                          launchDate <= w.data_fim.slice(0, 10),
                      )?.codigo ?? "Sem semana cadastrada"
                    }
                  />
                </label>
                {selectedWeek && <small className="muted">{selectedWeek.data_inicio.slice(0,10).split("-").reverse().join("/")} a {selectedWeek.data_fim.slice(0,10).split("-").reverse().join("/")}</small>}
                <label>
                  Placa
                  <input readOnly value={context.plate} />
                </label>
                <label>
                  Tipo de veículo
                  <input readOnly value={context.vehicleType ?? ""} />
                </label>
                <label>
                  Motorista
                  <input readOnly value={context.driver} />
                </label>
              </div>
            )}
            <div className="form-grid">
              <label>
                Data do lançamento
                <input
                  name="data_lancamento"
                  type="date"
                  required
                  value={launchDate}
                  onChange={(e) => setLaunchDate(e.target.value)}
                />
              </label>
              {context && (
                <label>
                  Manifesto
                  <input
                    readOnly
                    value={`${context.unit} · ${context.number}`}
                  />
                </label>
              )}
              <label>
                Tipo / Despesa
                <select
                  aria-label="Despesa"
                  name="despesa_id"
                  required
                  defaultValue={matching?.id ?? ""}
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {expenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.codigo} · {e.nome} · {e.tipo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor do lançamento
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  max="9999999999999.99"
                  step="0.01"
                  required
                  defaultValue={current?.valor ?? ""}
                />
              </label>
              <label>
                Departamento
                <input
                  name="departamento"
                  maxLength={30}
                  defaultValue={current?.departamento ?? ""}
                />
              </label>
            </div>
            <label>
              Descrição do lançamento
              <textarea
                name="descricao"
                maxLength={255}
                defaultValue={current?.descricao ?? ""}
              />
            </label>
            <p className="muted">
              A semana é definida pela data. Créditos atualizam o custo do
              manifesto; débitos e adiantamentos seguem as regras do fechamento.
            </p>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar lançamento"}
            </button>{" "}
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancelar edição do lançamento
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
