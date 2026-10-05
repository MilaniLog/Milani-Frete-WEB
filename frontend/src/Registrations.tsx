import DocumentInput from "./DocumentInput";
import { formatDocument, normalizePlate } from "./field-formats";
import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import SearchableSelect from './SearchableSelect';
type Company = { sigla: string; matriz: string; nome: string; cor: string };
type RecordRow = {
  cpf?: string;
  name?: string;
  plate?: string;
  codVehicleType?: number;
  owner?: string;
  owner_name?: string | null;
  empresa_sigla?: string | null;
  driver_cpf?: string | null;
  driver_name?: string | null;
};
export default function Registrations({
  kind,
  token,
  expired,
}: {
  kind: "drivers" | "vehicles" | "companies";
  token: string;
  isAdmin: boolean;
  expired: () => void;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [drivers, setDrivers] = useState<{cpf:string;name:string}[]>([]),
    [companies, setCompanies] = useState<Company[]>([]),
    [types, setTypes] = useState<
      { codVehicleType: number; typeName: string }[]
    >([]);
  const [ownerIsDriver, setOwnerIsDriver] = useState(false);
  const [vehicleDriver, setVehicleDriver] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerDocument, setOwnerDocument] = useState('');
  const [query, setQuery] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [editing, setEditing] = useState<RecordRow | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const driver = kind === "drivers",
    catalog = kind === "companies";
  const title = catalog ? "Empresas" : driver ? "Motoristas" : "Veículos";
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [c, r, t, d] = await Promise.all([
        driver ? Promise.resolve([]) : api<Company[]>("/registrations/companies", token),
        catalog
          ? Promise.resolve([])
          : api<RecordRow[]>(`/registrations/${kind}`, token),
        kind === "vehicles"
          ? api<{ codVehicleType: number; typeName: string }[]>(
              "/registrations/vehicle-types",
              token,
            )
          : Promise.resolve([]),
        kind === 'vehicles' ? api<{cpf:string;name:string}[]>('/drivers',token) : Promise.resolve([]),
      ]);
      setCompanies(c);
      setRows(r);
      setTypes(t);
      setDrivers(d);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [kind, token]);
  const current = editing && editing !== "new" ? editing : null;
  useEffect(() => {
    setOwnerIsDriver(false);
    setVehicleDriver(current?.driver_cpf ?? '');
    setOwnerName(current?.owner_name ?? '');
    setOwnerDocument(current?.owner ?? '');
  }, [editing]);
  function selectOwnerAsDriver(checked: boolean) {
    setError('');
    if (!checked) { setOwnerIsDriver(false); return; }
    const matches = drivers.filter(d => normalize(d.name.trim()) === normalize(ownerName.trim()));
    const match = matches.length === 1 ? matches[0] : undefined;
    if (!match) {
      setError(matches.length > 1 ? 'Há motoristas com esse nome. Escolha o cadastro no campo Motorista.' : 'Proprietário não encontrado nos motoristas. Cadastre o motorista antes de vinculá-lo.');
      return;
    }
    setVehicleDriver(match.cpf); setOwnerIsDriver(true);
  }
  async function removeVehicle() {
    if (!current?.plate || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await api(`/registrations/vehicles/${encodeURIComponent(current.plate)}`,token,{method:'DELETE'});
      setEditing(null); setConfirmDelete(false);
      setSuccess(`Veículo ${current.plate} excluído do cadastro ativo. Histórico preservado.`);
      await load();
    } catch(e) { fail(e); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const payload = driver
      ? {
          cpf: String(data.get("cpf")),
          name: String(data.get("name")).trim(),
        }
      : {
          plate: String(data.get("plate")).trim().toUpperCase(),
          codVehicleType: Number(data.get("codVehicleType")),
          owner: String(data.get("owner")),
          owner_name: String(data.get("owner_name")).trim(),
          empresa_sigla: String(data.get("empresa_sigla")),
          owner_is_driver: ownerIsDriver,
          driver_cpf: String(data.get('driver_cpf') || '') || null,
        };
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(
        `/registrations/${kind}${current ? `/${encodeURIComponent((driver ? current.cpf : current.plate)!)}` : ""}`,
        token,
        { method: current ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      setEditing(null);
      setSuccess("Cadastro salvo com sucesso.");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = rows.filter((r) =>
    normalize(
      driver ? (r.name ?? "") : `${r.plate} ${r.owner_name ?? ""}`,
    ).includes(normalize(query)),
  );
  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CADASTROS</p>
          <h1>{title}</h1>
        </div>
        {!catalog && (
          <button
            className="primary"
            disabled={busy || !!editing}
            onClick={() => {
              setEditing("new");
              setConfirmDelete(false);
              setError("");
              setSuccess("");
            }}
          >
            {driver ? "+ Novo motorista" : "+ Novo veículo"}
          </button>
        )}
      </div>
      <p className="muted">
        {catalog
          ? "Empresas usadas no cadastro dos veículos."
          : driver
            ? "Localize o motorista pelo nome."
            : "Localize o veículo pela placa ou pelo proprietário."}{" "}
      </p>
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
      {editing && (
        <section className="panel reference-form">
          <h2>
            {current
              ? "Editar cadastro"
              : driver
                ? "Novo motorista"
                : "Novo veículo"}
          </h2>
          <form
            className="legacy-register"
            onSubmit={save}
            key={current?.cpf ?? current?.plate ?? "new"}
          >
            <fieldset disabled={busy}>
              <div className="form-grid">
                {driver ? (
                  <>
                    <label>
                      CPF
                      <DocumentInput kind="cpf"
                        name="cpf"
                        required
                        inputMode="numeric"
                        readOnly={!!current}
                        defaultValue={current?.cpf ?? ""}
                      />
                    </label>
                    <label>
                      Nome
                      <input
                        name="name"
                        required
                        minLength={4}
                        maxLength={50}
                        defaultValue={current?.name ?? ""}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Placa
                      <input
                        name="plate"
                        required
                        pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                        maxLength={8}
                        readOnly={!!current}
                        defaultValue={current?.plate ?? ""}
                        onChange={e => { e.target.value = normalizePlate(e.target.value); }}
                      />
                    </label>
                    <label>
                      Tipo de veículo
                      <select
                    name="codVehicleType"
                    aria-label="Tipo de veículo"
                        required
                        defaultValue={current?.codVehicleType ?? ""}
                      >
                        <option value="">Selecione</option>
                        {types.map((t) => (
                          <option
                            key={t.codVehicleType}
                            value={t.codVehicleType}
                          >
                            {t.codVehicleType} · {t.typeName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Proprietário
                      <input
                        name="owner_name"
                        required
                        minLength={2}
                        maxLength={50}
                        value={ownerName} onChange={e => { setOwnerName(e.target.value); setOwnerIsDriver(false); }}
                      />
                    </label>
                    <label>
                      CPF/CNPJ do proprietário
                      <DocumentInput
                        name="owner"
                        required
                        inputMode="numeric"
                        value={ownerDocument} onValueChange={value => { setOwnerDocument(value); setOwnerIsDriver(false); }}
                      />
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={ownerIsDriver} onChange={e => selectOwnerAsDriver(e.target.checked)} />
                      O proprietário é o motorista?
                    </label>
                    <label>
                      Motorista
                      <SearchableSelect aria-label="Motorista do veículo" name="driver_cpf" value={vehicleDriver} onChange={e => { setVehicleDriver(e.target.value); setOwnerIsDriver(false); }}>
                        <option value="">Sem motorista vinculado</option>
                        {drivers.map(d=><option key={d.cpf} value={d.cpf}>{d.name}{drivers.filter(x=>x.name===d.name).length>1 ? ` — CPF final ${d.cpf.slice(-4)}` : ''}</option>)}
                      </SearchableSelect>
                      <small>Preenche o manifesto automaticamente; pode ser alterado na viagem.</small>
                    </label>
                  </>
                )}
                {!driver && <label>
                  Empresa
                  <select
                  name="empresa_sigla"
                  aria-label="Empresa"
                    required
                    defaultValue={current?.empresa_sigla ?? ""}
                  >
                    <option value="">Selecione</option>
                    {companies.map((c) => (
                      <option key={c.sigla} value={c.sigla}>
                        {c.sigla} · {c.nome}
                      </option>
                    ))}
                  </select>
                </label>}
              </div>
              <p className="muted">
                CPF e CNPJ recebem pontuação automaticamente.
                {!driver && " A empresa do veículo identifica a empresa de pagamento; não define percentual de rateio."}
              </p>
              <button className="primary">Salvar cadastro</button>{" "}
              {!driver && current && <div className="vehicle-delete">
                {!confirmDelete ? <button type="button" className="secondary" disabled={busy} onClick={()=>setConfirmDelete(true)}>Excluir veículo</button> : <div role="alert">
                  <p>Excluir o veículo {current.plate}? Ele sairá dos cadastros ativos e das opções para novos manifestos. O histórico será preservado.</p>
                  <button type="button" className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancelar exclusão</button>
                  <button type="button" className="primary" disabled={busy} onClick={()=>void removeVehicle()}>Confirmar exclusão</button>
                </div>}
              </div>}
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </fieldset>
          </form>
        </section>
      )}
      <section className="panel">
        <button
          className="secondary"
          disabled={busy || !!editing}
          onClick={() => void load()}
        >
          Atualizar cadastros
        </button>
        {!catalog && (
          <label>
            {driver ? "Buscar motorista pelo nome" : "Buscar veículo"}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
        {busy && <p role="status">Carregando…</p>}
        <div className="table-scroll">
          <SortableTable>
            <thead>
              <tr>
                {catalog ? (
                  <>
                    <th>Matriz</th>
                    <th>Sigla</th>
                    <th>Empresa</th>
                  </>
                ) : (
                  <>
                    <th>{driver ? "Motorista" : "Placa"}</th>
                    <th>{driver ? "CPF" : "Proprietário"}</th>
                    {!driver && <><th>CPF/CNPJ do proprietário</th><th>Tipo de veículo</th><th>Empresa</th></>}
                    {!driver && <th>Motorista vinculado</th>}
                    <th>Ações</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {catalog
                ? companies.map((c) => (
                    <tr key={c.sigla}>
                      <td>{c.matriz}</td>
                      <td>{c.sigla}</td>
                      <td>{c.nome}</td>
                    </tr>
                  ))
                : filtered.map((r) => (
                    <tr key={r.cpf ?? r.plate}>
                      <td>{driver ? r.name : r.plate}</td>
                      <td>
                        {driver ? formatDocument(r.cpf, "cpf") : (r.owner_name ?? "Não informado")}
                      </td>
                      {!driver && <><td>{r.owner ? formatDocument(r.owner) : "Não informado"}</td><td>{types.find(t => t.codVehicleType === r.codVehicleType)?.typeName ?? r.codVehicleType ?? "Não informado"}</td></>}
                      {!driver && <td>
                        {companies.find((c) => c.sigla === r.empresa_sigla)
                          ?.nome ?? "Não informada"}
                      </td>}
                      {!driver && <td>{r.driver_name ?? 'Não vinculado'}</td>}
                      <td>
                        {(
                          <button
                            className="text-button"
                            disabled={busy || !!editing}
                            onClick={() => {
                              setEditing(r);
                              setConfirmDelete(false);
                              setError("");
                              setSuccess("");
                            }}
                          >
                            Editar {driver ? r.name : r.plate}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </SortableTable>
        </div>
        {!busy && !catalog && !filtered.length && (
          <p>Nenhum cadastro encontrado.</p>
        )}
      </section>
    </section>
  );
}
