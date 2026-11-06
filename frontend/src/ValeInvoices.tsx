import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { downloadReport } from "./report-download";
import { expenseName, expenseType } from "./expense-display";
import QuickDateInput from "./QuickDateInput";
import { valeIdentifier } from "./vale-identifier";

type Invoice = {
  id: number;
  numero: number;
  unit: number;
  periodo_inicio: string;
  periodo_fim: string;
  quantidade: number;
  valor_total: string;
  responsavel_cod: number;
  status: string;
  created_at: string;
};
type Entry = {
  id: number;
  unit: number;
  controle_id?: number | null;
  data_lancamento: string;
  placa: string | null;
  manifesto_numero: string | null;
  codigo_despesa: string;
  nome_despesa: string;
  descricao: string | null;
  tipo_despesa: string;
  valor: string;
  responsavel_cod: number | null;
};
type Detail = Invoice & { lancamentos: Entry[] };
type Preview = Pick<Invoice, "unit" | "periodo_inicio" | "periodo_fim" | "quantidade" | "valor_total"> & {
  lancamentos: Entry[];
};

const date = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const money = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value: number) => String(value).padStart(6, "0");
const totalsByType = (entries: Entry[]) => {
  const total = (predicate: (entry: Entry) => boolean) => entries
    .filter(predicate)
    .reduce((sum, entry) => sum + Number(entry.valor), 0);
  return {
    creditos: total((entry) => entry.tipo_despesa === "Credito"),
    debitos: total((entry) => entry.tipo_despesa === "Debito" && entry.codigo_despesa.trim() !== "3333"),
    ctrb: total((entry) => entry.tipo_despesa === "Adiantamento" || entry.codigo_despesa.trim() === "3333"),
  };
};

