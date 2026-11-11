import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { formatDocument } from "./field-formats";
import QuickDateInput from "./QuickDateInput";
import SearchableSelect from "./SearchableSelect";
import SortableTable from "./SortableTable";

type TicketRow = {
  id: number;
  cod: number;
  created_at: string;
  finalized_at: string | null;
  unit: number | null;
  branch: string | null;
  manifest: string | null;
  responsible: string;
  type: string | null;
  sender: string;
  sender_name: string | null;
  recipient: string;
  recipient_name: string | null;
  freight_payer: string;
  freight_payer_name: string | null;
  dt_manifest: string | null;
  cte: string | null;
  type_change: string | null;
  fatura: string | null;
  invoice: string | null;
  invoice_ticket: string | null;
  freight: string | null;
  dt_ctrc: string | null;
  ctrc: string | null;
  delivery_date: string | null;
  request_date: string | null;
  request_days: number | null;
  return_date: string | null;
  sending_request: string | null;
  resend_days: number | null;
  returnSendingRequest: string | null;
  observation: string | null;
  observation2: string | null;
  observation3: string | null;
  status_ticket: string | null;
};

type TicketDetail = TicketRow & {
  conf_cod: number | null;
  finalized_by: number | null;
  dt_manifest: string | null;
  recipient: string;
  recipient_name: string | null;
  freight_payer: string;
  freight_payer_name: string | null;
  dt_ctrc: string | null;
  ctrc: string | null;
  freight: string | null;
  delivery_date: string | null;
  request_date: string | null;
  return_date: string | null;
  sending_request: string | null;
  returnSendingRequest: string | null;
  observation: string | null;
  observation2: string | null;
  observation3: string | null;
  invoices: {
    invoice: number;
    ticket: string | null;
    unit: number;
    type_change: string;
    cte: string | null;
    status_ticket: string | null;
    fatura: string | null;
  }[];
};

type Options = {
  units: { unit: number; branch: string }[];
  types: string[];
  statuses: string[];
};

const date = (value: string | null | undefined) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "";

