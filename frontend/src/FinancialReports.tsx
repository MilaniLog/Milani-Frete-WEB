import { formatDocument, normalizePlate, normalizeWeek } from "./field-formats";
import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { downloadReport } from "./report-download";
type Report = {
  title: string;
  notes: string[];
  columns: string[];
  rows: (string | number | null)[][];
  numeric: number[];
  totals: { label: string; value: string }[];
};
type Week = { codigo: string; data_inicio: string; data_fim: string };
const date = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const money = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function FinancialReports({
  kind,
  token,
  expired,
}: {
  kind: "financial" | "coupons" | "payments";
  token: string;
  expired: () => void;
}) {
  const payments = kind === "payments";
  const endpoint = payments ? "payments" : "financial";
  const filename = payments ? "pagamentos" : kind === "coupons" ? "cupons" : "lancamentos";
  const [weeks, setWeeks] = useState<Week[]>([]),
    [vehicles, setVehicles] = useState<{ plate: string; codVehicleType: number }[]>([]),
    [types, setTypes] = useState<{ codVehicleType: number; typeName: string }[]>([]),
    [companies, setCompanies] = useState<{ sigla: string; nome: string }[]>([]);
  const [emission] = useState(() => new Date().toLocaleString("pt-BR"));
  const [form, setForm] = useState({
    semana: "",
    inicio: "",
    fim: "",
    placa: "",
    empresa: "",
    departamento: "",
    usuario: "",
    lancamentos: kind === "financial",
    cupons: kind === "coupons",
    data_por: "despesa",
    situacao: "abertos",
  });
  const [report, setReport] = useState<Report | null>(null),
    [query, setQuery] = useState(""),
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
      payments
        ? api<{ sigla: string; nome: string }[]>(
            "/registrations/companies",
            token,
          )
        : Promise.resolve([]),
      api<typeof types>("/registrations/vehicle-types", token),
    ])
      .then(([w, v, c, t]) => {
        if (active) {
          setWeeks(w);
          setVehicles(v);
          setCompanies(c);
          setTypes(t);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [token, kind]);
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
        ...(payments
          ? ["empresa"]
          : [
              "departamento",
              "usuario",
              "lancamentos",
              "cupons",
              "data_por",
              "situacao",
            ]),
      ] as (keyof typeof form)[]) {
        if (form[k] !== "") q.set(k, String(form[k]));
      }
      const qs = q.toString();
      setReport(await api<Report>(`/freight-reports/${endpoint}?${qs}`, token));
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
          ? "planilha-pagamentos.xml"
          : `${filename}.html`,
        sheet ? "application/vnd.ms-excel;charset=utf-8" : undefined,
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
  const company = companies.find((c) => c.sigla === form.empresa);
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELATÓRIOS</p>
          <h1>
            {payments
              ? "Planilha de pagamentos"
              : kind === "coupons" ? "Relatório de cupons" : "Relatório de lançamentos"}
          </h1>
        </div>
      </div>
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
                  {w ? `${date(w.data_inicio)} — ${date(w.data_fim)}` : "—"}
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
            {payments ? <>
              <div className="report-vba-row">
                <label>Empresa
                  <select aria-label="Empresa" value={form.empresa} onChange={(e) => change("empresa", e.target.value)}>
                    <option value="">Todas</option>
                    {companies.map((c) => <option key={c.sigla} value={c.sigla}>{c.sigla}</option>)}
                  </select>
                </label>
                <span className="report-vba-description">{company?.nome}</span>
              </div>
              <details className="report-vba-extra">
                <summary>Consultar por período</summary>
                <div className="report-vba-dates">
                  <label>Início<input type="date" value={form.inicio} onChange={(e) => change("inicio", e.target.value)} /></label>
                  <label>Fim<input type="date" value={form.fim} onChange={(e) => change("fim", e.target.value)} /></label>
                </div>
              </details>
            </> : <>
              <div className="report-vba-dates">
                <label>Início<input type="date" value={form.inicio} onChange={(e) => change("inicio", e.target.value)} /></label>
                <label>Fim<input type="date" value={form.fim} onChange={(e) => change("fim", e.target.value)} /></label>
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
                  <details className="report-vba-extra">
                    <summary>Mais filtros</summary>
                    <label>Situação
                      <select aria-label="Situação" value={form.situacao} onChange={(e) => change("situacao", e.target.value)}>
                        <option value="abertos">Em aberto</option>
                        <option value="pagos">Pagos / fechados</option>
                        <option value="todos">Todos</option>
                      </select>
                    </label>
                  </details>
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
        <section className="panel report-results">
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
          <div className="table-scroll">
            <SortableTable>
              <thead>
                <tr>
                  {report.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>
                        {v == null
                          ? "Não registrado"
                          : report.numeric.includes(j)
                            ? money(v)
                            : /CPF|CNPJ/.test(report.columns[j]) ? formatDocument(v) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
          {!report.rows.length && <p>Nenhum registro encontrado.</p>}
          <p>{report.rows.length} registros.</p>
          <dl className="detail-grid">
            {report.totals.map((t) => (
              <div key={t.label}>
                <dt>{t.label}</dt>
                <dd>{money(t.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
