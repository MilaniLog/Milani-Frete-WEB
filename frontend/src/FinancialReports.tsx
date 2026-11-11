import { formatDocument, normalizePlate, normalizeWeek } from "./field-formats";
import SortableTable from "./SortableTable";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { downloadReport } from "./report-download";
import SearchableSelect from "./SearchableSelect";
import { expenseName } from "./expense-display";
import QuickDateInput from "./QuickDateInput";
type Report = {
  title: string;
  notes: string[];
  columns: string[];
  rows: (string | number | null)[][];
  numeric: number[];
  totals: { label: string; value: string }[];
  totalSections?: {
    title: string;
    totals: { label: string; value: string }[];
  }[];
  subtotalRows?: number[];
  plateDetails?: Record<string, { driver?: string | null; vehicleType?: string | null }>;
};
type Week = { codigo: string; data_inicio: string; data_fim: string };
type Expense = { codigo: string; nome: string; tipo: string; ativo: boolean };
const date = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const money = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function FinancialReports({
  kind,
  token,
  isAdmin = false,
  userUnit = 0,
  expired,
}: {
  kind: "financial" | "coupons" | "payments";
  token: string;
  isAdmin?: boolean;
  userUnit?: number;
  expired: () => void;
}) {
  const payments = kind === "payments";
  const endpoint = payments ? "payments" : "financial";
  const filename = payments ? "pagamentos" : kind === "coupons" ? "cupons" : "vales";
  const reportRef = useRef<HTMLElement | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]),
    [vehicles, setVehicles] = useState<{ plate: string; codVehicleType: number }[]>([]),
    [types, setTypes] = useState<{ codVehicleType: number; typeName: string }[]>([]),
    [expenses, setExpenses] = useState<Expense[]>([]),
    [units, setUnits] = useState<
      { codigo: number; local: string; dominio: "MLN" | "LOOG" | null }[]
    >([]);
  const [emission] = useState(() => new Date().toLocaleString("pt-BR"));
  const [form, setForm] = useState({
    semana: "",
    inicio: "",
    fim: "",
    local: "",
    dominio: "",
    placa: "",
    departamento: "",
    usuario: "",
    lancamentos: kind === "financial",
    cupons: kind === "coupons",
    data_por: "despesa",
    situacao: "abertos",
    movimento: "debito",
    tipo: "",
    categoria: "Todos",
  });
  const [report, setReport] = useState<Report | null>(null),
    [query, setQuery] = useState(""),
    [valePlateIndex, setValePlateIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Week[]>("/weeks", token),
      api<typeof vehicles>("/registrations/vehicles", token),
      api<typeof types>("/registrations/vehicle-types", token),
      !payments && kind === "financial"
        ? api<Expense[]>("/freight-expenses", token)
        : Promise.resolve([]),
      isAdmin
        ? api<typeof units>("/registrations/units", token)
        : Promise.resolve([]),
    ])
      .then(([w, v, t, x, u]) => {
        if (active) {
          setWeeks(w);
          setVehicles(v);
          setTypes(t);
          setExpenses(x);
          setUnits(u);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [token, kind, isAdmin, payments]);
  useEffect(() => {
    if (!report) return;
    window.setTimeout(
      () => reportRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
      0,
    );
  }, [report]);
  function change(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "semana"
        ? { inicio: "", fim: "" }
        : key === "inicio" || key === "fim"
          ? { semana: "" }
          : {}),
    }));
    setReport(null);
    setValePlateIndex(0);
    setQuery("");
    setError("");
  }
  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const q = new URLSearchParams();
      for (const k of [
        "semana",
        "inicio",
        "fim",
        "placa",
        ...(!payments && isAdmin ? ["local"] : []),
        ...(payments
          ? ["dominio", "categoria"]
          : [
              "departamento",
              "usuario",
              "lancamentos",
              "cupons",
              "data_por",
              "situacao",
              ...(kind === "financial" ? ["movimento", "tipo"] : []),
            ]),
      ] as (keyof typeof form)[]) {
        if (form[k] !== "") q.set(k, String(form[k]));
      }
      const qs = q.toString();
      setReport(await api<Report>(`/freight-reports/${endpoint}?${qs}`, token));
      setValePlateIndex(0);
      setQuery(qs);
      if (!payments) {
        await downloadReport(
          `/freight-reports/financial/print?${qs}`,
          token,
          `${filename}.html`,
        );
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function download(sheet = false) {
    setBusy(true);
    setError("");
    try {
      await downloadReport(
        `/freight-reports/${endpoint}/${sheet ? "spreadsheet" : "print"}?${query}`,
        token,
        sheet
          ? "planilha-pagamentos.xlsx"
          : `${filename}.html`,
        sheet
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : undefined,
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const w = weeks.find((w) => w.codigo === form.semana);
  const vehicle = vehicles.find((v) => v.plate === form.placa);
  const vehicleType = types.find((t) => t.codVehicleType === vehicle?.codVehicleType)?.typeName;
  const unitLocations = [...new Set(units.map((row) => row.local).filter(Boolean))]
    .filter(
      (local) =>
        local.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() !==
        "ARACARIGUAMA",
    )
    .sort();
  const valeRowsByPlate = report && kind === "financial"
    ? [...new Set(report.rows.map((row) => String(row[3] ?? "SEM PLACA")))]
        .map((plate) => ({
          plate,
          rows: report.rows.filter((row) => String(row[3] ?? "SEM PLACA") === plate),
        }))
    : [];
  const currentValePlate = valeRowsByPlate[valePlateIndex] ?? null;
  const currentValeTotal = currentValePlate?.rows.reduce(
    (total, row) =>
      String(row[6] ?? "").trim() === "3333"
        ? total
        : total + Number(row[10] ?? 0),
    0,
  ) ?? 0;
  const currentValeDetails = currentValePlate
    ? report?.plateDetails?.[currentValePlate.plate]
    : undefined;
  const currentValeDriver = currentValeDetails?.driver ??
    String(currentValePlate?.rows[0]?.[4] ?? "");
  const currentValeVehicle = vehicles.find((item) => item.plate === currentValePlate?.plate);
  const currentValeVehicleType = currentValeDetails?.vehicleType ??
    types.find((type) => type.codVehicleType === currentValeVehicle?.codVehicleType)?.typeName ?? "";
  const valeSections = currentValePlate
    ? [
        { title: "Créditos", rows: currentValePlate.rows.filter((row) => row[9] === "Credito") },
        { title: "Débitos", rows: currentValePlate.rows.filter((row) => row[9] === "Debito" && String(row[6] ?? "").trim() !== "3333") },
        { title: "CTRB", rows: currentValePlate.rows.filter((row) => String(row[6] ?? "").trim() === "3333" || !["Credito", "Debito"].includes(String(row[9] ?? ""))) },
      ].filter((section) => section.rows.length > 0)
    : [];
  return (
    <div className="content">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <section className="panel reference-form">
        <form className={`report-vba-form ${payments ? "report-vba-payments" : "report-vba-financial"}`} onSubmit={generate}>
          <fieldset disabled={busy}>
            <div className="report-vba-top">
              <div className="report-vba-row">
                <label>Semana
                  <input list="report-weeks" maxLength={4} pattern="[0-9]{4}"
                    value={form.semana} onChange={(e) => change("semana", normalizeWeek(e.target.value))} />
                </label>
                <span className="report-vba-description" aria-label="Período da semana">
                  {w ? `${date(w.data_inicio)} — ${date(w.data_fim)}` : ""}
                </span>
              </div>
              {!payments && <label className="report-vba-emission">Emissão<input value={emission} readOnly /></label>}
            </div>
            <div className="report-vba-row">
              <label>Placa
                <input list="report-plates" maxLength={8} pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                  value={form.placa} onChange={(e) => change("placa", normalizePlate(e.target.value))} />
              </label>
              <span className="report-vba-description">{vehicleType || (form.placa ? "" : "Todos os veículos")}</span>
            </div>
            {!payments && (
              <div className="report-vba-row">
                <label>Unidade
                  <SearchableSelect
                    aria-label="Unidade"
                    value={isAdmin ? form.local : String(userUnit)}
                    disabled={!isAdmin}
                    onChange={(e) => change("local", e.target.value)}
                  >
                    <option value="">Todas</option>
                    {isAdmin ? unitLocations.map((local) => (
                      <option key={local} value={local}>{local}</option>
                    )) : <option value={String(userUnit)}>{userUnit}</option>}
                  </SearchableSelect>
                </label>
                <span className="report-vba-description">
                  {isAdmin ? (form.local || "Todas as unidades") : `Unidade ${userUnit}`}
                </span>
              </div>
            )}
            {payments ? <>
              <div className="report-vba-row">
                <label>Domínio
                  <select aria-label="Domínio" value={form.dominio} disabled={!isAdmin} onChange={(e) => change("dominio", e.target.value)}>
                    <option value="">Todas</option>
                    <option value="LOOG">LOOG</option>
                    <option value="MLN">MLN</option>
                  </select>
                </label>
                <span className="report-vba-description">{form.dominio || "Todos os domínios"}</span>
              </div>
              <div className="report-vba-row">
                <label>Categoria de veículo
                  <select aria-label="Categoria de veículo" value={form.categoria} onChange={(e) => change("categoria", e.target.value)}>
                    <option value="Todos">Todos</option>
                    <option value="Agregado">Agregado</option>
                    <option value="Esporadico">Esporádico</option>
                  </select>
                </label>
                <span className="report-vba-description">{form.categoria === "Esporadico" ? "Somente veículos esporádicos" : form.categoria === "Agregado" ? "Somente veículos agregados" : "Todas as categorias"}</span>
              </div>
              <details className="report-vba-extra">
                <summary>Consultar por período</summary>
                <div className="report-vba-dates">
                  <label>Início<QuickDateInput value={form.inicio} onChange={(value) => change("inicio", value)} /></label>
                  <label>Fim<QuickDateInput value={form.fim} onChange={(value) => change("fim", value)} /></label>
                </div>
              </details>
            </> : <>
              <div className="report-vba-dates">
                <label>Início<QuickDateInput value={form.inicio} onChange={(value) => change("inicio", value)} /></label>
                <label>Fim<QuickDateInput value={form.fim} onChange={(value) => change("fim", value)} /></label>
              </div>
              <div className="report-vba-bottom">
                <div className="report-vba-fields">
                  <label>Departamento
                    <select aria-label="Departamento" value={form.departamento} onChange={(e) => change("departamento", e.target.value)}>
                      <option value="">Todos</option>
                      <option value="FIN">FINANCEIRO</option>
                      <option value="OCO">OCORRÊNCIA</option>
                      <option value="COM">COMERCIAL</option>
                      <option value="RH">RH</option>
                    </select>
                  </label>
                  <label>Usuário<input inputMode="numeric" pattern="[0-9]+" value={form.usuario} onChange={(e) => change("usuario", e.target.value)} /></label>
                  {kind === "financial" && <>
                    <label>Crédito / débito
                      <select aria-label="Crédito / débito" value={form.movimento} onChange={(e) => change("movimento", e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                      </select>
                    </label>
                    <label>Tipo
                      <select aria-label="Tipo" value={form.tipo} onChange={(e) => change("tipo", e.target.value)}>
                        <option value="">Todos</option>
                        {[...new Map(expenses.map((expense) => [expense.codigo, expense])).values()]
                          .sort((a, b) => a.codigo.localeCompare(b.codigo))
                          .map((expense) => (
                            <option key={expense.codigo} value={expense.codigo}>
                              {expense.codigo} - {expenseName(expense.codigo, expense.nome)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>}
                  <label>Situação
                    <select aria-label="Situação" value={form.situacao} onChange={(e) => change("situacao", e.target.value)}>
                      <option value="abertos">Em aberto</option>
                      <option value="pagos">Pagos / fechados</option>
                      <option value="todos">Todos</option>
                    </select>
                  </label>
                </div>
                <div className="report-vba-options">
                  <fieldset className="legacy-group">
                    <legend>Imprimir por</legend>
                    <div className="report-checks">
                      <label title="Data de inclusão no site"><input type="radio" name="report-date" checked={form.data_por === "inclusao"} onChange={() => change("data_por", "inclusao")} />Dt. de lanç.</label>
                      <label title="Data da despesa ou cobrança"><input type="radio" name="report-date" checked={form.data_por === "despesa"} onChange={() => change("data_por", "despesa")} />Dt. da desp.</label>
                    </div>
                  </fieldset>
                </div>
              </div>
            </>}
            <datalist id="report-weeks">{weeks.map((w) => <option key={w.codigo} value={w.codigo} />)}</datalist>
            <datalist id="report-plates">{vehicles.map((v) => <option key={v.plate} value={v.plate} />)}</datalist>
            <div className="actions">
              <button className="primary">{busy ? "Gerando…" : payments ? "Relatório" : "Imprimir"}</button>
            </div>
            {!payments && <p className="muted report-vba-hint">Para imprimir, abra o relatório baixado e use Ctrl+P.</p>}
          </fieldset>
        </form>
      </section>
      {report && (
        <section ref={reportRef} className="panel report-results">
          <h2>{report.title}</h2>
          {report.notes.map((n, i) => (
            <p className="muted" key={i}>
              {n}
            </p>
          ))}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void download()}
            >
              Baixar para impressão
            </button>
            {payments && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void download(true)}
              >
                Baixar planilha Excel
              </button>
            )}
          </div>
          <p className="muted">
            {payments
              ? "A planilha XML abre no Excel e preserva zeros de CPF/CNPJ e números de documentos. "
              : ""}
            Para imprimir, abra o HTML baixado e use Ctrl+P.
          </p>
          {kind === "financial" ? (
            <div className="report-vales-by-plate">
              {currentValePlate && (
                <section className="closure-record-list" key={currentValePlate.plate}>
                  <div className="batch-conference-heading">
                    <div>
                      <strong>{valePlateIndex + 1} de {valeRowsByPlate.length} · {currentValePlate.plate}{currentValeVehicleType ? ` · ${currentValeVehicleType}` : ""}{currentValeDriver ? ` · ${currentValeDriver}` : ""}</strong>
                      <span className="report-vale-count">{currentValePlate.rows.length} vale{currentValePlate.rows.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  {valeSections.map((section) => <div className="table-scroll report-vale-section" key={section.title}>
                    <h4>{section.title}</h4>
                    <table>
                      <thead>
                        <tr><th>Data</th><th>ID Vale</th><th>Manifesto</th><th>Tipo</th><th>Despesa</th><th>Descrição</th><th>Usuário</th><th className="right">Valor</th></tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={`${currentValePlate.plate}-${index}`}>
                            <td>{row[2] ?? ""}</td>
                            <td>{row[1] ?? ""}</td>
                            <td>{row[5] ?? ""}</td>
                            <td>{String(row[6] ?? "").trim() === "3333" ? "CTRB" : row[9] ?? "Vale"}</td>
                            <td>{[row[6], row[7]].filter(Boolean).join(" - ")}</td>
                            <td>{row[8] ?? ""}</td>
                            <td>{row[12] ?? ""}</td>
                            <td className="right">{money(row[10] ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><th colSpan={7}>Total de {section.title.toLowerCase()}</th><th className="right">{money(section.rows.reduce((sum, row) => sum + Number(row[10] ?? 0), 0))}</th></tr></tfoot>
                    </table>
                  </div>)}
                  <div className="report-vale-plate-total"><strong>Total da placa</strong><strong>{money(currentValeTotal)}</strong></div>
                  <div className="actions report-plate-navigation">
                    <button
                      type="button"
                      className="secondary"
                      disabled={valePlateIndex === 0}
                      onClick={() => {
                        setValePlateIndex((index) => Math.max(0, index - 1));
                        reportRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                      }}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={valePlateIndex >= valeRowsByPlate.length - 1}
                      onClick={() => {
                        setValePlateIndex((index) => Math.min(valeRowsByPlate.length - 1, index + 1));
                        reportRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                      }}
                    >
                      Próximo
                    </button>
                  </div>
                </section>
              )}
            </div>
          ) : <div className="table-scroll">
            <SortableTable>
              {!payments && <thead>
                <tr>
                  {report.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>}
              <tbody>
                {report.rows.map((r, i) => {
                  const subtotal = report.subtotalRows?.includes(i) ?? false;
                  const companyBlock = payments && !subtotal &&
                    (i === 0 || report.rows[i - 1]?.[0] !== r[0]);
                  return (
                    <Fragment key={i}>
                      {companyBlock && (
                        <tr className="report-company-row">
                          <th>{r[0] || "SEM EMPRESA"}</th>
                          {report.columns.slice(1).map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      )}
                      <tr className={subtotal ? "report-subtotal-row" : undefined}>
                        {r.map((v, j) => (
                          <td key={j}>
                            {v == null
                              ? ""
                              : report.numeric.includes(j)
                                ? money(v)
                                : /CPF|CNPJ/.test(report.columns[j]) ? formatDocument(v) : v}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </SortableTable>
          </div>}
          {!report.rows.length && <p>Nenhum registro encontrado.</p>}
          <p>{kind === "financial" ? currentValePlate?.rows.length ?? 0 : report.rows.length} registros.</p>
          {kind !== "financial" && <div className="report-total-sections">
            {(report.totalSections ?? [{ title: "Totais", totals: report.totals }]).map((section) => (
              <section
                className="report-total-block"
                key={section.title}
              >
                {section.title && <h3>{section.title}</h3>}
                <dl className="detail-grid">
                  {section.totals.map((t) => (
                    <div key={t.label}>
                      <dt>{t.label}</dt>
                      <dd>{money(t.value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>}
        </section>
      )}
    </div>
  );
}
