import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { formatDocument, normalizeWeek } from "./field-formats";
import { downloadReport } from "./report-download";
import SortableTable from "./SortableTable";
import SearchableSelect from "./SearchableSelect";

type Week = { codigo: string; data_inicio: string; data_fim: string };
type Report = {
  title: string;
  notes: string[];
  columns: string[];
  rows: (string | number | null)[][];
  numeric: number[];
  totals: { label: string; value: string }[];
};

const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");
const money = (value: string | number | null) =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function AccumulatedFreightReport({
  token,
  expired,
}: {
  token: string;
  expired: () => void;
}) {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [units, setUnits] = useState<{ unit: number; branch: string; dominio: string | null }[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<{ codVehicleType: number; typeName: string }[]>([]);
  const [week, setWeek] = useState("");
  const [unit, setUnit] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Week[]>("/weeks", token),
      api<typeof units>("/freight-reports/units", token),
      api<typeof vehicleTypes>("/registrations/vehicle-types", token),
    ])
      .then(([weekRows, unitRows, typeRows]) => {
        if (!active) return;
        setWeeks(weekRows);
        setUnits(unitRows);
        setVehicleTypes(typeRows);
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) expired();
        else setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [token, expired]);

  useEffect(() => {
    if (!report) return;
    window.setTimeout(
      () => resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
      0,
    );
  }, [report]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!week || busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(
        await api<Report>(
          `/freight-reports/freight-accumulated?${query()}`,
          token,
        ),
      );
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) expired();
      else setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function query() {
    return new URLSearchParams({
      semana: week,
      ...(unit ? { local: unit } : {}),
      ...(vehicleType ? { tipo: vehicleType } : {}),
    }).toString();
  }

  async function download(kind: "print" | "spreadsheet") {
    if (!week || busy) return;
    setBusy(true);
    setError("");
    try {
      await downloadReport(
        `/freight-reports/freight-accumulated/${kind}?${query()}`,
        token,
        kind === "spreadsheet" ? "frete-acumulado.xlsx" : "frete-acumulado.html",
        kind === "spreadsheet"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : undefined,
      );
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) expired();
      else setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = weeks.find((item) => item.codigo === week);
  return (
    <div className="content">
      {error && <p role="alert" className="alert">{error}</p>}
      <section className="panel reference-form">
        <form className="report-vba-form accumulated-freight-form" onSubmit={generate}>
          <fieldset disabled={busy}>
            <div className="report-vba-row">
              <label>
                Semana
                <input
                  aria-label="Semana de referência"
                  list="accumulated-freight-weeks"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  required
                  value={week}
                  onChange={(event) => {
                    setWeek(normalizeWeek(event.target.value));
                    setReport(null);
                    setError("");
                  }}
                />
              </label>
              <span className="report-vba-description">
                {selected
                  ? `${date(selected.data_inicio)} — ${date(selected.data_fim)}`
                  : "A semana escolhida e as três anteriores"}
              </span>
            </div>
            <div className="report-vba-row">
              <label>
                Unidade
                <SearchableSelect
                  aria-label="Unidade"
                  value={unit}
                  onChange={(event) => {
                    setUnit(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">Todas</option>
                  {[...new Set(units.map((item) => item.branch).filter((branch) =>
                    Boolean(branch) && branch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() !== "ARACARIGUAMA",
                  ))]
                    .sort((left, right) => left.localeCompare(right, "pt-BR"))
                    .map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                </SearchableSelect>
              </label>
              <label>
                Tipo de veículo
                <SearchableSelect
                  aria-label="Tipo de veículo"
                  value={vehicleType}
                  onChange={(event) => {
                    setVehicleType(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">Todos</option>
                  {vehicleTypes.map((item) => (
                    <option key={item.codVehicleType} value={item.codVehicleType}>
                      {item.typeName}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
            </div>
            <datalist id="accumulated-freight-weeks">
              {weeks.map((item) => <option key={item.codigo} value={item.codigo} />)}
            </datalist>
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
            <button className="secondary" disabled={busy} onClick={() => void download("print")}>Baixar para impressão</button>
            <button className="primary" disabled={busy} onClick={() => void download("spreadsheet")}>Baixar planilha Excel</button>
          </div>
          <div className="table-scroll">
            <SortableTable>
              <tbody>
                {report.rows.map((row, rowIndex) => (
                  <Fragment key={`${row[0]}-${row[3]}-${rowIndex}`}>
                    {(rowIndex === 0 || report.rows[rowIndex - 1]?.[0] !== row[0]) && (
                      <tr className="report-company-row">
                        <th>Unidade {row[0]}</th>
                        {report.columns.slice(1).map((column) => <th key={column}>{column}</th>)}
                      </tr>
                    )}
                    <tr>
                      {row.map((value, columnIndex) => (
                        <td key={columnIndex} className={report.numeric.includes(columnIndex) ? "right" : undefined}>
                          {value == null
                            ? ""
                            : report.numeric.includes(columnIndex)
                              ? money(value)
                              : /CPF|CNPJ/i.test(report.columns[columnIndex] ?? "")
                                ? formatDocument(value)
                                : value}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </SortableTable>
          </div>
          {!report.rows.length && <p>Nenhum fechamento encontrado nas quatro semanas.</p>}
          <dl className="detail-grid">
            {report.totals.map((total) => (
              <div key={total.label}><dt>{total.label}</dt><dd>{money(total.value)}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
