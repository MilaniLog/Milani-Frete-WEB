import { normalizePlate, normalizeWeek } from "./field-formats";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
type Note = {
  id: number;
  numero: string;
  data_nota: string;
  emitido_em: string;
  valor: string;
  saldo: string;
  tipo_id: number;
  nome_tipo: string;
};
type Coupon = {
  id: number;
  nota_id: number;
  placa: string;
  semana: string;
  motorista: string;
  valor: string;
  descricao: string | null;
  departamento: string | null;
  pago: boolean;
  fechamento_id: number | null;
};
type Launch = { nota: Note; coupon: Coupon };
type Catalog = {
  weeks: { codigo: string; data_inicio: string; data_fim: string }[];
  vehicles: { plate: string; codVehicleType: number }[];
  vehicleTypes: { codVehicleType: number; typeName: string }[];
  drivers: { cpf: string; name: string }[];
  types: { id: number; codigo: string; nome: string; ativo: boolean }[];
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const empty = () => ({
  numero: "",
  data_nota: "",
  emitido_em: today(),
  valor: "",
  tipo_id: "",
  semana: "",
  placa: "",
  cpf_motorista: "",
  cupom_valor: "",
  descricao: "",
  departamento: "",
});
const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const money = (v: string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function InvoiceLaunchForm({
  token,
  isAdmin,
  expired,
  close,
  saved,
  catalogRevision = 0,
}: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
  close?: () => void;
  saved: () => void;
  catalogRevision?: number;
}) {
  const [catalog, setCatalog] = useState<Catalog>({
    weeks: [],
    vehicles: [],
    vehicleTypes: [],
    drivers: [],
    types: [],
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [form, setForm] = useState(empty),
    [note, setNote] = useState<Note | null>(null),
    [coupon, setCoupon] = useState<Coupon | null>(null);
  const [editing, setEditing] = useState(false),
    [number, setNumber] = useState(""),
    [deleting, setDeleting] = useState<"note" | "coupon" | null>(null);
  const revision = useRef(0);
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api<Catalog["weeks"]>("/weeks", token),
      api<Catalog["vehicles"]>("/registrations/vehicles", token),
      api<Catalog["vehicleTypes"]>("/registrations/vehicle-types", token),
      api<Catalog["drivers"]>("/drivers", token),
      api<Catalog["types"]>("/freight-invoice-types", token),
    ])
      .then(([weeks, vehicles, vehicleTypes, drivers, types]) => {
        if (active)
          setCatalog({ weeks, vehicles, vehicleTypes, drivers, types });
      })
      .catch((e) => {
        if (active) fail(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      revision.current++;
    };
  }, [token, catalogRevision]);
  function change(key: keyof ReturnType<typeof empty>, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSuccess("");
    setDeleting(null);
  }
  function reset() {
    revision.current++;
    setForm(empty());
    setNote(null);
    setCoupon(null);
    setEditing(false);
    setNumber("");
    setDeleting(null);
    setError("");
    setSuccess("");
  }
  function fillNote(n: Note) {
    setNote(n);
    setForm((f) => ({
      ...f,
      numero: n.numero,
      data_nota: n.data_nota.slice(0, 10),
      emitido_em: n.emitido_em.slice(0, 10),
      valor: n.valor,
      tipo_id: String(n.tipo_id),
    }));
  }
  async function lookupNote(): Promise<Note | null> {
    if (!form.numero.trim()) return null;
    if (note?.numero === form.numero.trim()) return note;
    const current = revision.current;
    try {
      const found = await api<Note>(
        `/freight-invoices/by-number?${new URLSearchParams({ numero: form.numero.trim() })}`,
        token,
      );
      if (current === revision.current) fillNote(found);
      return found;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (current === revision.current) setNote(null);
        return null;
      }
      throw e;
    }
  }
  async function lookupLaunch() {
    if (!number) return;
    setBusy(true);
    setError("");
    setCoupon(null);
    setNote(null);
    try {
      const found = await api<Launch>(
        `/freight-invoices/launches/${encodeURIComponent(number)}`,
        token,
      );
      fillNote(found.nota);
      setCoupon(found.coupon);
      const drivers = catalog.drivers.filter(
        (d) =>
          d.name.trim().toLocaleLowerCase() ===
          found.coupon.motorista.trim().toLocaleLowerCase(),
      );
      setForm((f) => ({
        ...f,
        placa: found.coupon.placa,
        semana: found.coupon.semana,
        cpf_motorista: drivers.length === 1 ? drivers[0].cpf : "",
        cupom_valor: found.coupon.valor,
        descricao: found.coupon.descricao ?? "",
        departamento: found.coupon.departamento ?? "",
      }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const paid = !!coupon && (coupon.pago || coupon.fechamento_id != null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || paid) return;
    if (editing && !coupon) {
      setError("Consulte o número do lançamento antes de salvar.");
      return;
    }
    revision.current++;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const found = editing ? note : await lookupNote();
      const cupom = {
        placa: form.placa.trim().toUpperCase(),
        semana: form.semana,
        cpf_motorista: form.cpf_motorista,
        valor: Number(form.cupom_valor),
        descricao: form.descricao,
        departamento: form.departamento,
      };
      const result = await api<Launch>(
        editing
          ? `/freight-invoices/${found!.id}/coupons/${coupon!.id}`
          : "/freight-invoices/launches",
        token,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(
            editing
              ? cupom
              : {
                  nota: {
                    numero: form.numero.trim(),
                    data_nota: found?.data_nota.slice(0, 10) ?? form.data_nota,
                    emitido_em:
                      found?.emitido_em.slice(0, 10) ?? form.emitido_em,
                    valor: found ? Number(found.valor) : Number(form.valor),
                    tipo_id: found?.tipo_id ?? Number(form.tipo_id),
                    departamento: form.departamento,
                  },
                  cupom,
                },
          ),
        },
      );
      fillNote(result.nota);
      setCoupon(null);
      setEditing(false);
      setNumber("");
      setForm((f) => ({ ...f, cupom_valor: "", descricao: "" }));
      setSuccess(
        `Lançamento ${result.coupon.id} salvo. Saldo da nota: ${money(result.nota.saldo)}.`,
      );
      saved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!note || !deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      if (deleting === "note") {
        await api(`/freight-invoices/${note.id}`, token, { method: "DELETE" });
        reset();
        setSuccess("Nota e cupons excluídos.");
      } else {
        const result = await api<Launch>(
          `/freight-invoices/${note.id}/coupons/${coupon!.id}`,
          token,
          { method: "DELETE" },
        );
        fillNote(result.nota);
        setCoupon(null);
        setEditing(false);
        setNumber("");
        setDeleting(null);
        setForm((f) => ({ ...f, cupom_valor: "", descricao: "" }));
        setSuccess(
          `Cupom excluído. Saldo da nota: ${money(result.nota.saldo)}.`,
        );
      }
      saved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const week = catalog.weeks.find((w) => w.codigo === form.semana),
    vehicle = catalog.vehicles.find((v) => v.plate === form.placa),
    vehicleType = catalog.vehicleTypes.find(
      (t) => t.codVehicleType === vehicle?.codVehicleType,
    ),
    selectedType = catalog.types.find((t) => String(t.id) === form.tipo_id);
  const driverCounts = new Map<string, number>();
  for (const d of catalog.drivers)
    driverCounts.set(d.name, (driverCounts.get(d.name) ?? 0) + 1);
  return (
    <section className="panel reference-form invoice-launch">
      <h2>Lançamento de notas e cupons</h2>
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
      {loading && <p role="status">Carregando cadastros…</p>}
      <form onSubmit={save} className="invoice-vba-form">
        <fieldset disabled={busy || loading}>
          <div className="invoice-top-row">
            <label>
              Núm. lançamento
              <input
                aria-label="Número do lançamento"
                value={number}
                disabled={!editing}
                inputMode="numeric"
                pattern="[0-9]+"
                onChange={(e) => {
                  revision.current++;
                  setNumber(e.target.value);
                  setCoupon(null);
                  setNote(null);
                  setForm(empty());
                  setDeleting(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookupLaunch();
                  }
                }}
              />
            </label>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => void lookupLaunch()}
              >
                Buscar lançamento
              </button>
            )}
            <label>
              Inclusão
              <input
                aria-label="Data de inclusão"
                type="date"
                value={form.emitido_em}
                required
                readOnly={!!note || editing}
                onChange={(e) => change("emitido_em", e.target.value)}
              />
            </label>
          </div>
          <div className="invoice-note-row">
            <label>
              Nota
              <input
                aria-label="Número da nota"
                value={form.numero}
                maxLength={30}
                required
                readOnly={editing}
                onChange={(e) => {
                  revision.current++;
                  if (note)
                    setForm((f) => ({
                      ...f,
                      data_nota: "",
                      valor: "",
                      tipo_id: "",
                    }));
                  setNote(null);
                  change("numero", e.target.value);
                }}
                onBlur={() => {
                  if (!editing) void lookupNote().catch(fail);
                }}
              />
            </label>
            <label>
              Data
              <input
                aria-label="Data da nota"
                type="date"
                required
                value={form.data_nota}
                readOnly={!!note || editing}
                onChange={(e) => change("data_nota", e.target.value)}
              />
            </label>
            <label>
              Valor
              <input
                aria-label="Valor da nota"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.valor}
                readOnly={!!note || editing}
                onChange={(e) => change("valor", e.target.value)}
              />
            </label>
          </div>
          <div className="invoice-coupon-rows">
            <label>
              Semana
              <input
                aria-label="Semana do cupom"
                list="invoice-weeks"
                value={form.semana}
                pattern="[0-9]{4}"
                maxLength={4}
                required
                disabled={paid}
                onChange={(e) => change("semana", normalizeWeek(e.target.value))}
              />
            </label>
            <p className="muted">
              {week ? `${date(week.data_inicio)} a ${date(week.data_fim)}` : ""}
            </p>
            <label>
              Placa
              <input
                aria-label="Placa do cupom"
                list="invoice-plates"
                value={form.placa}
                pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                maxLength={8}
                required
                disabled={paid}
                onChange={(e) => change("placa", normalizePlate(e.target.value))}
              />
            </label>
            <p className="muted">{vehicleType?.typeName ?? ""}</p>
            <label>
              Motorista
              <select
                aria-label="Motorista do cupom"
                value={form.cpf_motorista}
                required
                disabled={paid}
                onChange={(e) => change("cpf_motorista", e.target.value)}
              >
                <option value="">Selecione o motorista</option>
                {catalog.drivers.map((d) => (
                  <option key={d.cpf} value={d.cpf}>
                    {d.name}
                    {driverCounts.get(d.name)! > 1
                      ? ` · CPF final ${d.cpf.slice(-4)}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              {coupon && !form.cpf_motorista
                ? `Motorista registrado: ${coupon.motorista}. Selecione o cadastro correspondente.`
                : ""}
            </p>
            <label>
              Tipo
              <select
                aria-label="Tipo da nota"
                value={form.tipo_id}
                required
                disabled={!!note || editing}
                onChange={(e) => change("tipo_id", e.target.value)}
              >
                <option value="">Selecione</option>
                {catalog.types
                  .filter((t) => t.ativo || t.id === note?.tipo_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} · {t.nome}
                    </option>
                  ))}
              </select>
            </label>
            <p className="muted">
              {note?.nome_tipo ?? selectedType?.nome ?? ""}
              {form.tipo_id ? " · Débito" : ""}
            </p>
            <label>
              Valor cupom
              <input
                aria-label="Valor do cupom"
                type="number"
                min="0.01"
                step="0.01"
                value={form.cupom_valor}
                required
                disabled={paid}
                onChange={(e) => change("cupom_valor", e.target.value)}
              />
            </label>
            <p>{note ? `Saldo disponível: ${money(note.saldo)}` : ""}</p>
            <label className="invoice-description">
              Descrição
              <input
                aria-label="Descrição do cupom"
                maxLength={255}
                value={form.descricao}
                disabled={paid}
                onChange={(e) => change("descricao", e.target.value)}
              />
            </label>
          </div>
          <datalist id="invoice-weeks">
            {catalog.weeks.map((w) => (
              <option key={w.codigo} value={w.codigo} />
            ))}
          </datalist>
          <datalist id="invoice-plates">
            {catalog.vehicles.map((v) => (
              <option key={v.plate} value={v.plate} />
            ))}
          </datalist>
          {paid && (
            <p className="alert">
              Cupom pago ou fechado: alteração e exclusão bloqueadas.
            </p>
          )}
          <div className="actions">
            {close && (
              <button type="button" className="secondary" onClick={close}>
                Fechar
              </button>
            )}
            <button className="primary" disabled={paid || (editing && !coupon)}>
              Salvar
            </button>
            <button
              type="button"
              className="secondary"
              disabled={editing}
              onClick={() => {
                reset();
                setEditing(true);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!coupon || paid}
              onClick={() => setDeleting("coupon")}
            >
              Excluir cupom
            </button>
            {(
              <button
                type="button"
                className="secondary"
                disabled={!note || paid}
                onClick={() => setDeleting("note")}
              >
                Deletar nota
              </button>
            )}
            {editing && (
              <button type="button" className="secondary" onClick={reset}>
                Cancelar
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {deleting && (
        <div className="alert">
          <p>
            {deleting === "note"
              ? `Excluir a nota ${note?.numero} e todos os seus cupons abertos?`
              : `Excluir o lançamento ${coupon?.id} e devolver seu valor ao saldo da nota?`}
          </p>
          <button
            disabled={busy}
            className="primary"
            onClick={() => void remove()}
          >
            Confirmar exclusão
          </button>{" "}
          <button
            disabled={busy}
            className="secondary"
            onClick={() => setDeleting(null)}
          >
            Manter registro
          </button>
        </div>
      )}
    </section>
  );
}
