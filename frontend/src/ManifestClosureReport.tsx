import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { formatDocument, normalizeWeek } from "./field-formats";
import { downloadReport } from "./report-download";
import SearchableSelect from "./SearchableSelect";
import QuickDateInput from "./QuickDateInput";
import SortableTable from "./SortableTable";

type Week = { codigo: string; data_inicio: string; data_fim: string };
type Report = {
  title: string;
  notes: string[];
  columns: string[];
  rows: (string | number | null)[][];
  totals: { label: string; value: string }[];
  numeric: number[];
};
const displayDate = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");

export default function ManifestClosureReport({
  token,
  expired,
}: {
  token: string;
  expired: () => void;
}) {
  const resultRef = useRef<HTMLElement | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [units, setUnits] = useState<
    { codigo: number; local: string; dominio: "MLN" | "LOOG" | null }[]
  >([]);
  const [form, setForm] = useState({
    dominio: "",
    semana: "",
    inicio: "",
    fim: "",
    local: "",
  });
  const [report, setReport] = useState<Report | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(value: unknown) {
    if (value instanceof ApiError && value.status === 401) expired();
    else setError((value as Error).message);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Week[]>("/weeks", token),
      api<{ unit: number; branch: string; dominio: "MLN" | "LOOG" | null }[]>(
        "/freight-reports/units",
        token,
      ).then((rows) => rows.map((row) => ({
        codigo: row.unit,
        local: row.branch,
        dominio: row.dominio,
      }))),
    ])
      .then(([weekRows, unitRows]) => {
        if (active) {
          setWeeks(weekRows);
          setUnits(unitRows);
        }
      })
      .catch((value) => active && fail(value));
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (report)
      window.setTimeout(
        () => resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
        0,
      );
  }, [report]);
  function change(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "dominio" ? { local: "" } : {}),
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
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (form.semana) params.set("semana", form.semana);
      else {
        if (form.inicio) params.set("inicio", form.inicio);
        if (form.fim) params.set("fim", form.fim);
      }
      if (form.dominio) params.set("dominio", form.dominio);
      if (form.local) params.set("local", form.local);
      const value = params.toString();
      setReport(await api<Report>(`/freight-reports/manifests?${value}`, token));
      setQuery(value);
    } catch (value) {
      fail(value);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      await downloadReport(
        `/freight-reports/manifests/print?${query}`,
        token,
        "numeros-de-fechamento.html",
      );
    } catch (value) {
      fail(value);
    } finally {
      setBusy(false);
    }
  }
  const selectedWeek = weeks.find((item) => item.codigo === form.semana);
  const unitLocations = [...new Set(
    units
      .filter((row) => !form.dominio || row.dominio === form.dominio)
      .map((row) => row.local)
      .filter(Boolean),
  )]
    .filter(
      (local) =>
        local.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() !==
        "ARACARIGUAMA",
    )
    .sort();
  return (
    <div className="content">
      {error && <p className="alert" role="alert">{error}</p>}
      <section className="panel reference-form">
        <form className="report-vba-form" onSubmit={generate}>
          <fieldset disabled={busy}>
            <h2>Números de fechamento</h2>
            <div className="report-vba-row">
              <label>
                Domínio
                <SearchableSelect
                  aria-label="Domínio"
                  value={form.dominio}
                  onChange={(event) => change("dominio", event.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="LOOG">LOOG</option>
                  <option value="MLN">MLN</option>
                </SearchableSelect>
              </label>
              <span className="report-vba-description">
                {form.dominio || "Todos os domínios"}
              </span>
            </div>
            <div className="report-vba-row">
              <label>
                Unidade
                <SearchableSelect
                  aria-label="Unidade"
                  value={form.local}
                  onChange={(event) => change("local", event.target.value)}
                >
                  <option value="">Todas</option>
                  {unitLocations.map((local) => (
                    <option key={local} value={local}>{local}</option>
                  ))}
                </SearchableSelect>
              </label>
              <span className="report-vba-description">
                {form.local || "Todas as unidades"}
              </span>
            </div>
            <div className="report-vba-row">
              <label>
                Semana
                <SearchableSelect
                  aria-label="Semana"
                  value={form.semana}
                  onChange={(event) => change("semana", normalizeWeek(event.target.value))}
                >
                  <option value="">Selecione a semana</option>
                  {weeks.map((item) => (
                    <option key={item.codigo} value={item.codigo}>{item.codigo}</option>
                  ))}
                </SearchableSelect>
              </label>
              <span className="report-vba-description" aria-label="Período da semana">
                {selectedWeek
                  ? `${displayDate(selectedWeek.data_inicio)} — ${displayDate(selectedWeek.data_fim)}`
                  : "Ou informe o período abaixo"}
              </span>
            </div>
            <div className="report-vba-dates">
              <label>Início<QuickDateInput value={form.inicio} onChange={(value) => change("inicio", value)} /></label>
              <label>Fim<QuickDateInput value={form.fim} onChange={(value) => change("fim", value)} /></label>
            </div>
            <div className="actions">
              <button className="primary">{busy ? "Gerando…" : "Gerar relatório"}</button>
            </div>
          </fieldset>
        </form>
      </section>
      {report && (
        <section ref={resultRef} className="panel report-results">
          <h2>{report.title}</h2>
          {report.notes.map((note) => <p className="muted" key={note}>{note}</p>)}
          <div className="actions">
            <button className="secondary" disabled={busy} onClick={() => void download()}>
              Baixar para impressão
            </button>
          </div>
          <div className="table-scroll">
            <SortableTable>
              <thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index}>{row.map((value, cell) => (
                    <td key={cell}>{value == null
                      ? ""
                      : /CPF|CNPJ/i.test(report.columns[cell] ?? "")
                        ? formatDocument(value)
                        : value}</td>
                  ))}</tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
          {!report.rows.length && <p>Nenhum número de fechamento encontrado.</p>}
          <p>{report.rows.length} placas com número de fechamento.</p>
        </section>
      )}
    </div>
  );
}
