import { normalizeWeek } from "./field-formats";
import SortableTable from "./SortableTable";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";

type Week = { codigo: string; data_inicio: string; data_fim: string };
type Expense = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
};
type Row = Week | Expense;
type Props = {
  kind: "weeks" | "expenses";
  token: string;
  isAdmin: boolean;
  expired: () => void;
};
const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");

export default function ReferenceData({
  kind,
  token,
  isAdmin,
  expired,
}: Props) {
  const weeks = kind === "weeks";
  const path = weeks ? "/weeks" : "/freight-expenses";
  const canEdit = isAdmin;
  const [rows, setRows] = useState<Row[]>([]);
  const formRef = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load() {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      setRows(await api<Row[]>(path, token));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!weeks || isAdmin) void load();
  }, [path, token, canEdit]);
  useEffect(() => {
    if (!editing) return;
    window.setTimeout(
      () => formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
      0,
    );
  }, [editing]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canEdit) return;
    const data = new FormData(event.currentTarget);
    const payload = weeks
      ? {
          codigo: String(data.get("codigo")),
          data_inicio: String(data.get("data_inicio")),
          data_fim: String(data.get("data_fim")),
        }
      : {
          codigo: String(data.get("codigo")).trim(),
          nome: String(data.get("nome")).trim(),
          tipo: String(data.get("tipo")),
          ativo: data.has("ativo"),
        };
    if (weeks) {
      const w = payload as Week;
      if (Date.parse(w.data_fim) - Date.parse(w.data_inicio) !== 6 * 86400000) {
        setError("A semana deve conter sete dias, incluindo início e fim.");
        return;
      }
      if (
        new Date(`${w.data_inicio}T00:00:00Z`).getUTCDay() !== 0 ||
        new Date(`${w.data_fim}T00:00:00Z`).getUTCDay() !== 6
      ) {
        setError("A semana deve começar no domingo e terminar no sábado.");
        return;
      }
    }
    const existing = editing && editing !== "new" ? editing : null;
    const url = existing
      ? `${path}/${encodeURIComponent(weeks ? existing.codigo : String((existing as Expense).id))}`
      : path;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(url, token, {
        method: existing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setSuccess(
        weeks ? "Semana salva com sucesso." : "Despesa salva com sucesso.",
      );
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const current = editing && editing !== "new" ? editing : null;
  if (weeks && !isAdmin)
    return (
      <p role="alert">
        A tela de semanas está disponível apenas para administradores.
      </p>
    );
  return (
    <div className="content">
      <div className="page-heading">
        {canEdit && (
          <button
            className="primary"
            disabled={busy || !!editing}
            onClick={() => {
              setEditing("new");
              setError("");
              setSuccess("");
            }}
          >
            {weeks ? "+ Nova semana" : "+ Nova despesa"}
          </button>
        )}
      </div>
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
      {weeks && (
        <p className="muted">
          O calendário é compartilhado entre unidades. Apenas administradores
          podem acessar esta tela. As semanas começam no domingo e terminam no
          sábado. Períodos já utilizados e sobreposições são protegidos pelo
          sistema.
        </p>
      )}
      {!weeks && !isAdmin && <p className="muted">Somente administradores podem incluir, editar ou desativar despesas. As despesas ativas continuam disponíveis nos lançamentos.</p>}
      {editing && (
        <section ref={formRef} className="panel reference-form">
          <h2>{current ? "Editar cadastro" : "Novo cadastro"}</h2>
          <form
            key={current?.codigo ?? "new"}
            onSubmit={save}
            className="legacy-register"
          >
            <fieldset disabled={busy}>
              <div className="form-grid">
                <label>
                  {weeks ? "Semana" : "COD"}
                  <input
                    aria-label="Código"
                    name="codigo"
                    required
                    maxLength={weeks ? 4 : 10}
                    pattern={weeks ? "[0-9]{4}" : undefined}
                    inputMode={weeks ? "numeric" : "text"}
                    defaultValue={current?.codigo ?? ""}
                    onChange={e => { if (weeks) e.target.value = normalizeWeek(e.target.value); }}
                    readOnly={weeks && !!current}
                    onBlur={(event) => {
                      if (current) return;
                      const found = rows.find(
                        (row) => row.codigo === event.target.value.trim(),
                      );
                      if (found) {
                        setEditing(found);
                        setError("");
                        setSuccess(
                          "Cadastro localizado pelo código. Confira os dados antes de salvar.",
                        );
                      }
                    }}
                  />
                </label>
                {weeks ? (
                  <>
                    <label>
                      Início
                      <input
                        aria-label="Data inicial"
                        name="data_inicio"
                        type="date"
                        required
                        defaultValue={(
                          current as Week | null
                        )?.data_inicio.slice(0, 10)}
                      />
                    </label>
                    <label>
                      Fim
                      <input
                        aria-label="Data final"
                        name="data_fim"
                        type="date"
                        required
                        defaultValue={(current as Week | null)?.data_fim.slice(
                          0,
                          10,
                        )}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Nome
                      <input
                        aria-label="Nome da despesa"
                        name="nome"
                        required
                        maxLength={120}
                        defaultValue={(current as Expense | null)?.nome ?? ""}
                      />
                    </label>
                    <fieldset className="legacy-radio-group">
                      <legend>Tipo de despesa</legend>
                      {[
                        ["Credito", "Crédito (+)"],
                        ["Debito", "Débito (−)"],
                        ["Adiantamento", "Adiantamento"],
                      ].map(([value, label]) => (
                        <label className="checkbox" key={value}>
                          <input
                            type="radio"
                            name="tipo"
                            value={value}
                            defaultChecked={
                              ((current as Expense | null)?.tipo ??
                                "Debito") === value
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  </>
                )}
              </div>
              {!weeks && (
                <>
                  <label className="checkbox">
                    <input
                      name="ativo"
                      type="checkbox"
                      defaultChecked={
                        current ? (current as Expense).ativo : true
                      }
                    />{" "}
                    Ativa para novos lançamentos
                  </label>
                  <p className="muted">
                    Alterar o cadastro não modifica os lançamentos históricos.
                    Desative uma despesa para impedir novas inclusões.
                  </p>
                </>
              )}
              <button className="primary" aria-label="Salvar cadastro">
                {busy ? "Salvando…" : "Salvar"}
              </button>{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                Cancelar
              </button>
            </fieldset>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="filters">
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Atualizar cadastros
          </button>
          <span>{rows.length} registros</span>
        </div>
        {loading ? (
          <p className="empty" role="status">
            Carregando cadastros…
          </p>
        ) : !rows.length ? (
          <p className="empty">
            {error
              ? "Consulta indisponível. Tente atualizar."
              : "Nenhum cadastro encontrado."}
          </p>
        ) : (
          <div className="table-scroll">
            <SortableTable>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>{weeks ? "Início" : "Nome"}</th>
                  <th>{weeks ? "Fim" : "Tipo"}</th>
                  {!weeks && <th>Situação</th>}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={weeks ? row.codigo : (row as Expense).id}>
                    <td>{row.codigo}</td>
                    <td>
                      {weeks
                        ? date((row as Week).data_inicio)
                        : (row as Expense).nome}
                    </td>
                    <td>
                      {weeks
                        ? date((row as Week).data_fim)
                        : (row as Expense).tipo}
                    </td>
                    {!weeks && (
                      <td>{(row as Expense).ativo ? "Ativa" : "Inativa"}</td>
                    )}
                    <td>
                      {canEdit && (
                        <button
                          className="text-button"
                          disabled={busy || !!editing}
                          onClick={() => {
                            setEditing(row);
                            setError("");
                            setSuccess("");
                          }}
                        >
                          Editar {row.codigo}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
      </section>
    </div>
  );
}