export default function ValeInvoices({
  token,
  globalAccess,
  userUnit,
  expired,
}: {
  token: string;
  globalAccess: boolean;
  userUnit: number;
  expired: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState({ inicio: "", fim: "" });
  const [consultFilters, setConsultFilters] = useState({ movimento: "todos", local: "", dominio: "" });
  const [units, setUnits] = useState<{ codigo: number; local: string; dominio: "MLN" | "LOOG" | null }[]>([]);
  const [separated, setSeparated] = useState(false);
  const [previewSeparated, setPreviewSeparated] = useState(false);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [closureSearch, setClosureSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const resultRef = useRef<HTMLElement | null>(null);
  const visibleInvoices = invoices.filter((invoice) => {
    const query = closureSearch.trim();
    return !query || number(invoice.numero).includes(query) || String(invoice.numero).includes(query);
  });

  function fail(error: unknown) {
    if (error instanceof ApiError && error.status === 401) expired();
    else setError((error as Error).message);
  }
  async function load(search = closureSearch) {
    const query = search.trim();
    const rows = await api<Invoice[]>(`/vale-invoices${query ? `?numero=${encodeURIComponent(query)}` : ""}`, token);
    setInvoices(rows);
  }
  useEffect(() => {
    void load().catch(fail);
  }, [token, globalAccess, userUnit]);
  useEffect(() => {
    if (!globalAccess) return;
    void api<typeof units>("/registrations/units", token).then(setUnits).catch(fail);
  }, [token, globalAccess]);
  useEffect(() => {
    if (!preview && !detail) return;
    requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
    );
  }, [preview, detail]);

  async function closeInvoice(event: FormEvent) {
    event.preventDefault();
    const reportWindow = window.open("", "_blank");
    if (reportWindow) reportWindow.opener = null;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<Invoice & { entries: Entry[] }>("/vale-invoices", token, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSuccess(`Fechamento de vale ${number(result.numero)} gerado com ${result.quantidade} vales.`);
      setDetail({ ...result, lancamentos: result.entries });
      setPreview(null);
      await downloadReport(
        `/vale-invoices/${result.id}/${separated ? "print-separated" : "print"}`,
        token,
        `fechamento-vales-${number(result.numero)}${separated ? "-separado" : ""}.html`,
        "text/html;charset=utf-8",
        reportWindow,
      );
      await load();
    } catch (e) {
      reportWindow?.close();
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function consult() {
    setBusy(true);
    setError("");
    setSuccess("");
    setDetail(null);
    try {
      setPreview(await api<Preview>(`/vale-invoices/preview?${consultQuery()}`, token));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function consultQuery() {
    const query = new URLSearchParams({ inicio: form.inicio, fim: form.fim });
    if (consultFilters.movimento !== "todos") query.set("movimento", consultFilters.movimento);
    if (consultFilters.local) query.set("local", consultFilters.local);
    if (consultFilters.dominio) query.set("dominio", consultFilters.dominio);
    return query.toString();
  }

  async function printPreview() {
    const reportWindow = window.open("", "_blank");
    if (reportWindow) reportWindow.opener = null;
    setBusy(true);
    setError("");
    try {
      await downloadReport(
        `/vale-invoices/preview/${previewSeparated ? "print-separated" : "print"}?${consultQuery()}`,
        token,
        `consulta-vales${previewSeparated ? "-separada" : ""}.html`,
        "text/html;charset=utf-8",
        reportWindow,
      );
    } catch (e) {
      reportWindow?.close();
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const unitLocations = [...new Set(units
    .filter((unit) => !consultFilters.dominio || unit.dominio === consultFilters.dominio)
    .map((unit) => unit.local)
    .filter(Boolean))].sort();
  async function remove(invoice: Invoice) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ released: number }>(`/vale-invoices/${invoice.id}`, token, { method: "DELETE" });
      setDeleting(null);
      if (detail?.id === invoice.id) setDetail(null);
      setSuccess(`Fechamento de vale ${number(invoice.numero)} excluído. ${result.released} vales foram liberados.`);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function open(invoice: Invoice) {
    setBusy(true);
    setError("");
    try {
      setDetail(await api<Detail>(`/vale-invoices/${invoice.id}`, token));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function print(invoice: Invoice) {
    const reportWindow = window.open("", "_blank");
    if (reportWindow) reportWindow.opener = null;
    setBusy(true);
    setError("");
    try {
      await downloadReport(
        `/vale-invoices/${invoice.id}/${separated ? "print-separated" : "print"}`,
        token,
        `fechamento-vales-${number(invoice.numero)}${separated ? "-separado" : ""}.html`,
        "text/html;charset=utf-8",
        reportWindow,
      );
    } catch (e) {
      reportWindow?.close();
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      {error && <p role="alert" className="alert">{error}</p>}
      {success && <p role="status" className="success">{success}</p>}
      <section className="panel reference-form">
        <h1>Fechamentos de vales</h1>
        <p className="muted">O fechamento de vale usa a data do lançamento e bloqueia a edição dos vales incluídos. Se um vale for cancelado, os totais do fechamento serão atualizados.</p>
        <form onSubmit={closeInvoice}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>Data inicial
                <QuickDateInput required value={form.inicio} onChange={(value) => setForm({ ...form, inicio: value })} />
              </label>
              <label>Data final
                <QuickDateInput required value={form.fim} onChange={(value) => setForm({ ...form, fim: value })} />
              </label>
              <label>Tipo da consulta
                <select aria-label="Tipo da consulta" value={consultFilters.movimento} onChange={(event) => setConsultFilters({ ...consultFilters, movimento: event.target.value })}>
                  <option value="todos">Todos</option>
                  <option value="debito">Débito</option>
                  <option value="credito">Crédito</option>
                  <option value="ctrb">CTRB</option>
                </select>
              </label>
              <label>Domínio
                <select aria-label="Domínio da consulta" disabled={!globalAccess} value={consultFilters.dominio} onChange={(event) => setConsultFilters({ ...consultFilters, dominio: event.target.value, local: "" })}>
                  <option value="">Todos</option>
                  <option value="LOOG">LOOG</option>
                  <option value="MLN">MLN</option>
                </select>
              </label>
              <label>Unidade
                <select aria-label="Unidade da consulta" disabled={!globalAccess} value={consultFilters.local} onChange={(event) => setConsultFilters({ ...consultFilters, local: event.target.value })}>
                  <option value="">Todas</option>
                  {unitLocations.map((local) => <option key={local} value={local}>{local}</option>)}
                </select>
              </label>
            </div>
            <p className="muted">Os filtros de tipo, domínio e unidade alteram somente a consulta. Ao fechar, todos os vales disponíveis no período serão incluídos.</p>
            <div className="actions vale-invoice-actions">
              <div className="vale-print-option">
                <label className="checkbox-label" title="Cria uma página para débitos, outra para créditos e outra para CTRB.">
                  <input aria-describedby="separate-print-help" type="checkbox" checked={separated} onChange={(e) => setSeparated(e.target.checked)} />
                  <span>Separar impressão por tipo</span>
                </label>
                <small id="separate-print-help" className="muted">Marcado: débitos, créditos e CTRB saem em páginas separadas. Desmarcado: todos saem juntos.</small>
              </div>
              <div className="vale-invoice-buttons">
                <button type="button" className="secondary" disabled={busy || !form.inicio || !form.fim} onClick={() => void consult()}>Consultar vales</button>
                <button className="primary" disabled={busy}>Fechar vales</button>
              </div>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="panel">
        <h2>Fechamentos gerados</h2>
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(closureSearch).catch(fail); }}>
        <label>
          Pesquisar fechamento de vale
          <input type="search" inputMode="numeric" placeholder="Número do fechamento de vale" value={closureSearch} onChange={(event) => setClosureSearch(event.target.value.replace(/\D/g, ""))} />
        </label>
        <button className="secondary" disabled={busy}>Pesquisar</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Nº Fechamento</th><th>Período</th><th>Vales</th><th>Valor</th><th>Usuário</th><th>Ações</th></tr></thead>
            <tbody>
              {visibleInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{number(invoice.numero)}</td>
                  <td>{date(invoice.periodo_inicio)} a {date(invoice.periodo_fim)}</td>
                  <td>{invoice.quantidade}</td>
                  <td>{money(invoice.valor_total)}</td>
                  <td>{invoice.responsavel_cod}</td>
                  <td className="actions">
                    <button type="button" className="secondary" onClick={() => void open(invoice)}>Consultar</button>
                    <button type="button" className="secondary" onClick={() => void print(invoice)}>Imprimir</button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(invoice)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleInvoices.length && <p>Nenhum fechamento de vale encontrado.</p>}
      </section>

      {deleting && <section className="panel alert" role="alert">
        <p>Excluir o fechamento de vale <strong>{number(deleting.numero)}</strong>? Os {deleting.quantidade} vales serão liberados para um novo fechamento. O número não será reutilizado.</p>
        <button type="button" className="primary" disabled={busy} onClick={() => void remove(deleting)}>Confirmar exclusão</button>{" "}
        <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Manter fechamento</button>
      </section>}

      {(preview || detail) && (() => {
        const shown = preview || detail!;
        const totals = totalsByType(shown.lancamentos);
        return <section className="panel" ref={resultRef}>
        <h2>{preview ? "Consulta de vales para fechamento" : `Fechamento de vale ${number(detail!.numero)}`}</h2>
        <p className="muted">{date(shown.periodo_inicio)} a {date(shown.periodo_fim)} · {shown.quantidade} vales · {money(shown.valor_total)}</p>
        {preview && <div className="actions vale-invoice-actions">
          <div className="vale-print-option">
            <label className="checkbox-label">
              <input type="checkbox" checked={previewSeparated} onChange={(event) => setPreviewSeparated(event.target.checked)} />
              <span>Separar impressão da consulta por tipo</span>
            </label>
            <small className="muted">A impressão usa exatamente os filtros desta consulta e não fecha nenhum vale.</small>
          </div>
          <div className="vale-invoice-buttons">
            <button type="button" className="secondary" disabled={busy || !shown.lancamentos.length} onClick={() => void printPreview()}>Imprimir consulta</button>
          </div>
        </div>}
        <div className="vale-invoice-totals" aria-label="Totais por tipo">
          <span><strong>Créditos</strong>{money(totals.creditos)}</span>
          <span><strong>Débitos</strong>{money(totals.debitos)}</span>
          <span><strong>CTRB</strong>{money(totals.ctrb)}</span>
          <span><strong>Total geral</strong>{money(shown.valor_total)}</span>
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th>Data</th><th>ID Vale</th><th>Placa</th><th>Manifesto</th><th>Despesa</th><th>Descrição</th><th>Usuário</th><th>D/C</th><th>Valor</th></tr></thead>
          <tbody>{shown.lancamentos.map((entry) => <tr key={entry.id}>
            <td>{date(entry.data_lancamento)}</td><td>{valeIdentifier(entry)}</td><td>{entry.placa || ""}</td><td>{entry.manifesto_numero || ""}</td>
            <td>{entry.codigo_despesa} - {expenseName(entry.codigo_despesa, entry.nome_despesa)}</td><td>{entry.descricao || ""}</td><td>{entry.responsavel_cod ?? ""}</td><td>{expenseType(entry.codigo_despesa, entry.tipo_despesa)}</td><td>{money(entry.valor)}</td>
          </tr>)}</tbody>
        </table></div>
        {!shown.lancamentos.length && <p>Nenhum vale disponível para fechamento neste período.</p>}
      </section>;
      })()}
    </div>
  );
}
