import { normalizePlate, normalizeWeek } from "./field-formats";
import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import DriverSelect from "./DriverSelect";

type Note = {
  id: number;
  numero: string;
  data_nota: string;
  emitido_em: string;
  valor: string;
  saldo: string;
  tipo_id: number;
  nome_tipo: string;
  departamento: string | null;
};
type Coupon = {
  id: number;
  placa: string;
  motorista: string;
  semana: string;
  valor: string;
  descricao: string | null;
  departamento: string | null;
  pago: boolean;
  fechamento_id: number | null;
};
type NoteType = { id: number; codigo: string; nome: string; ativo: boolean };
const money = (v: string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const locked = (c: Coupon) => c.pago || c.fechamento_id != null;
export default function InvoiceConsultation({
  token,
  isAdmin,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]),
    [types, setTypes] = useState<NoteType[]>([]);
  const [selected, setSelected] = useState<Note | null>(null),
    [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<Note | "new" | null>(null),
    [couponForm, setCouponForm] = useState<Coupon | "new" | null>(null);
  const [deleting, setDeleting] = useState<"note" | Coupon | null>(null);
  const [editingType, setEditingType] = useState<NoteType | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function refresh() {
    setLoading(true);
    setNotes([]);
    try {
      const [n, t] = await Promise.all([
        api<Note[]>("/freight-invoices", token),
        api<NoteType[]>("/freight-invoice-types", token),
      ]);
      setNotes(n);
      setTypes(t);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [token]);
  async function detail(id: number) {
    setBusy(true);
    setError("");
    setSelected(null);
    setCoupons([]);
    setForm(null);
    setCouponForm(null);
    setDeleting(null);
    try {
      const [n, c] = await Promise.all([
        api<Note>(`/freight-invoices/${id}`, token),
        api<Coupon[]>(`/freight-invoices/${id}/coupons`, token),
      ]);
      setSelected(n);
      setCoupons(c);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    path: string,
    method: string,
    payload: unknown,
    kind: "note" | "coupon" | "delete-note" | "type",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<Note | { nota: Note }>(path, token, {
        method,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      setForm(null);
      setCouponForm(null);
      setDeleting(null);
      setEditingType(null);
      setSuccess("Operação concluída. Valores atualizados pelo servidor.");
      if (kind === "delete-note") {
        setSelected(null);
        setCoupons([]);
      } else if (kind === "note" || kind === "coupon") {
        const note =
          kind === "note" ? (result as Note) : (result as { nota: Note }).nota;
        setSelected(note);
        setCoupons([]);
        try {
          setCoupons(
            await api<Coupon[]>(`/freight-invoices/${note.id}/coupons`, token),
          );
        } catch (e) {
          setSelected(null);
          fail(e);
        }
      }
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const current = form && form !== "new" ? form : null;
    void mutate(
      current ? `/freight-invoices/${current.id}` : "/freight-invoices",
      current ? "PUT" : "POST",
      {
        numero: String(d.get("numero")).trim(),
        data_nota: d.get("data_nota"),
        emitido_em: d.get("emitido_em"),
        valor: Number(d.get("valor")),
        tipo_id: Number(d.get("tipo_id")),
        departamento: String(d.get("departamento") || "").trim(),
      },
      "note",
    );
  }
  function saveCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const d = new FormData(event.currentTarget);
    if (!d.get("cpf_motorista")) {
      setError("Selecione o motorista pelo nome.");
      return;
    }
    const current = couponForm && couponForm !== "new" ? couponForm : null;
    void mutate(
      `/freight-invoices/${selected.id}/coupons${current ? `/${current.id}` : ""}`,
      current ? "PUT" : "POST",
      {
        placa: String(d.get("placa")).trim().toUpperCase(),
        cpf_motorista: String(d.get("cpf_motorista")).trim(),
        semana: String(d.get("semana")),
        valor: Number(d.get("valor")),
        descricao: String(d.get("descricao") || "").trim(),
        departamento: String(d.get("departamento") || "").trim(),
      },
      "coupon",
    );
  }
  const n = form && form !== "new" ? form : null,
    c = couponForm && couponForm !== "new" ? couponForm : null;
  const blocked = coupons.some(locked),
    active = types.filter((t) => t.ativo),
    editing = !!form || !!couponForm || !!deleting || !!editingType;
  return (
    <div className="content invoice-consultation">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROLE FINANCEIRO</p>
          <h2>Consulta de notas e cupons</h2>
          <p className="muted">
            Distribua o valor das notas por veículo e semana, acompanhando o
            saldo disponível.
          </p>
        </div>
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
      <details>
        <summary>Tipos de nota: cadastrar e editar</summary>
        <p>Os tipos de nota geram débitos do veículo.</p>
        <p className="muted">
          Desativar impede a seleção em novas notas. O cadastro não altera o
          conteúdo das notas históricas.
        </p>
        <div className="table-scroll">
          <SortableTable>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Situação</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td>{t.codigo}</td>
                  <td>{t.nome}</td>
                  <td>{t.ativo ? "Ativo" : "Inativo"}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || editing}
                      onClick={() => {
                        setEditingType(t);
                        setError("");
                        setSuccess("");
                      }}
                    >
                      Editar tipo {t.codigo}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
        <form
          key={editingType?.id ?? "new-type"}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void mutate(
              editingType
                ? `/freight-invoice-types/${editingType.id}`
                : "/freight-invoice-types",
              editingType ? "PUT" : "POST",
              {
                codigo: String(d.get("codigo")).trim(),
                nome: String(d.get("nome")).trim(),
                tipo: "Debito",
                ativo: d.has("ativo"),
              },
              "type",
            );
          }}
        >
          <fieldset disabled={busy || !!form || !!couponForm || !!deleting}>
            <div className="form-grid">
              <label>
                Código do tipo
                <input
                  name="codigo"
                  required
                  maxLength={10}
                  defaultValue={editingType?.codigo ?? ""}
                />
              </label>
              <label>
                Nome do tipo
                <input
                  name="nome"
                  required
                  maxLength={120}
                  defaultValue={editingType?.nome ?? ""}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={editingType?.ativo ?? true}
              />
              Tipo ativo
            </label>
            <button className="secondary">
              {editingType ? "Salvar tipo" : "Cadastrar tipo"}
            </button>
            {editingType && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingType(null)}
              >
                Cancelar edição do tipo
              </button>
            )}
          </fieldset>
        </form>
      </details>
      {form && (
        <section className="panel reference-form">
          <h2>{n ? `Editar nota ${n.numero}` : "Nova nota"}</h2>
          <form
            key={n?.id ?? "new"}
            onSubmit={saveNote}
            className="legacy-form"
          >
            <fieldset disabled={busy}>
              <div className="legacy-identity">
                <label>
                  Inclusão
                  <input
                    aria-label="Data de emissão"
                    name="emitido_em"
                    type="date"
                    required
                    defaultValue={n?.emitido_em.slice(0, 10)}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Nota
                  <input
                    aria-label="Número da nota"
                    name="numero"
                    required
                    maxLength={30}
                    defaultValue={n?.numero}
                  />
                </label>
                <label>
                  Data
                  <input
                    aria-label="Data da nota"
                    name="data_nota"
                    type="date"
                    required
                    defaultValue={n?.data_nota.slice(0, 10)}
                  />
                </label>
                <label>
                  Valor
                  <input
                    aria-label="Valor da nota"
                    name="valor"
                    type="number"
                    min="0.01"
                    max="9999999999999.99"
                    step="0.01"
                    required
                    defaultValue={n?.valor}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    aria-label="Tipo da nota"
                    name="tipo_id"
                    required
                    defaultValue={
                      active.some((t) => t.id === n?.tipo_id) ? n!.tipo_id : ""
                    }
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {active.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} · {t.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Departamento
                  <input
                    aria-label="Departamento da nota"
                    name="departamento"
                    maxLength={30}
                    defaultValue={n?.departamento ?? ""}
                  />
                </label>
              </div>
              {n && (
                <p>
                  Tipo histórico: {n.nome_tipo}. Confira o cadastro selecionado;
                  os tipos atuais podem ter mudado.
                </p>
              )}
              <button className="primary" disabled={!active.length}>
                Salvar nota
              </button>{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(null)}
              >
                Cancelar edição da nota
              </button>
              {!active.length && (
                <p>Cadastre um tipo ativo antes de salvar uma nota.</p>
              )}
            </fieldset>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="filters">
          <button
            className="secondary"
            disabled={busy || loading || editing}
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Atualizar notas
          </button>
          <span>Últimas 50 notas da unidade</span>
        </div>
        {loading ? (
          <p className="empty" role="status">
            Carregando notas…
          </p>
        ) : !notes.length ? (
          <p className="empty">Nenhuma nota disponível na consulta.</p>
        ) : (
          <div className="table-scroll">
            <SortableTable>
              <thead>
                <tr>
                  <th>Nota / Tipo</th>
                  <th>Valor</th>
                  <th>Saldo disponível</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id}>
                    <td>
                      {note.numero}
                      <small>{note.nome_tipo}</small>
                    </td>
                    <td>{money(note.valor)}</td>
                    <td>{money(note.saldo)}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy || editing}
                        onClick={() => void detail(note.id)}
                      >
                        Abrir nota {note.numero}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
      </section>
      {selected && (
        <section className="panel reference-form">
          <h2>Nota {selected.numero}</h2>
          <p>
            Valor: {money(selected.valor)} · Saldo disponível:{" "}
            <strong>{money(selected.saldo)}</strong>
          </p>
          <p className="muted">
            O saldo já desconta os cupons emitidos, inclusive os pagos. Pagar ou
            cancelar o fechamento não devolve o saldo da nota.
          </p>
          {!blocked && (
            <>
              <button
                className="secondary"
                disabled={busy || editing}
                onClick={() => setForm(selected)}
              >
                Editar nota
              </button>{" "}
              {(
                <button
                  className="secondary"
                  disabled={busy || editing}
                  onClick={() => setDeleting("note")}
                >
                  Excluir nota
                </button>
              )}
            </>
          )}
          {blocked && (
            <p>
              Há cupons pagos ou fechados: edição e exclusão da nota estão
              bloqueadas.
            </p>
          )}
          <h3>Cupons distribuídos</h3>
          {!coupons.length ? (
            <p>Nenhum cupom vinculado.</p>
          ) : (
            <div className="table-scroll">
              <SortableTable>
                <thead>
                  <tr>
                    <th>Cupom / Veículo / Motorista</th>
                    <th>Semana</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td data-sort-primary={coupon.id} data-sort-secondary={coupon.placa} data-sort-tertiary={coupon.motorista}>
                        {coupon.id} · {coupon.placa}
                        <small>{coupon.motorista}</small>
                      </td>
                      <td>{coupon.semana}</td>
                      <td>{money(coupon.valor)}</td>
                      <td>{locked(coupon) ? "Pago / fechado" : "Em aberto"}</td>
                      <td>
                        {!locked(coupon) && (
                          <>
                            <button
                              className="text-button"
                              disabled={busy || editing}
                              onClick={() => setCouponForm(coupon)}
                            >
                              Editar cupom {coupon.id}
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || editing}
                              onClick={() => setDeleting(coupon)}
                            >
                              Excluir cupom {coupon.id}
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
          <button
            className="primary"
            disabled={busy || editing || Number(selected.saldo) <= 0}
            onClick={() => {
              setCouponForm("new");
              setError("");
              setSuccess("");
            }}
          >
            + Novo cupom
          </button>
          {couponForm && (
            <form
              key={c?.id ?? "new"}
              onSubmit={saveCoupon}
              className="legacy-form"
            >
              <h3>{c ? `Editar cupom ${c.id}` : "Novo cupom"}</h3>
              {c && (
                <p className="alert">
                  Confira o motorista selecionado para este cupom.
                </p>
              )}
              <fieldset disabled={busy}>
                <div className="legacy-identity">
                  <label>
                    Semana
                    <input
                      aria-label="Semana do cupom"
                      name="semana"
                      required
                      pattern="[0-9]{4}"
                      maxLength={4}
                      defaultValue={c?.semana}
                      onChange={e => { e.target.value = normalizeWeek(e.target.value); }}
                    />
                  </label>
                  <label>
                    Placa
                    <input
                      aria-label="Placa do cupom"
                      name="placa"
                      required
                      pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                      maxLength={8}
                      defaultValue={c?.placa}
                      onChange={e => { e.target.value = normalizePlate(e.target.value); }}
                    />
                  </label>
                  <DriverSelect
                    token={token}
                    initialName={c?.motorista}
                    label="Motorista do cupom"
                    expired={expired}
                  />
                  <label>
                    Valor do cupom
                    <input
                      name="valor"
                      type="number"
                      min="0.01"
                      max="9999999999999.99"
                      step="0.01"
                      required
                      defaultValue={c?.valor}
                    />
                  </label>
                  <label>
                    Departamento
                    <input
                      aria-label="Departamento do cupom"
                      name="departamento"
                      maxLength={30}
                      defaultValue={c?.departamento ?? ""}
                    />
                  </label>
                </div>
                <label>
                  Descrição
                  <textarea
                    aria-label="Descrição do cupom"
                    name="descricao"
                    maxLength={255}
                    defaultValue={c?.descricao ?? ""}
                  />
                </label>
                <p>
                  A cobrança usa o início da semana cadastrada. O servidor
                  valida o saldo antes de salvar.
                </p>
                <button className="primary">Salvar cupom</button>{" "}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCouponForm(null)}
                >
                  Cancelar edição do cupom
                </button>
              </fieldset>
            </form>
          )}
          {deleting && (
            <div className="alert">
              <p>
                {deleting === "note"
                  ? `Excluir a nota ${selected.numero} e todos os seus cupons abertos?`
                  : `Excluir o cupom ${deleting.id} e devolver seu valor ao saldo da nota?`}{" "}
                Esta ação não pode ser desfeita.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    deleting === "note"
                      ? `/freight-invoices/${selected.id}`
                      : `/freight-invoices/${selected.id}/coupons/${deleting.id}`,
                    "DELETE",
                    null,
                    deleting === "note" ? "delete-note" : "coupon",
                  )
                }
              >
                Confirmar exclusão
              </button>{" "}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Manter registro
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