export default function Tickets({ token, expired, openPendings }: { token: string; expired: () => void; openPendings: () => void }) {
  const [options, setOptions] = useState<Options>({ units: [], types: [], statuses: [] });
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("");
  const [type, setType] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [situation, setSituation] = useState("todos");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) expired();
    else setError((reason as Error).message);
  }

  const query = useMemo(() => new URLSearchParams({
    page: String(page),
    pageSize: "25",
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(unit ? { unit } : {}),
    ...(type ? { type } : {}),
    ...(invoiceStatus ? { invoiceStatus } : {}),
    ...(situation !== "todos" ? { situation } : {}),
    ...(start && end ? { start, end } : {}),
  }).toString(), [page, search, unit, type, invoiceStatus, situation, start, end]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ rows: TicketRow[]; total: number; totalPages: number }>(`/tickets?${query}`, token);
      setRows(result.rows);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (reason) {
      fail(reason);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    api<Options>("/tickets/options", token).then(setOptions).catch(fail);
  }, [token]);

  useEffect(() => { void load(); }, [page]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDetail(null);
    if (page !== 1) setPage(1);
    else await load();
  }

  async function openDetail(id: number) {
    setBusy(true);
    setError("");
    try {
      setDetail(await api<TicketDetail>(`/tickets/${id}`, token));
      window.setTimeout(() => document.getElementById("ticket-detail")?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (reason) {
      fail(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content tickets-page">
      {error && <p role="alert" className="alert">{error}</p>}
      <section className="panel ticket-filters">
        <div className="actions ticket-top-actions">
          <button type="button" className="secondary" onClick={openPendings}>Pendências de extração</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>Pesquisar
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, manifesto, CTRC, nota, ticket ou empresa" />
            </label>
            <label>Unidade
              <SearchableSelect aria-label="Unidade" value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="">Todas</option>
                {options.units.map((item) => <option key={item.unit} value={item.unit}>{item.branch} - {item.unit}</option>)}
              </SearchableSelect>
            </label>
            <label>Tipo
              <SearchableSelect aria-label="Tipo" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="">Todos</option>
                {options.types.map((item) => <option key={item} value={item}>{item}</option>)}
              </SearchableSelect>
            </label>
            <label>Status da nota
              <SearchableSelect aria-label="Status da nota" value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
                <option value="">Todos</option>
                {options.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </SearchableSelect>
            </label>
            <label>Situação
              <select value={situation} onChange={(event) => setSituation(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="abertos">Abertos</option>
                <option value="finalizados">Finalizados</option>
              </select>
            </label>
            <label>Início<QuickDateInput aria-label="Início" value={start} onChange={setStart} /></label>
            <label>Fim<QuickDateInput aria-label="Fim" value={end} onChange={setEnd} /></label>
          </div>
          <div className="actions"><button className="primary" disabled={busy}>{busy ? "Consultando…" : "Consultar tickets"}</button></div>
        </form>
      </section>

      <section className="panel ticket-results">
        <div className="ticket-results-heading"><h2>Tickets</h2><span>{total.toLocaleString("pt-BR")} registros</span></div>
        <div className="table-scroll">
          <SortableTable>
            <thead><tr>
              <th>Índice</th><th>Cód.</th><th>Status ticket</th><th>Unid.</th><th>Data manif.</th>
              <th>Manifesto</th><th>CT-e</th><th>Tipo</th><th>Fatura</th><th>Nota</th>
              <th>Ticket</th><th>Frete</th><th>Responsável</th><th>Remetente</th><th>Destinatário</th>
              <th>Pagador</th><th>Dt. CTRC Polo</th><th>Polo CTRC</th><th>Data da entrega</th>
              <th>Data solicitação tickets</th><th>Dias</th><th>Data retorno</th><th>Reenvio solicitação</th>
              <th>Dias para retorno</th><th>Retorno reenvio</th><th>Observações 1</th><th>Observações 2</th>
              <th>Observações 3</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {rows.map((row, index) => <tr key={`${row.id}-${row.invoice ?? "sem-nota"}-${index}`}>
                <td>{row.id}</td><td>{row.cod}</td><td>{row.status_ticket ?? ""}</td><td>{row.unit ?? ""}</td>
                <td>{date(row.dt_manifest)}</td><td>{row.manifest ?? ""}</td><td>{row.cte ?? ""}</td>
                <td>{row.type_change ?? row.type ?? ""}</td><td>{row.fatura ?? ""}</td><td>{row.invoice ?? ""}</td>
                <td>{row.invoice_ticket ?? ""}</td><td>{row.freight ?? ""}</td><td>{row.responsible ?? ""}</td>
                <td>{row.sender_name ?? formatDocument(row.sender)}</td><td>{row.recipient_name ?? formatDocument(row.recipient)}</td>
                <td>{row.freight_payer_name ?? formatDocument(row.freight_payer)}</td><td>{date(row.dt_ctrc)}</td>
                <td>{row.ctrc ?? ""}</td><td>{date(row.delivery_date)}</td><td>{date(row.request_date)}</td>
                <td>{row.request_days ?? ""}</td><td>{date(row.return_date)}</td><td>{date(row.sending_request)}</td>
                <td>{row.resend_days ?? ""}</td><td>{date(row.returnSendingRequest)}</td><td>{row.observation ?? ""}</td>
                <td>{row.observation2 ?? ""}</td><td>{row.observation3 ?? ""}</td>
                <td><button type="button" className="text-button" onClick={() => void openDetail(row.id)}>Ver detalhes</button></td>
              </tr>)}
            </tbody>
          </SortableTable>
        </div>
        {!rows.length && !busy && <p>Nenhum ticket encontrado.</p>}
        <div className="actions ticket-pagination">
          <button type="button" className="secondary" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button type="button" className="secondary" disabled={busy || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button>
        </div>
      </section>

      {detail && <section id="ticket-detail" className="panel ticket-detail">
        <div className="ticket-results-heading"><h2>Ticket interno #{detail.id}</h2><button type="button" className="secondary" onClick={() => setDetail(null)}>Fechar detalhes</button></div>
        <dl className="detail-grid">
          <div><dt>Unidade</dt><dd>{detail.branch ?? detail.unit ?? ""}</dd></div>
          <div><dt>Manifesto</dt><dd>{detail.manifest ?? ""}</dd></div>
          <div><dt>Tipo</dt><dd>{detail.type ?? ""}</dd></div>
          <div><dt>Responsável</dt><dd>{detail.responsible}</dd></div>
          <div><dt>Remetente</dt><dd>{detail.sender_name ?? ""} {formatDocument(detail.sender)}</dd></div>
          <div><dt>Destinatário</dt><dd>{detail.recipient_name ?? ""} {formatDocument(detail.recipient)}</dd></div>
          <div><dt>Pagador</dt><dd>{detail.freight_payer_name ?? ""} {formatDocument(detail.freight_payer)}</dd></div>
          <div><dt>CTRC</dt><dd>{detail.ctrc ?? ""}</dd></div>
          <div><dt>Frete</dt><dd>{detail.freight ?? ""}</dd></div>
          <div><dt>Data manifesto</dt><dd>{date(detail.dt_manifest)}</dd></div>
          <div><dt>Data entrega</dt><dd>{date(detail.delivery_date)}</dd></div>
          <div><dt>Data solicitação</dt><dd>{date(detail.request_date)}</dd></div>
        </dl>
        {[detail.observation, detail.observation2, detail.observation3].some(Boolean) && <div className="ticket-observations"><h3>Observações</h3>{[detail.observation, detail.observation2, detail.observation3].filter(Boolean).map((item, index) => <p key={index}>{item}</p>)}</div>}
        <h3>Notas vinculadas</h3>
        <div className="table-scroll"><table><thead><tr><th>Nota</th><th>Ticket</th><th>Tipo</th><th>CT-e</th><th>Status</th><th>Fatura</th></tr></thead><tbody>
          {detail.invoices.map((invoice) => <tr key={`${invoice.invoice}-${invoice.type_change}`}><td>{invoice.invoice}</td><td>{invoice.ticket ?? ""}</td><td>{invoice.type_change}</td><td>{invoice.cte ?? ""}</td><td>{invoice.status_ticket ?? ""}</td><td>{invoice.fatura ?? ""}</td></tr>)}
        </tbody></table></div>
      </section>}
    </div>
  );
}
