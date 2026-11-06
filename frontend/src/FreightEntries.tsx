import { normalizePlate, normalizeWeek } from "./field-formats";
import {
  comparableManifestNumber,
  formatManifestNumber,
} from "./manifest-number";
import SearchableSelect from "./SearchableSelect";
import { expenseName, expenseType } from "./expense-display";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import ManifestEntries from "./ManifestEntries";
import { valeIdentifier } from "./vale-identifier";
import { parseQuickDate } from "./quick-date-time";
type Manifest = {
  id: number;
  manifestos: string;
  semana: string;
  hora?: string | null;
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
type Vehicle = { plate: string };
type SavedEntry = {
  id: number;
  controle_id?: number | null;
  numero: number;
  manifesto_id: number | null;
  manifesto_numero: string | null;
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
  numero_fechamento?: number | null;
  fatura_id: number | null;
  numero_fatura: number | null;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const displayDate = (iso: string) => {
  const parsed = parseQuickDate(iso);
  return parsed?.display ?? iso;
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
    [drivers, setDrivers] = useState<Driver[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [number, setNumber] = useState(""),
    [manifest, setManifest] = useState<Manifest | null>(null),
    [plate, setPlate] = useState(""),
    [vehicleType, setVehicleType] = useState("");
  const [week, setWeek] = useState(""),
    [date, setDate] = useState(""),
    [driver, setDriver] = useState("");
  const [editMode, setEditMode] = useState(false),
    [entryNumber, setEntryNumber] = useState(""),
    [editing, setEditing] = useState<SavedEntry | null>(null);
  const entryInput = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedEntry | null>(null);
  const [savedAwaitingNewData, setSavedAwaitingNewData] = useState(false);
  const [emptySaveClicks, setEmptySaveClicks] = useState(0);
  const [expense, setExpense] = useState(""),
    [value, setValue] = useState(""),
    [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true),
    [searching, setSearching] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [manifestMissing, setManifestMissing] = useState(false),
    [consult, setConsult] = useState(false),
    [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  function selectManifest(m: Manifest, calendar: EntryWeek[]) {
    setManifestMissing(false);
    setManifest(m);
    setNumber(m.manifestos);
    setPlate(m.placa);
    setVehicleType(m.tipo_veiculo ?? "");
    setDriver("");
    const day = m.semana.slice(0, 10);
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
      api<Vehicle[]>("/registrations/vehicles", token),
      initialManifestId
        ? api<Manifest>(`/manifests/${initialManifestId}`, token)
        : Promise.resolve(null),
    ])
      .then(([w, e, d, v, m]) => {
        if (!active) return;
        setWeeks(w);
        setExpenses(e.filter((x) => x.ativo));
        setDrivers(d);
        setVehicles(v);
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
    if (
      !text ||
      (manifest?.manifestos &&
        comparableManifestNumber(manifest.manifestos) ===
          comparableManifestNumber(text))
    )
      return;
    const request = ++sequence.current;
    setSearching(true);
    setError("");
    try {
      const rows = await api<Manifest[]>(
        `/manifests?number=${encodeURIComponent(formatManifestNumber(text) ?? text)}`,
        token,
      );
      if (request !== sequence.current) return;
      if (!rows.length) {
        setManifestMissing(true);
        return;
      }
      if (rows.length !== 1)
        throw new Error(
          "Mais de um manifesto encontrado. Confira o número completo.",
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
    if (editing && valeIdentifier(editing) === Number(entryNumber)) return;
    const request = ++sequence.current;
    setSearching(true);
    setError("");
    setSuccess("");
    setEditing(null);
    try {
      const result = await api<{
        entry: SavedEntry;
        manifesto: Manifest | null;
      }>(`/freight-entries/${entryNumber}`, token);
      if (request !== sequence.current) return;
      const e = result.entry;
      setEditing(e);
      setManifest(result.manifesto);
      setNumber(result.manifesto?.manifestos ?? e.manifesto_numero ?? "");
      setManifestMissing(!result.manifesto && !!e.manifesto_numero);
      setPlate(e.placa ?? "");
      setVehicleType(e.tipo_veiculo ?? "");
      const day = e.data_lancamento.slice(0, 10);
      setDate(displayDate(day));
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
    setSavedAwaitingNewData(false);
    setEmptySaveClicks(0);
    setDeleteTarget(null);
    sequence.current++;
    setSearching(false);
    setEditMode(false);
    setEditing(null);
    setEntryNumber("");
    setManifest(null);
    setManifestMissing(false);
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
    setDate("");
    const day = today();
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
    if (editMode && (!editing || valeIdentifier(editing) !== Number(entryNumber))) {
      setError("Informe o ID e carregue o vale antes de salvar.");
      return;
    }
    if (
      editing &&
      (editing.pago ||
        editing.fechamento_id != null ||
        editing.fatura_id != null ||
        editing.numero_fatura != null)
    ) {
      setError("Vale pago ou incluído em fechamento de vale não pode ser alterado.");
      return;
    }
    setError("");
    setSuccess("");
    if (
      number.trim() &&
      manifest?.manifestos &&
      comparableManifestNumber(manifest.manifestos) !==
        comparableManifestNumber(number.trim())
    ) {
      setError("Confira o número do manifesto antes de salvar.");
      return;
    }
    if (!week) {
      setError("Selecione a semana.");
      return;
    }
    const enteredDate = parseQuickDate(date);
    if (!enteredDate) {
      setError("Informe uma data vÒ¡lida, como 121226 ou 12/12/2026.");
      return;
    }
    if (
      period &&
      (enteredDate.iso < period.data_inicio.slice(0, 10) ||
        enteredDate.iso > period.data_fim.slice(0, 10))
    ) {
      setError("A data do vale deve estar dentro da semana selecionada.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ entry: { id: number; numero: number } }>(
        editing ? `/freight-entries/${editing.id}` : "/freight-entries",
        token,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            placa: plate.trim().toUpperCase(),
            semana: week,
            data_lancamento: enteredDate.iso,
            despesa_id: Number(expense),
            valor: Number(value),
            descricao: description.trim(),
            ...(editing ? { departamento: editing.departamento ?? "" } : {}),
            ...(manifest
              ? { manifesto_id: manifest.id }
              : {
                  ...(number.trim() ? { manifesto_numero: number.trim() } : {}),
                  ...(driver === "__historic__"
                    ? {}
                    : { cpf_motorista: driver || null }),
                }),
          }),
        },
      );
      setSuccess(
        `Vale ${valeIdentifier(result.entry)} salvo com sucesso${manifest ? "" : ` para a placa ${plate.toUpperCase()} e semana ${week}`}.`,
      );
      if (!editing) {
        setValue("");
        setDescription("");
        setExpense("");
        setSavedAwaitingNewData(true);
        setEmptySaveClicks(0);
      } else {
        setEditing({
          ...editing,
          placa: plate.trim().toUpperCase(),
          semana: week,
          valor: value,
          ...result.entry,
        });
        setEntryNumber(String(valeIdentifier(result.entry)));
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
      valeIdentifier(editing) !== Number(entryNumber) ||
      deletionLocked
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/freight-entries/${deleteTarget.id}`, token, {
        method: "DELETE",
      });
      const id = valeIdentifier(deleteTarget);
      newEntry();
      setSuccess(`Vale ${id} cancelado com sucesso. Histórico preservado.`);
    } catch (e) {
      fail(e);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }
  const period = weeks.find((w) => w.codigo === week);
  const weekOptions = useMemo(
    () => [
      <option key="empty-week" value="">
        Selecione
      </option>,
      ...weeks.map((item) => (
        <option key={item.codigo} value={item.codigo}>
          {item.codigo} ·{" "}
          {item.data_inicio.slice(0, 10).split("-").reverse().join("/")} a{" "}
          {item.data_fim.slice(0, 10).split("-").reverse().join("/")}
        </option>
      )),
    ],
    [weeks],
  );
  const plateOptions = useMemo(
    () => [
      <option key="empty-plate" value="" disabled>
        Selecione a placa
      </option>,
      ...(plate && !vehicles.some((vehicle) => vehicle.plate === plate)
        ? [
            <option key="selected-plate" value={plate}>
              {plate}
            </option>,
          ]
        : []),
      ...vehicles.map((vehicle) => (
        <option key={vehicle.plate} value={vehicle.plate}>
          {vehicle.plate}
        </option>
      )),
    ],
    [vehicles, plate],
  );
  const driverOptions = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const item of drivers) {
      const name = normalize(item.name);
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    return [
      <option key="empty-driver" value="">
        Sem motorista informado
      </option>,
      ...(driver === "__historic__"
        ? [
            <option key="historic-driver" value="__historic__">
              {editing?.motorista}
            </option>,
          ]
        : []),
      ...drivers.map((item) => (
        <option key={item.cpf} value={item.cpf}>
          {item.name}
          {(nameCounts.get(normalize(item.name)) ?? 0) > 1
            ? ` · CPF final ${item.cpf.slice(-4)}`
            : ""}
        </option>
      )),
    ];
  }, [drivers, driver, editing?.motorista]);
  const manifestPrefix = number.slice(0, 3);
  const manifestSuffix = number.slice(3);
  function changeManifestNumber(value: string) {
    sequence.current++;
    setSearching(false);
    setNumber(value);
    setManifest(null);
    setManifestMissing(false);
    setConsult(false);
    setError("");
  }
  const locked =
    !!editing &&
    (editing.pago ||
      editing.fechamento_id != null ||
      editing.fatura_id != null ||
      editing.numero_fatura != null);
  const deletionLocked =
    !!editing && (editing.pago || editing.fechamento_id != null);
  return (
    <section className="content">
      <h1>Vales</h1>
      <h2>
        {editMode ? "Editar vale" : consult ? "Consultar vales" : "Novo vale"}
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
      {loading && <p role="status">Carregando cadastros⬦</p>}
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
        <form
          className="launch-form"
          onSubmit={save}
          onChange={() => {
            setSavedAwaitingNewData(false);
            setEmptySaveClicks(0);
          }}
        >
          <fieldset disabled={loading || busy}>
            {manifest?.fechamento_id != null && !locked && (
              <p className="muted">
                Manifesto fechado: o credito sera pago em um fechamento extra e
                os debitos permanecerao disponiveis para as semanas seguintes.
              </p>
            )}
            {locked && (
              <p role="alert">
                Registro pago ou incluido em fechamento de vale: alteracoes nao sao permitidas.
              </p>
            )}
            {editMode && (
              <>
                <label>
                  ID do vale
                  <input
                  ref={entryInput}
                  value={entryNumber}
                  inputMode="numeric"
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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void lookupEntry();
                    }
                  }}
                  />
                </label>
                {editing?.fechamento_id != null && (
                  <p className="muted" role="status">
                    {editing.numero_fechamento != null
                      ? `Fechamento: ${String(editing.numero_fechamento).padStart(8, "0")}`
                      : "Vale fechado"}
                  </p>
                )}
              </>
            )}
            <fieldset
              disabled={(editMode && (!editing || searching)) || locked}
            >
              <div className="form-grid">
                <label>
                  Semana
                  <SearchableSelect
                    aria-label="Semana"
                    required
                    value={week}
                    onChange={(e) => {
                      setWeek(normalizeWeek(e.target.value));
                      const w = weeks.find((x) => x.codigo === e.target.value);
                      const enteredDate = parseQuickDate(date);
                      if (
                        w &&
                        enteredDate &&
                        (enteredDate.iso < w.data_inicio.slice(0, 10) ||
                          enteredDate.iso > w.data_fim.slice(0, 10))
                      )
                        setDate("");
                    }}
                  >
                    {weekOptions}
                  </SearchableSelect>
                </label>
                <div
                  className="manifest-number-field launch-manifest-number"
                  role="group"
                  aria-label="Manifesto"
                >
                  <span>Manifesto</span>
                  <div className="launch-manifest-content">
                    <div className="manifest-number-parts">
                      <input
                        aria-label="Primeiros três dígitos do manifesto"
                        inputMode="numeric"
                        maxLength={3}
                        pattern="[0-9]{3}"
                        placeholder="000"
                        readOnly={editMode}
                        value={manifestPrefix}
                        onChange={(e) =>
                          changeManifestNumber(
                            `${e.target.value.replace(/\D/g, "").slice(0, 3)}${manifestSuffix}`,
                          )
                        }
                      />
                      <input
                        aria-label="Número do manifesto"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="000000-0"
                        readOnly={editMode}
                        value={manifestSuffix}
                        onChange={(e) =>
                          changeManifestNumber(
                            `${manifestPrefix}${e.target.value}`,
                          )
                        }
                        onBlur={() => {
                          if (!manifestSuffix.trim()) return;
                          const formatted = formatManifestNumber(number);
                          if (formatted) setNumber(formatted);
                          void lookup();
                        }}
                      />
                      <input type="hidden" name="manifesto" value={number} />
                    </div>
                    {manifest && (
                      <small className="manifest-date-time" role="status">
                        Hora: {manifest.hora || "Não informada"} · Data:{" "}
                        {displayDate(manifest.semana.slice(0, 10))}
                      </small>
                    )}
                  </div>
                </div>
                {searching && <p role="status">Buscando manifesto⬦</p>}
                {manifestMissing && !searching && (
                  <p className="muted" role="status">
                    Manifesto ainda não cadastrado. O vale será vinculado
                    automaticamente quando ele for lançado.
                  </p>
                )}

                <label>
                  Placa
                  <SearchableSelect
                    aria-label="Placa"
                    name="placa"
                    required
                    disabled={!!manifest}
                    value={plate}
                    onChange={(e) => {
                      setPlate(normalizePlate(e.target.value));
                      setVehicleType("");
                    }}
                  >
                    {plateOptions}
                  </SearchableSelect>
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
                    <SearchableSelect
                      aria-label="Motorista"
                      disabled
                      value="manifest"
                    >
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
                        {driverOptions}
                      </SearchableSelect>
                    </label>
                  </>
                )}
                <label>
                  Data do vale
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="DD/MM/AAAA"
                    required
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      e.target.setCustomValidity("");
                    }}
                    onBlur={(e) => {
                      const parsed = parseQuickDate(e.target.value);
                      if (parsed) setDate(parsed.display);
                      e.target.setCustomValidity(
                        parsed || !e.target.value
                          ? ""
                          : "Informe uma data vÒ¡lida, como 121226 ou 12/12/2026.",
                      );
                    }}
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
                        {e.codigo} · {expenseName(e.codigo, e.nome)} · {expenseType(e.codigo, e.tipo)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor do vale
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
                  Descrição do vale
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
              onClick={(event) => {
                if (!editMode && savedAwaitingNewData) {
                  if (emptySaveClicks === 0) {
                    setEmptySaveClicks(1);
                    return;
                  }
                  event.preventDefault();
                  newEntry();
                  setWeek("");
                }
              }}
              disabled={
                busy ||
                searching ||
                locked ||
                !expenses.length ||
                (editMode && !editing)
              }
            >
              {busy ? "Salvando⬦" : "Salvar vale"}
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
                Novo vale
              </button>
            )}{" "}
            {editMode && (
              <button
                type="button"
                className="secondary"
                disabled={busy || searching || !editing || deletionLocked}
                onClick={() => {
                  setDeleteTarget(editing);
                  setError("");
                  setSuccess("");
                }}
              >
                Excluir vale
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
            Excluir o vale {valeIdentifier(deleteTarget)}, placa {deleteTarget.placa}, no
            valor de{" "}
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
            Confirmar cancelamento
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setDeleteTarget(null)}
          >
            Manter vale
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
            {consult ? "Ocultar vales" : "Consultar vales do manifesto"}
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
