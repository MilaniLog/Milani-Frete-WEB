import { normalizePlate, normalizeWeek } from "./field-formats";
import SearchableSelect from "./SearchableSelect";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import ManifestEntries from "./ManifestEntries";
type Manifest = {
  id: number;
  manifestos: string;
  semana: string;
  placa: string;
  motorista: string;
  tipo_veiculo: string;
  fechamento_id: number | null;
  num_fechamento: number | null;
};
export type EntryWeek = {
  codigo: string;
  data_inicio: string;
  data_fim: string;
};
type Expense = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  ativo: boolean;
};
type Driver = { cpf: string; name: string };
type SavedEntry = {
  id: number;
  numero: number;
  manifesto_id: number | null;
  placa: string;
  semana: string | null;
  motorista: string | null;
  tipo_veiculo: string | null;
  codigo_despesa: string;
  nome_despesa: string;
  tipo_despesa: string;
  data_lancamento: string;
  valor: string;
  descricao: string | null;
  departamento: string | null;
  pago: boolean;
  fechamento_id: number | null;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export default function FreightEntries({
  token,
  unit,
  initialManifestId,
  expired,
  close,
}: {
  token: string;
  unit: number;
  initialManifestId: number | null;
  expired: () => void;
  close: () => void;
}) {
  const [weeks, setWeeks] = useState<EntryWeek[]>([]),
    [expenses, setExpenses] = useState<Expense[]>([]),
    [drivers, setDrivers] = useState<Driver[]>([]);
  const [number, setNumber] = useState(""),
    [manifest, setManifest] = useState<Manifest | null>(null),
    [plate, setPlate] = useState(""),
    [vehicleType, setVehicleType] = useState("");
  const [week, setWeek] = useState(""),
    [date, setDate] = useState(today),
    [driver, setDriver] = useState("");
  const [editMode, setEditMode] = useState(false),
    [entryNumber, setEntryNumber] = useState(""),
    [editing, setEditing] = useState<SavedEntry | null>(null);
  const entryInput = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedEntry | null>(null);
  const [expense, setExpense] = useState(""),
    [value, setValue] = useState(""),
    [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true),
    [searching, setSearching] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [consult, setConsult] = useState(false),
    [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  function selectManifest(m: Manifest, calendar: EntryWeek[]) {
    setManifest(m);
    setNumber(m.manifestos);
    setPlate(m.placa);
    setVehicleType(m.tipo_veiculo ?? "");
    setDriver("");
    const day = m.semana.slice(0, 10);
    setDate(day);
    setWeek(
      calendar.find(
        (w) =>
          day >= w.data_inicio.slice(0, 10) && day <= w.data_fim.slice(0, 10),
      )?.codigo ?? "",
    );
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<EntryWeek[]>("/weeks", token),
      api<Expense[]>("/freight-expenses", token),
      api<Driver[]>("/drivers", token),
      initialManifestId
        ? api<Manifest>(`/manifests/${initialManifestId}`, token)
        : Promise.resolve(null),
    ])
      .then(([w, e, d, m]) => {
        if (!active) return;
        setWeeks(w);
        setExpenses(e.filter((x) => x.ativo));
        setDrivers(d);
        if (m) selectManifest(m, w);
        else {
          const day = today();
          setWeek(
            w.find(
              (x) =>
                day >= x.data_inicio.slice(0, 10) &&
                day <= x.data_fim.slice(0, 10),
            )?.codigo ?? "",
          );
        }
      })
      .catch((e) => {
        if (active) fail(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      sequence.current++;
    };
  }, [token, initialManifestId, attempt]);
  async function lookup() {
    if (editMode) return;
    const text = number.trim();
    if (!text || manifest?.manifestos === text) return;
    const request = ++sequence.current;
    setSearching(true);
    setError("");
    try {
      const rows = await api<Manifest[]>(
        `/manifests?number=${encodeURIComponent(text)}`,
        token,
      );
      if (request !== sequence.current) return;
      if (rows.length !== 1)
        throw new Error(
          rows.length
            ? "Mais de um manifesto encontrado. Confira o número completo."
            : "Manifesto não encontrado nesta unidade. Corrija o número ou deixe o campo vazio para lançar sem manifesto.",
        );
      selectManifest(rows[0], weeks);
    } catch (e) {
      if (request === sequence.current) fail(e);
    } finally {
      if (request === sequence.current) setSearching(false);
    }
  }
  async function lookupEntry() {
    setDeleteTarget(null);
    if (!editMode || !/^\d+$/.test(entryNumber) || Number(entryNumber) < 1)
      return;
    if (editing?.numero === Number(entryNumber)) return;
    const request = ++sequence.current;
    setSearching(true);
    setError("");
    setSuccess("");
    setEditing(null);
    try {
      const result = await api<{
        entry: SavedEntry;
        manifesto: Manifest | null;
      }>(`/freight-entries/number/${entryNumber}`, token);
      if (request !== sequence.current) return;
      const e = result.entry;
      setEditing(e);
      setManifest(result.manifesto);
      setNumber(result.manifesto?.manifestos ?? "");
      setPlate(e.placa ?? "");
      setVehicleType(e.tipo_veiculo ?? "");
      const day = e.data_lancamento.slice(0, 10);
      setDate(day);
      setWeek(
        e.semana ??
          weeks.find(
            (w) =>
              day >= w.data_inicio.slice(0, 10) &&
              day <= w.data_fim.slice(0, 10),
          )?.codigo ??
          "",
      );
      const matches = drivers.filter(
        (d) => normalize(d.name) === normalize(e.motorista ?? ""),
      );
      setDriver(
        matches.length === 1
          ? matches[0].cpf
          : e.motorista
            ? "__historic__"
            : "",
      );
      const type = expenses.find(
        (x) =>
          x.codigo === e.codigo_despesa &&
          x.nome === e.nome_despesa &&
          x.tipo === e.tipo_despesa,
      );
      setExpense(type ? String(type.id) : "");
      setValue(String(e.valor));
      setDescription(e.descricao ?? "");
      if (!type)
        setError(
          "A despesa original mudou ou está inativa. Selecione uma despesa ativa antes de salvar.",
        );
    } catch (e) {
      if (request === sequence.current) fail(e);
    } finally {
      if (request === sequence.current) setSearching(false);
    }
  }
  function newEntry() {
    setDeleteTarget(null);
    sequence.current++;
    setSearching(false);
    setEditMode(false);
    setEditing(null);
    setEntryNumber("");
    setManifest(null);
    setNumber("");
    setPlate("");
    setVehicleType("");
    setDriver("");
    setExpense("");
    setValue("");
    setDescription("");
    setError("");
    setSuccess("");
    setConsult(false);
    const day = today();
    setDate(day);
    setWeek(
      weeks.find(
        (w) =>
          day >= w.data_inicio.slice(0, 10) && day <= w.data_fim.slice(0, 10),
      )?.codigo ?? "",
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setDeleteTarget(null);
    if (busy || loading || searching) return;
    if (editMode && (!editing || editing.numero !== Number(entryNumber))) {
      setError("Informe o número e carregue o lançamento antes de salvar.");
      return;
    }
    if (editing && (editing.pago || editing.fechamento_id != null)) {
      setError("Lançamento pago ou fechado não pode ser alterado.");
      return;
    }
    if (
      manifest &&
      (manifest.fechamento_id != null || manifest.num_fechamento != null)
    ) {
      setError("Manifesto fechado: não é possível incluir lançamentos nele.");
      return;
    }
    setError("");
    setSuccess("");
    if (number.trim() && manifest?.manifestos !== number.trim()) {
      setError("Confira o manifesto antes de salvar ou deixe o campo vazio.");
      return;
    }
    if (!week) {
      setError("Selecione a semana.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ entry: { numero: number } }>(
        editing ? `/freight-entries/${editing.id}` : "/freight-entries",
        token,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            placa: plate.trim().toUpperCase(),
            semana: week,
            data_lancamento: date,
            despesa_id: Number(expense),
            valor: Number(value),
            descricao: description.trim(),
            ...(editing ? { departamento: editing.departamento ?? "" } : {}),
            ...(manifest
              ? { manifesto_id: manifest.id }
              : driver === "__historic__"
                ? {}
                : { cpf_motorista: driver || null }),
          }),
        },
      );
      setSuccess(
        `Lançamento ${result.entry.numero} salvo com sucesso${manifest ? "" : ` para a placa ${plate.toUpperCase()} e semana ${week}`}.`,
      );
      if (!editing) {
        setValue("");
        setDescription("");
        setExpense("");
      } else {
        setEditing({...editing,placa:plate.trim().toUpperCase(),semana:week,valor:value,...result.entry});
        setEntryNumber(String(result.entry.numero));
      }
      setConsult(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function removeEntry() {
    if (
      !deleteTarget ||
      busy ||
      searching ||
      !editMode ||
      editing?.id !== deleteTarget.id ||
      editing.numero !== Number(entryNumber) ||
      locked
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/freight-entries/${deleteTarget.id}`, token, {
        method: "DELETE",
      });
      const numero = deleteTarget.numero;
      newEntry();
      setSuccess(`Lançamento ${numero} excluído com sucesso.`);
    } catch (e) {
      fail(e);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }
  const period = weeks.find((w) => w.codigo === week);
  const locked =
    (!!manifest &&
      (manifest.fechamento_id != null || manifest.num_fechamento != null)) ||
    (!!editing && (editing.pago || editing.fechamento_id != null));
  return (
    <section className="content">
      <h1>Lançamentos</h1>
      <h2>
        {editMode
          ? "Editar lançamento"
          : consult
            ? "Consultar lançamentos"
            : "Novo lançamento"}
      </h2>
      <p className="muted">
        Informe o manifesto para preencher os dados automaticamente ou deixe
        vazio e preencha pela placa e semana.
      </p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      {loading && <p role="status">Carregando cadastros…</p>}
      {!loading && error && (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((x) => x + 1)}
        >
          Recarregar cadastros
        </button>
      )}
      {!consult && (
        <form className="launch-form" onSubmit={save}>
          <fieldset disabled={loading || busy}>
            <label>
              Manifesto
              <input
                name="manifesto"
                readOnly={editMode}
                maxLength={20}
                value={number}
                onBlur={() => void lookup()}
                onChange={(e) => {
                  sequence.current++;
                  setSearching(false);
                  setNumber(e.target.value);
                  setManifest(null);
                  setConsult(false);
                  setError("");
                }}
              />
            </label>
            {searching && <p role="status">Buscando manifesto…</p>}
            {locked && (
              <p role="alert">
                Registro pago ou fechado: alterações não são permitidas.
              </p>
            )}
            <div className="launch-heading">
              <label>
                Núm. lançamento
                <input
                  ref={entryInput}
                  readOnly={!editMode}
                  value={editMode ? entryNumber : "Automático ao salvar"}
                  inputMode={editMode ? "numeric" : undefined}
                  onChange={(e) => {
                    sequence.current++;
                    setSearching(false);
                    setEntryNumber(e.target.value.replace(/\D/g, ""));
                    setEditing(null);
                    setDeleteTarget(null);
                    setError("");
                    setSuccess("");
                  }}
                  onBlur={() => void lookupEntry()}
                  onKeyDown={(e) => {
                    if (editMode && e.key === "Enter") {
                      e.preventDefault();
                      void lookupEntry();
                    }
                  }}
                />
              </label>
              <label>
                Unidade
                <input readOnly value={unit} />
              </label>
            </div>
            <fieldset
              disabled={(editMode && (!editing || searching)) || locked}
            >
              <div className="form-grid">
                <label>
                  Semana
                  <select
                    aria-label="Semana"
                    required
                    value={week}
                    onChange={(e) => {
                      setWeek(normalizeWeek(e.target.value));
                      const w = weeks.find((x) => x.codigo === e.target.value);
                      if (
                        w &&
                        (date < w.data_inicio.slice(0, 10) ||
                          date > w.data_fim.slice(0, 10))
                      )
                        setDate(w.data_inicio.slice(0, 10));
                    }}
                  >
                    <option value="">Selecione</option>
                    {weeks.map((w) => (
                      <option key={w.codigo} value={w.codigo}>
                        {w.codigo} ·{" "}
                        {w.data_inicio
                          .slice(0, 10)
                          .split("-")
                          .reverse()
                          .join("/")}{" "}
                        a{" "}
                        {w.data_fim.slice(0, 10).split("-").reverse().join("/")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Placa
                  <input
                    name="placa"
                    required
                    maxLength={8}
                    pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                    readOnly={!!manifest}
                    value={plate}
                    onChange={(e) => {
                      setPlate(normalizePlate(e.target.value));
                      setVehicleType("");
                    }}
                  />
                </label>
                {vehicleType && (
                  <label>
                    Tipo de veículo
                    <input readOnly value={vehicleType} />
                  </label>
                )}
                {manifest ? (
                  <label>
                    Motorista
                    <SearchableSelect aria-label="Motorista" disabled value="manifest">
                      <option value="manifest">{manifest.motorista}</option>
                    </SearchableSelect>
                  </label>
                ) : (
                  <>
                    <label>
                      Motorista
                      <SearchableSelect
                        aria-label="Motorista"
                        value={driver}
                        onChange={(e) => setDriver(e.target.value)}
                      >
                        <option value="">Sem motorista informado</option>
                        {driver === "__historic__" && (
                          <option value="__historic__">
                            {editing?.motorista}
                          </option>
                        )}
                        {drivers.map((d) => (
                          <option key={d.cpf} value={d.cpf}>
                            {d.name}
                            {drivers.filter(
                              (x) => normalize(x.name) === normalize(d.name),
                            ).length > 1
                              ? ` · CPF final ${d.cpf.slice(-4)}`
                              : ""}
                          </option>
                        ))}
                      </SearchableSelect>
                    </label>
                  </>
                )}
                <label>
                  Data do lançamento
                  <input
                    type="date"
                    required
                    min={period?.data_inicio.slice(0, 10)}
                    max={period?.data_fim.slice(0, 10)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Tipo / Despesa
                  <select
                    aria-label="Despesa"
                    required
                    value={expense}
                    onChange={(e) => setExpense(e.target.value)}
                  >
                    <option value="">Selecione</option>
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
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    max="9999999999999.99"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </label>
                <label>
                  Descrição do lançamento
                  <textarea
                    maxLength={255}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            {!loading && !expenses.length && (
              <p role="alert">
                Não há despesas ativas nesta unidade. Solicite o cadastro a um
                administrador.
              </p>
            )}
            <button
              className="primary"
              disabled={
                busy ||
                searching ||
                locked ||
                !expenses.length ||
                (editMode && !editing)
              }
            >
              {busy ? "Salvando…" : "Salvar lançamento"}
            </button>{" "}
            {!editMode ? (
              <button
                type="button"
                className="secondary"
                disabled={busy || searching}
                onClick={() => {
                  setEditMode(true);
                  setEntryNumber("");
                  setEditing(null);
                  setSuccess("");
                  setError("");
                  entryInput.current?.focus();
                }}
              >
                Editar
              </button>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={newEntry}
              >
                Novo lançamento
              </button>
            )}{" "}
            {editMode && (
              <button
                type="button"
                className="secondary"
                disabled={busy || searching || !editing || locked}
                onClick={() => {
                  setDeleteTarget(editing);
                  setError("");
                  setSuccess("");
                }}
              >
                Excluir lançamento
              </button>
            )}{" "}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              Fechar
            </button>
          </fieldset>
        </form>
      )}
      {deleteTarget && (
        <div className="alert" role="alert">
          <p>
            Excluir o lançamento {deleteTarget.numero}, placa{" "}
            {deleteTarget.placa}, no valor de{" "}
            {Number(deleteTarget.valor).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
            ? Esta ação não pode ser desfeita.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy || searching}
            onClick={() => void removeEntry()}
          >
            Confirmar exclusão
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setDeleteTarget(null)}
          >
            Manter lançamento
          </button>
        </div>
      )}
      {manifest && !editMode && (
        <>
          <button
            className="secondary"
            disabled={busy || searching}
            onClick={() => setConsult(!consult)}
          >
            {consult
              ? "Ocultar lançamentos"
              : "Consultar lançamentos do manifesto"}
          </button>
          {consult && (
            <ManifestEntries
              key={manifest.id}
              manifestId={manifest.id}
              date={manifest.semana}
              locked={locked}
              token={token}
              onBusy={setBusy}
              onExpired={expired}
              onUpdated={(m) => setManifest(m as Manifest)}
            />
          )}
        </>
      )}
    </section>
  );
}
