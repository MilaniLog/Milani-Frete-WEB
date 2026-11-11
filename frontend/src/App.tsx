import SortableTable from "./SortableTable";
import SearchableSelect from "./SearchableSelect";
import HelpTip from "./HelpTip";
import AdminDeletionApproval from "./AdminDeletionApproval";
import { formatCiot, formatCtrb, maskCiot } from "./field-formats";
import { comparableManifestNumber, formatManifestNumber } from "./manifest-number";
import { formatQuickTime, parseQuickDate } from "./quick-date-time";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type Session } from "./api";
import FreightEntries from "./FreightEntries";
import ReferenceData from "./ReferenceData";
import Closures from "./Closures";
import Invoices from "./Invoices";
import DeleteManifest from "./DeleteManifest";
import Registrations from "./Registrations";
import DriverSelect from "./DriverSelect";
import Navigation, { canAccessPage, type Page } from "./Navigation";
import Destinations from "./Destinations";
import Units from "./Units";
import FinancialReports from "./FinancialReports";
import AccumulatedFreightReport from "./AccumulatedFreightReport";
import Tickets from "./Tickets";
import TicketPendings from "./TicketPendings";
import ReprintClosures from "./ReprintClosures";
import ManifestClosureReport from "./ManifestClosureReport";
import ValeInvoices from "./ValeInvoices";
import ValeNavigation from "./ValeNavigation";
import CouponNavigation from "./CouponNavigation";
import ClosureNavigation from "./ClosureNavigation";
import { useManifestCalculation } from "./useManifestCalculation";
import { installSelectAllFields } from "./select-all-fields";
import Users from "./Users";
import { valeIdentifier } from "./vale-identifier";
import BackToTop from "./BackToTop";

type ManifestCreditRecord = {
  id: number;
  controle_id?: number | null;
  codigo_despesa: string;
  nome_despesa: string;
  tipo_despesa: string;
  valor: string;
  descricao?: string | null;
};

type Manifest = {
  id: number;
  manifestos: string;
  manifesto_adicional_1?: string | null;
  manifesto_adicional_2?: string | null;
  manifesto_adicional_3?: string | null;
  semana: string;
  placa: string;
  motorista: string;
  destino: string;
  frete_veiculo: string;
  frete_total: string;
  fechamento_id: number | null;
  num_fechamento: number | null;
  cancelado?: boolean;
  cancelado_em?: string | null;
  cancelado_por?: number | null;
  creditos?: ManifestCreditRecord[];
  [key: string]: unknown;
};
type Week = { codigo: string; data_inicio: string; data_fim: string };
type Destination = { id: number; nome: string };
type Expense = { id: number; codigo: string; nome: string; tipo: string; ativo: boolean };
type ManifestCredit = { id: number; expenseId: string; value: string; description: string };
const money = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");
const closed = (m: Manifest) => m.fechamento_id != null;
const canceled = (m: Manifest) => m.cancelado === true;
const manifestNumbers = (m: Partial<Manifest>) =>
  [
    m.manifestos,
    m.manifesto_adicional_1,
    m.manifesto_adicional_2,
    m.manifesto_adicional_3,
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
const manifestLabel = (m: Partial<Manifest>) => manifestNumbers(m).join(" / ");
const creditTypeLabel = (type: string) =>
  type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "credito"
    ? "Crédito"
    : type;
const manifestCreditNotice = (manifest: Manifest) =>
  (manifest.creditos ?? [])
    .map(
      (credit) =>
        `Vale ${valeIdentifier(credit)} — ${creditTypeLabel(credit.tipo_despesa)} — ${credit.codigo_despesa} · ${credit.nome_despesa}`,
    )
    .join("; ");
type ManifestParts = { prefix: string; suffix: string };
const splitManifestParts = (value?: string | null): ManifestParts => {
  const text = String(value ?? "");
  return /^\d{3}/.test(text)
    ? { prefix: text.slice(0, 3), suffix: text.slice(3) }
    : { prefix: "", suffix: text };
};
const joinManifestParts = (parts: ManifestParts) => `${parts.prefix}${parts.suffix}`;


export default function App() {
  useEffect(() => installSelectAllFields(document), []);
  useEffect(() => {
    const confirmationPattern = /^Confirmar (exclusão|cancelamento|desativação)$/i;
    const revealConfirmation = (root: Node) => {
      if (!(root instanceof HTMLElement)) return;
      const buttons = [
        ...(root instanceof HTMLButtonElement ? [root] : []),
        ...Array.from(root.querySelectorAll<HTMLButtonElement>("button")),
      ];
      const confirmation = buttons.find((button) =>
        confirmationPattern.test(button.textContent?.trim() ?? ""),
      );
      if (!confirmation || confirmation.closest("dialog")) return;
      const target = confirmation.closest<HTMLElement>('[role="alert"]') ?? confirmation;
      requestAnimationFrame(() => {
        target.scrollIntoView?.({ behavior: "smooth", block: "center" });
      });
    };
    const observer = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) revealConfirmation(node);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  // Token stays in memory; reloading the page requires a new login.
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [openClosureConsultation, setOpenClosureConsultation] = useState(false);
  const [entryManifestId, setEntryManifestId] = useState<number | null>(null);
  if (!session)
    return (
      <Login
        notice={notice}
        onLogin={(s) => {
          setNotice("");
          setSession(s);
          setPage("home");
        }}
      />
    );
  const allowed = canAccessPage(session, page);
  const hasGlobalFreightAccess =
    session.user.isAdmin ||
    session.user.freightProfile === "FINANCEIRO" ||
    session.user.freightProfile === "RH";
  const pageTitle =
    page === "ticket-pendings"
      ? "Pendências de extração"
    : page === "tickets"
      ? "Tickets"
    : page === "destinations"
      ? "Destinos"
      : page === "users"
        ? "Usuários"
      : page === "reprint-closures"
        ? "Reimprimir fechamentos"
      : page === "financial-report"
        ? "Relatório de vales"
        : page === "vale-invoices"
          ? "Fechamentos de vales"
        : page === "manifest-closure-report"
          ? "Números de fechamento"
        : page === "coupons-report"
          ? "Relatório de cupons"
          : page === "payments-report"
            ? "Planilha de pagamentos"
          : page === "accumulated-freight-report"
            ? "Frete acumulado"
            : page === "home"
              ? "Home"
              : page === "manifests"
                ? "Manifestos"
                : page === "entries"
                  ? "Vales"
                  : page === "weeks"
                    ? "Semanas"
                  : page === "units"
                    ? "Unidades"
                    : page === "closures"
                      ? "Fechamentos"
                      : page === "invoices"
                        ? "Notas e cupons"
                        : page === "payers"
                          ? "Empresas"
                          : page === "drivers"
                            ? "Motoristas"
                            : page === "vehicles"
                              ? "Veículos"
                              : "Despesas";
  return (
    <div className="shell">
      <AdminDeletionApproval />
      <Navigation
        session={session}
        page={page}
        navigate={(next) => {
          setEntryManifestId(null);
          setOpenClosureConsultation(false);
          setPage(next);
        }}
        logout={() => setSession(null)}
        title={pageTitle}
      />
      <main>
        {allowed && ["entries", "financial-report", "vale-invoices"].includes(page) && (
          <ValeNavigation
            page={page}
            navigate={(next) => {
              setEntryManifestId(null);
              setPage(next);
            }}
          />
        )}
        {allowed && ["invoices", "coupons-report"].includes(page) && (
          <CouponNavigation page={page} navigate={setPage} />
        )}
        {allowed && page === "reprint-closures" && (
          <ClosureNavigation
            page={page}
            navigate={(next) => {
              setOpenClosureConsultation(false);
              setPage(next);
            }}
            openConsultation={() => {
              setOpenClosureConsultation(true);
              setPage("closures");
            }}
          />
        )}
        {allowed ? (
          page === "home" ? (
            <section className="content home-content">
              <p className="eyebrow">MILANI LOGÍSTICA & TRANSPORTE</p>
              <h1>Sua carga, nosso compromisso.</h1>
              <p>Bem-vindo(a), {session.user.name}.</p>
              <p className="muted">
                Use o botão Menu para acessar os cadastros, manifestos e
                fechamentos.
              </p>
            </section>
          ) : page === "destinations" ? (
            <Destinations
              token={session.accessToken}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "financial-report" || page === "coupons-report" || page === "payments-report" ? (
            <FinancialReports
              key={page}
              kind={page === "financial-report" ? "financial" : page === "coupons-report" ? "coupons" : "payments"}
              token={session.accessToken}
              isAdmin={hasGlobalFreightAccess}
              userUnit={session.user.unit}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "accumulated-freight-report" ? (
            <AccumulatedFreightReport
              token={session.accessToken}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "tickets" ? (
            <Tickets
              token={session.accessToken}
              openPendings={() => setPage("ticket-pendings")}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "ticket-pendings" ? (
            <TicketPendings
              token={session.accessToken}
              back={() => setPage("tickets")}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "vale-invoices" ? (
            <ValeInvoices
              token={session.accessToken}
              globalAccess={hasGlobalFreightAccess}
              userUnit={session.user.unit}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "manifest-closure-report" ? (
            <ManifestClosureReport
              token={session.accessToken}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "reprint-closures" ? (
            <div className="content">
              <ReprintClosures
                token={session.accessToken}
                isAdmin={hasGlobalFreightAccess}
                userUnit={session.user.unit}
                expired={() => {
                  setSession(null);
                  setNotice("Sua sessão expirou. Entre novamente.");
                }}
              />
            </div>
          ) : page === "entries" ? (
            <FreightEntries
              token={session.accessToken}
              unit={session.user.unit}
              initialManifestId={entryManifestId}
              close={() => setPage("home")}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "units" ? (
            <Units token={session.accessToken} expired={() => {
              setSession(null);
              setNotice("Sua sessão expirou. Entre novamente.");
            }} />
          ) : page === "users" ? (
            <Users token={session.accessToken} expired={() => {
              setSession(null);
              setNotice("Sua sessão expirou. Entre novamente.");
            }} />
          ) : page === "payers" || page === "drivers" || page === "vehicles" ? (
            <Registrations
              key={page}
              kind={page === "payers" ? "companies" : page}
              token={session.accessToken}
              isAdmin={session.user.isAdmin}
              userUnit={session.user.unit}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "invoices" ? (
            <Invoices
              close={() => setPage("home")}
              token={session.accessToken}
              isAdmin={session.user.isAdmin}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page === "closures" ? (
            <Closures
              token={session.accessToken}
              isAdmin={hasGlobalFreightAccess}
              userUnit={session.user.unit}
              initialConsulting={openClosureConsultation}
              openReprint={() => setPage("reprint-closures")}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : page !== "manifests" ? (
            <ReferenceData
              key={page}
              kind={page}
              token={session.accessToken}
              isAdmin={session.user.isAdmin}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          ) : (
            <Manifests
              key={session.accessToken}
              session={session}
              openEntries={(id) => {
                setEntryManifestId(id);
                setPage("entries");
              }}
              expired={() => {
                setSession(null);
                setNotice("Sua sessão expirou. Entre novamente.");
              }}
            />
          )
        ) : (
          <section className="empty">
            <h1>Acesso não disponível</h1>
            <p>
              Seu usuário não tem permissão para esta seção nesta unidade.
              Solicite acesso ao administrador.
            </p>
          </section>
        )}
      </main>
      <BackToTop />
    </div>
  );
}

function Login({
  onLogin,
  notice,
}: {
  onLogin: (s: Session) => void;
  notice: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api<Session>("/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify({
            cod: Number(fields.get("cod")),
            password: fields.get("password"),
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}brand/milani-logo.png`}
            alt="Milani — Logística & Transporte"
            width="200"
            height="70"
          />
        </div>
        <div>
          <p className="eyebrow">MILANI • LOGÍSTICA &amp; TRANSPORTE</p>
          <h1>
            Sua carga,
            <br />
            nosso compromisso.
          </h1>
          <p>Movendo o Brasil com agilidade, segurança e compromisso.</p>
        </div>
        <small>Milani • Gestão de fretes • GRU</small>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <p className="eyebrow">BEM-VINDO</p>
          <h1>Acesse sua conta</h1>
          <p className="muted">Use seu código e sua senha do sistema.</p>
          {notice && (
            <p role="status" className="alert">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <label>
            Código do usuário
            <input
              name="cod"
              type="number"
              min="1"
              step="1"
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar →"}
          </button>
          <p className="muted footnote">
            Problemas para entrar? Procure o administrador da sua unidade.
          </p>
        </form>
      </div>
    </div>
  );
}

function Manifests({
  session,
  expired,
  openEntries,
}: {
  session: Session;
  expired: () => void;
  openEntries: (id: number) => void;
}) {
  const [rows, setRows] = useState<Manifest[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [week, setWeek] = useState("recent");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<Manifest | null>(null);
  const [deletingManifest, setDeletingManifest] = useState<Manifest | null>(null);
  const [creating, setCreating] = useState(true);
  const [formVersion, setFormVersion] = useState(0);
  const [editing, setEditing] = useState<Manifest | null>(null);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);
  const token = session.accessToken;
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load(number = search) {
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    setRows([]);
    try {
      const query = number.trim()
        ? `?number=${encodeURIComponent(number.trim())}`
        : week === "recent"
          ? "?recent=true"
          : week
            ? `?week=${encodeURIComponent(week)}`
            : "";
      const data = await api<Manifest[]>(`/manifests${query}`, token);
      if (request === sequence.current) setRows(data);
    } catch (e) {
      if (request === sequence.current) fail(e);
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!creating) void load();
    return () => {
      sequence.current++;
    };
  }, [week, creating]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Week[]>("/weeks", token),
      api<Destination[]>("/destinations", token),
    ])
      .then(([w, d]) => {
        if (active) {
          setWeeks(w);
          setDestinations(d);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = rows;
  async function detail(id: number) {
    setError("");
    try {
      setSelected(await api<Manifest>(`/manifests/${id}`, token));
    } catch (e) {
      fail(e);
    }
  }
  async function editManifest(id: number) {
    setError("");
    try {
      const manifest = await api<Manifest>(`/manifests/${id}`, token);
      if (closed(manifest)) {
        setSelected(manifest);
        return;
      }
      setEditing(manifest);
    } catch (e) {
      fail(e);
    }
  }
  return (
    <div className="content">
      <div className="page-heading">
        <button
          className="secondary"
          disabled={saving}
          onClick={() => setCreating(value => !value)}
        >
          {creating ? "Consultar manifestos" : "+ Novo manifesto"}
        </button>
      </div>
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div hidden={creating}>
      <div className="stats">
        <article>
          <span>Na consulta</span>
          <strong>{busy ? "—" : rows.length}</strong>
          <small>Até 50 registros mais recentes</small>
        </article>
      </div>
      <section className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(search); }}>
          <label>
            Número do manifesto
            <input
              placeholder="Pode informar sem a unidade"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Período da consulta
            <select value={week} onChange={(e) => setWeek(e.target.value)}>
              <option value="recent">Ontem e hoje (data de inclusão)</option>
              <option value="">Todas as semanas</option>
              {weeks.map((w) => (
                <option key={w.codigo} value={w.codigo}>
                  {w.codigo} · {date(w.data_inicio)} a {date(w.data_fim)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            type="submit"
            disabled={busy}
          >
            Pesquisar
          </button>
        </form>
        <div className="table-scroll">
          <SortableTable>
            <thead>
              <tr>
                <th>Manifesto / Data</th>
                <th>Veículo / Motorista</th>
                <th>Destino</th>
                <th>Frete do veículo</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Ação</span>
                </th>
                <th className="manifest-delete-column">
                  <span className="sr-only">Exclusão</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!busy &&
                filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{manifestLabel(m)}</b>
                      <small>{date(m.semana)}</small>
                    </td>
                    <td>
                      <b>{m.placa}</b>
                      <small>{m.motorista}</small>
                    </td>
                    <td>{m.destino}</td>
                    <td className="currency">{money(m.frete_veiculo)}</td>
                    <td>
                      <span className={`badge ${closed(m) || canceled(m) ? "closed" : ""}`}>
                        {canceled(m)
                          ? "Cancelado"
                          : closed(m)
                            ? m.num_fechamento != null
                              ? `Fechado · ${String(m.num_fechamento).padStart(8, "0")}`
                              : "Fechado"
                            : "Em aberto"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          closed(m) || canceled(m)
                            ? void detail(m.id)
                            : void editManifest(m.id)
                        }
                        aria-label={`${closed(m) || canceled(m) ? "Consultar" : "Editar"} manifesto ${manifestLabel(m)}`}
                      >
                        {closed(m) || canceled(m)
                          ? "Consultar manifesto"
                          : "Editar manifesto"}
                      </button>
                    </td>
                    <td className="manifest-delete-column">
                      <button
                        type="button"
                        className="manifest-trash-button"
                        disabled={closed(m) || canceled(m) || saving}
                        onClick={() => setDeletingManifest(m)}
                        aria-label={`Cancelar manifesto ${manifestLabel(m)}`}
                        title={canceled(m) ? "Manifesto cancelado" : closed(m) ? "Manifesto fechado não pode ser cancelado" : "Cancelar manifesto"}
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
        </div>
        {busy ? (
          <div className="empty" role="status">
            Carregando manifestos…
          </div>
        ) : !filtered.length ? (
          <div className="empty">
            <h2>
              {error ? "Consulta indisponível" : "Nenhum manifesto encontrado"}
            </h2>
            <p>
              {error
                ? "Tente atualizar a consulta."
                : "Ajuste os filtros ou cadastre um novo manifesto."}
            </p>
          </div>
        ) : null}
        <div className="table-footer">
          {filtered.length} registros exibidos · A consulta retorna até 50
          manifestos.
        </div>
      </section>
      </div>
      {selected && (
        <Modal
          title={`Consultar manifesto ${manifestLabel(selected)}`}
          close={() => setSelected(null)}
          locked={saving}
          className="manifest-edit-dialog"
        >
          <p className="manifest-readonly-status">
            <span className="badge closed">
              {canceled(selected)
                ? "Cancelado"
                : closed(selected)
                  ? selected.num_fechamento != null
                    ? `Fechado · ${String(selected.num_fechamento).padStart(8, "0")}`
                    : "Fechado"
                  : "Em aberto"}
            </span>
            <span>Consulta somente para visualização. Nenhuma informação pode ser alterada.</span>
          </p>
          <CreateManifest
            unit={session.user.unit}
            initial={selected}
            readOnly
            token={token}
            destinations={destinations}
            onExpired={expired}
            onBusy={setSaving}
            done={() => undefined}
          />
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => openEntries(selected.id)}
          >
            Abrir vales
          </button>
          {!closed(selected) && !canceled(selected) && (
            <DeleteManifest
              key={`delete-${selected.id}`}
              id={selected.id}
              number={manifestLabel(selected)}
              token={token}
              disabled={saving}
              onBusy={setSaving}
              expired={expired}
              done={(count) => {
                setSelected(null);
                setSuccess(
                  `Manifesto cancelado com ${count} vales vinculados também cancelados.`,
                );
                void load();
              }}
            />
          )}
        </Modal>
      )}
      {creating && <section className="panel manifest-create-panel" aria-label="Novo manifesto">
        <h2>Novo manifesto</h2>
        <CreateManifest
          key={formVersion}
          unit={session.user.unit}
          token={token}
          destinations={destinations}
          onExpired={expired}
          onBusy={setSaving}
          done={(m) => {
            setFormVersion(version => version + 1);
            const credits = manifestCreditNotice(m);
            setSuccess(`Manifesto ${manifestLabel(m)} cadastrado com sucesso.${credits ? ` ${credits}.` : ""}`);
          }}
        />
      </section>}
      {editing && (
        <Modal
          title={`Editar manifesto ${manifestLabel(editing)}`}
          close={() => setEditing(null)}
          locked={saving}
          className="manifest-edit-dialog"
        >
          <CreateManifest
            unit={session.user.unit}
            initial={editing}
            token={token}
            destinations={destinations}
            onExpired={expired}
            onBusy={setSaving}
            done={(m) => {
              setEditing(null);
              const credits = manifestCreditNotice(m);
              setSuccess(`Manifesto ${manifestLabel(m)} atualizado com sucesso.${credits ? ` ${credits}.` : ""}`);
              void load();
            }}
          />
        </Modal>
      )}
      {deletingManifest && (
        <Modal
          title={`Cancelar manifesto ${manifestLabel(deletingManifest)}`}
          close={() => setDeletingManifest(null)}
          locked={saving}
        >
          <DeleteManifest
            key={`table-delete-${deletingManifest.id}`}
            id={deletingManifest.id}
            number={manifestLabel(deletingManifest)}
            token={token}
            disabled={saving}
            onBusy={setSaving}
            expired={expired}
            autoCheck
            done={(count) => {
              setDeletingManifest(null);
              setSuccess(`Manifesto cancelado com ${count} vales vinculados também cancelados.`);
              void load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  close,
  children,
  locked = false,
  className,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  locked?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) close();
      }}
      aria-label={title}
      className={className}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="secondary"
          onClick={close}
          aria-label="Fechar"
          disabled={locked}
        >
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}

const amounts = [
  ["cod_777_00", "Frete 301"],
  ["cod_888_00", "Frete COL"],
  ["cod_999_00", "Frete 100"],
  ["nao_777", "Não entregue 301"],
  ["nao_888", "Não entregue COL"],
  ["nao_999", "Não entregue 100"],
  ["outros", "Outros"],
  ["diaria", "Diária"],
  ["tde", "TDE"],
  ["escada", "Escada"],
  ["paletizacao", "Paletização"],
  ["estadia", "Estadia"],
  ["descarga", "Descarga"],
  ["ctrb_total", "CTRB total"],
  ["ctrb_adiantamento", "Adiantamento CTRB"],
  ["sest_senat", "SEST/SENAT"],
  ["irrf", "IRRF"],
  ["prev_social", "Previdência social"],
  ["inss", "INSS"],
  ["vale_pedagio", "Vale-pedágio"],
];
function CreateManifest({
  token,
  destinations,
  done,
  onExpired,
  initial,
  readOnly = false,
  onBusy,
}: {
  unit: number;
  token: string;
  destinations: Destination[];
  done: (m: Manifest) => void;
  onExpired: () => void;
  initial?: Manifest;
  readOnly?: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstManifestFieldRef = useRef<HTMLInputElement>(null);
  const [vehicles, setVehicles] = useState<{ plate: string; driver_cpf?:string|null; driver_name?:string|null }[]>([]);
  const [suggestedDriver, setSuggestedDriver] = useState({cpf:'',name:initial?.motorista ?? ''});
  const [plate, setPlate] = useState(initial?.placa ?? "");
  const [vehicleTypeDisplay, setVehicleTypeDisplay] = useState("");
  const legacyManifest = !!initial && !/^\d{3}/.test(initial.manifestos);
  const [manifestPrefix, setManifestPrefix] = useState(initial && !legacyManifest ? initial.manifestos.slice(0,3) : "");
  const [manifestSuffix, setManifestSuffix] = useState(initial ? legacyManifest ? initial.manifestos : initial.manifestos.slice(3) : "");
  const [additionalManifests, setAdditionalManifests] = useState<ManifestParts[]>(
    [
      initial?.manifesto_adicional_1,
      initial?.manifesto_adicional_2,
      initial?.manifesto_adicional_3,
    ]
      .filter((value): value is string => !!value)
      .map(splitManifestParts),
  );
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [creditExpenses, setCreditExpenses] = useState<Expense[]>([]);
  const [credits, setCredits] = useState<ManifestCredit[]>(
    initial ? [] : [{ id: 1, expenseId: "", value: "", description: "" }],
  );
  const nextCreditId = useRef(initial ? 1 : 2);
  const initialDestinationId = initial
    ? destinations.find(
        (destination) =>
          destination.nome.trim().localeCompare(initial.destino.trim(), "pt-BR", {
            sensitivity: "base",
          }) === 0,
      )?.id
    : undefined;
  useEffect(() => {
    if (initial) return;
    requestAnimationFrame(() => {
      firstManifestFieldRef.current?.focus();
      firstManifestFieldRef.current?.select();
    });
  }, [initial, destinations]);
  useEffect(() => {
    let active = true;
    api<{ plate: string; driver_cpf?:string|null; driver_name?:string|null }[]>("/registrations/vehicles", token)
      .then((rows) => { if (active) setVehicles(rows); })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError((e as Error).message);
      })
      .finally(() => { if (active) setLoadingVehicles(false); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    let active = true;
    api<Expense[]>("/freight-expenses", token)
      .then((rows) => {
        if (!active) return;
        setCreditExpenses(rows.filter((row) =>
          row.ativo && row.tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "credito",
        ));
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError((e as Error).message);
      });
    return () => { active = false; };
  }, [token]);
  function moneyFields(keys: string[]) {
    return keys.map((key) => {
      const label = amounts.find(([name]) => name === key)![1];
      return (
        <label key={key}>
          {label}
          <input
            name={key}
            type="number"
            min="0"
            step="0.0001"
            defaultValue="0"
          />
        </label>
      );
    });
  }
  useEffect(() => {
    if (!initial || !formRef.current) return;
    for (const element of Array.from(formRef.current.elements)) {
      if (!(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ))
        continue;
      const key = element.name;
      if (!key || key === "cpf_motorista" || key === "placa") continue;
      if (key === "destino_id") {
        element.value = initialDestinationId == null
          ? ""
          : String(initialDestinationId);
      } else if (key === "semana") element.value = date(initial.semana);
      else if (key === "hora")
        element.value = String(initial.hora ?? "").slice(0, 5);
      else if (
        element instanceof HTMLInputElement &&
        element.type === "checkbox"
      )
        element.checked = Boolean(initial[key]);
      else if (initial[key] != null) element.value = String(initial[key]);
    }
  }, [initial, initialDestinationId]);
  const calculation = useManifestCalculation(formRef, token, onExpired, initial?.id);
  useEffect(() => {
    if (calculation.preview?.vehicle.type) {
      setVehicleTypeDisplay(calculation.preview.vehicle.type);
    }
  }, [calculation.preview?.vehicle.type]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const fields = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of fields) {
      if (String(value).trim() !== "") payload[key] = String(value).trim();
    }
    const enteredDate = parseQuickDate(String(payload.semana ?? ''));
    const enteredTime = formatQuickTime(String(payload.hora ?? ''));
    if (!enteredDate || !enteredTime) {
      setError('Informe uma data válida (DD/MM/AAAA) e um horário válido (HH:MM).');
      return;
    }
    payload.semana = enteredDate.iso;
    const ciot = formatCiot(String(payload.ciot ?? ''));
    if (ciot === null && (!initial || payload.ciot !== initial.ciot)) {
      setError('Informe os 12 dígitos do CIOT e, se disponíveis, os quatro dígitos finais.');
      return;
    }
    if (ciot !== null) payload.ciot = ciot;
    const ctrb = formatCtrb(String(payload.ctrb_numero ?? ""));
    if (ctrb && !/^\d{6}-\d$/.test(ctrb)) {
      setError("Informe o CTRB com seis dígitos, hífen e um dígito. Exemplo: 123456-7.");
      return;
    }
    payload.ctrb_numero = ctrb || null;
    payload.hora = enteredTime;
    const enteredCredits = credits.filter((credit) =>
      credit.expenseId || credit.value.trim() || credit.description.trim(),
    );
    if (enteredCredits.some((credit) => !credit.expenseId || Number(credit.value) <= 0)) {
      setError("Preencha o tipo/despesa e um valor maior que zero em todos os créditos.");
      return;
    }
    if (enteredCredits.length)
      payload.creditos = enteredCredits.map((credit) => ({
        despesa_id: Number(credit.expenseId),
        valor: Number(credit.value),
        descricao: credit.description.trim(),
      }));
    const formatted = formatManifestNumber(String(payload.manifestos ?? ''));
    if (formatted) payload.manifestos = formatted;
    else if (!initial || payload.manifestos !== initial.manifestos) {
      setError('Informe os três dígitos da unidade seguidos do número do manifesto. Exemplo: 8503182.');
      return;
    }
    for (const key of [
      "manifesto_adicional_1",
      "manifesto_adicional_2",
      "manifesto_adicional_3",
    ]) {
      if (!(key in payload)) continue;
      const formattedAdditional = formatManifestNumber(String(payload[key] ?? ""));
      if (!formattedAdditional) {
        setError("Informe os manifestos adicionais com os tres digitos da unidade seguidos do numero.");
        return;
      }
      payload[key] = formattedAdditional;
    }
    for (const key of [
      "destino_id",
      "m3",
      "kg",
      "qtd_nf",
      "frete_veiculo",
      ...amounts.map(([key]) => key),
    ])
      if (key in payload) payload[key] = Number(payload[key]);
    // The field was removed from the UI; keep existing historic data on edits.
    if (initial?.romaneio != null) payload.romaneio = initial.romaneio;
    payload.placa = String(payload.placa).toUpperCase();
    if (!payload.cpf_motorista) {
      setError("Selecione o motorista pelo nome.");
      return;
    }
    if (
      !["cod_777_00", "cod_888_00", "cod_999_00"].some(
        (key) => Number(payload[key]) > 0,
      )
    ) {
      setError("Informe ao menos um frete bruto maior que zero.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      done(
        await api<Manifest>(
          initial ? `/manifests/${initial.id}` : "/manifests",
          token,
          {
            method: initial ? "PUT" : "POST",
            body: JSON.stringify(payload),
          },
        ),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form ref={formRef} onSubmit={submit} onChange={calculation.changed} className="legacy-form manifest-compact">
      {initial && !readOnly && (
        <p className="alert">
          Confira o motorista selecionado e o destino antes de salvar.
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy || readOnly}>
        <fieldset className="legacy-group">
          <legend>A receber</legend>
          <div className="form-grid legacy-manifest-header">
            <div className="manifest-number-field" role="group" aria-label="Manifesto">
              <span>Manifesto</span>
              <div className="manifest-number-parts">
                <input aria-label="Primeiros três dígitos do manifesto" inputMode="numeric"
                  maxLength={3} pattern="[0-9]{3}" required={!legacyManifest || !!manifestPrefix}
                  placeholder="000" value={manifestPrefix}
                  onChange={e => setManifestPrefix(e.target.value.replace(/\D/g, '').slice(0,3))} />
                <input aria-label="Número do manifesto" inputMode="numeric" maxLength={8} required
                  placeholder="000000-0" value={manifestSuffix}
                  onChange={e => setManifestSuffix(e.target.value)}
                  onBlur={() => {
                    const formatted = formatManifestNumber(`${manifestPrefix || '000'}${manifestSuffix}`);
                    if (formatted) setManifestSuffix(formatted.slice(3));
                  }} />
              </div>
              <input type="hidden" name="manifestos" value={`${manifestPrefix}${manifestSuffix}`} />
              <button
                type="button"
                className="manifest-add-button"
                aria-label="Adicionar manifesto adicional"
                disabled={additionalManifests.length >= 3}
                onClick={() =>
                  setAdditionalManifests((values) =>
                    values.length >= 3 ? values : [...values, { prefix: "", suffix: "" }],
                  )
                }
              >
                +
              </button>
            </div>
            {additionalManifests.map((value, index) => {
              const updateAdditional = (parts: Partial<ManifestParts>) => {
                setAdditionalManifests((values) =>
                  values.map((current, currentIndex) =>
                    currentIndex === index ? { ...current, ...parts } : current,
                  ),
                );
              };
              return (
              <div
                className="manifest-number-field manifest-number-extra"
                role="group"
                aria-label={`Manifesto adicional ${index + 1}`}
                key={index}
              >
                <span>{`Adicional ${index + 1}`}</span>
                <div className="manifest-number-parts">
                  <input
                    aria-label={`Unidade do manifesto adicional ${index + 1}`}
                    value={value.prefix}
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]{3}"
                    placeholder="000"
                    onChange={(e) => updateAdditional({ prefix: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  />
                  <input
                    aria-label={`Número do manifesto adicional ${index + 1}`}
                    value={value.suffix}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="000000-0"
                    onChange={(e) => updateAdditional({ suffix: e.target.value })}
                    onBlur={() => {
                      const formatted = formatManifestNumber(joinManifestParts(value));
                      if (!formatted) return;
                      updateAdditional(splitManifestParts(formatted));
                    }}
                  />
                  <input type="hidden" name={`manifesto_adicional_${index + 1}`} value={joinManifestParts(value)} />
                  <button
                    type="button"
                    className="manifest-remove-button"
                    aria-label={`Remover manifesto adicional ${index + 1}`}
                    onClick={() =>
                      setAdditionalManifests((values) =>
                        values.filter((_, current) => current !== index),
                      )
                    }
                  >
                    -
                  </button>
                </div>
              </div>
            );})}
            <div className="manifest-date-time-row">
              <label>
                {"Hor\u00e1rio"}
                <input
                  aria-label="Hora"
                  name="hora"
                  type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM"
                  onChange={e => e.target.setCustomValidity('')}
                  onBlur={e => {
                    const value = formatQuickTime(e.target.value);
                    if (value) e.target.value = value;
                    e.target.setCustomValidity(value || !e.target.value ? '' : 'Informe um hor\u00e1rio v\u00e1lido, como 1212 ou 12:12.');
                  }}
                  required
                />
              </label>
              <label>
                Data
                <input
                  aria-label="Data do carregamento"
                  name="semana"
                  type="text" inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA"
                  onChange={e => e.target.setCustomValidity('')}
                  onBlur={e => {
                    const value = parseQuickDate(e.target.value);
                    if (value) e.target.value = value.display;
                    e.target.setCustomValidity(value || !e.target.value ? '' : 'Informe uma data válida, como 121226 ou 12/12/2026.');
                  }}
                  required
                />
              </label>
            </div>
          </div>
          <div className="legacy-identity">
            <div className="manifest-plate">
            <label>
              Placa
              <SearchableSelect
                aria-label="Placa"
                name="placa"
                required
                value={plate}
                onChange={(e) => {
                  const plate = e.target.value;
                  setPlate(plate);
                  if (!plate) setVehicleTypeDisplay("");
                  const vehicle = vehicles.find(v=>v.plate===plate);
                  setSuggestedDriver({cpf:vehicle?.driver_cpf ?? '',name:vehicle?.driver_name ?? ''});
                }}
              >
                <option value="" disabled>{loadingVehicles ? "Carregando placas…" : "Selecione a placa"}</option>
                {initial?.placa && !vehicles.some((v) => v.plate === initial.placa) && (
                  <option value={initial.placa}>{initial.placa}</option>
                )}
                {vehicles.map((v) => <option key={v.plate} value={v.plate}>{v.plate}</option>)}
              </SearchableSelect>
            </label>
            {vehicleTypeDisplay && <span className="manifest-vehicle-type">{vehicleTypeDisplay}</span>}
            </div>
            <DriverSelect
              resetKey={plate}
              token={token}
              searchable={false}
              initialName={suggestedDriver.name}
              initialCpf={suggestedDriver.cpf}
              expired={onExpired}
            />
            <label>
              Destino
              <SearchableSelect
                key={`destination-${initial?.id ?? "new"}-${initialDestinationId ?? "none"}`}
                aria-label="Destino"
                name="destino_id"
                required
                defaultValue={initialDestinationId == null ? "" : String(initialDestinationId)}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </div>
          <div className="form-grid">
            {[
              ["m3", "Cubagem (m³)", "Volume (m³)"],
              ["kg", "Peso (kg)", "Peso (kg)"],
              ["qtd_nf", "QNT NF", "Quantidade de notas"],
            ].map(([key, label, accessible]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={accessible}
                  name={key}
                  type="number"
                  min="0"
                  step={key === "qtd_nf" ? "1" : "0.001"}
                  defaultValue="0"
                  required
                />
              </label>
            ))}
          </div>
          <div className="form-grid">
            {moneyFields(["cod_777_00", "cod_888_00", "cod_999_00"])}
          </div>
          {calculation.preview && !initial && <>
            {calculation.values.m3 > calculation.preview.vehicle.max_m3 && <p className="alert" role="status">A cubagem permitida para {calculation.preview.vehicle.type} é {calculation.preview.vehicle.max_m3} m³.</p>}
            {calculation.values.kg > calculation.preview.vehicle.max_weight && <p className="alert" role="status">O peso permitido para {calculation.preview.vehicle.type} é {calculation.preview.vehicle.max_weight} kg.</p>}
          </>}
        </fieldset>
        <div className="manifest-side-blocks">
        <fieldset className="legacy-group">
          <legend>CTRB <HelpTip label="CTRB">Valor líquido = total CTRB − adiantamento − retenções. Vale-pedágio não altera o líquido do CTRB.</HelpTip></legend>
          <div className="form-grid">
            <label>
              CIOT
              <input name="ciot" maxLength={17} placeholder="000000000000/0000"
                onChange={e => { e.target.value = maskCiot(e.target.value); e.target.setCustomValidity(''); }}
                onBlur={e => {
                  const formatted = formatCiot(e.target.value);
                  if (formatted !== null) e.target.value = formatted;
                  e.target.setCustomValidity(formatted !== null || e.target.value === initial?.ciot ? '' : 'Informe os 12 dígitos do CIOT e até quatro dígitos finais.');
                }} />
            </label>
            <label>
              CTRB
              <input
                aria-label="Número CTRB"
                name="ctrb_numero"
                maxLength={8}
                placeholder="000000-0"
                inputMode="numeric"
                pattern="[0-9]{6}-[0-9]"
                onChange={e => { e.target.value = formatCtrb(e.target.value); }}
              />
            </label>
            {moneyFields([
              "ctrb_total",
              "ctrb_adiantamento",
              "sest_senat",
              "irrf",
              "prev_social",
              "inss",
              "vale_pedagio",
            ])}
            <label>Total de retenções<input readOnly value={money(calculation.values.retentions)} /></label>
            <label>Valor líquido<input readOnly value={money(calculation.values.net)} /></label>
          </div>
        </fieldset>
        <fieldset className="legacy-group">
          <legend>Não entregue</legend>
          <div className="form-grid">
            {moneyFields(["nao_777", "nao_888", "nao_999"])}
          </div>
        </fieldset>
        </div>
        <div className="manifest-side-blocks">
        <div className="manifest-payable-layout">
        <fieldset className="legacy-group manifest-payable-group">
          <legend>A pagar <HelpTip label="A pagar">Os pagamentos vinculados podem ser incluídos na tela Vales, acessível pelo Menu após salvar o manifesto.</HelpTip></legend>
          <div className="form-grid">
            <label>
              Origem
              <input
                name="origem"
                defaultValue={String(initial?.origem ?? "")}
                maxLength={10}
                placeholder="Automatica pela unidade"
              />
            </label>
            <label>
              Frete do veículo
              <input name="frete_veiculo" type="number" min="0" step="0.0001" placeholder="Informe o frete" required />
            </label>
          </div>
        </fieldset>
        {!initial && <button type="button" className="secondary manifest-credit-add" disabled={!creditExpenses.length}
          onClick={() => setCredits((rows) => [...rows, { id: nextCreditId.current++, expenseId: "", value: "", description: "" }])}>
          + Adicionar créditos
        </button>}
        </div>
        {initial && !!initial.creditos?.length && (
          <section className="manifest-existing-credits" aria-label="Créditos vinculados ao manifesto">
            <h3>Créditos do manifesto</h3>
            {initial.creditos.map((credit) => (
              <div className="manifest-credit-row" key={credit.id}>
                <strong>Vale {valeIdentifier(credit)} — {creditTypeLabel(credit.tipo_despesa)}</strong>
                <span>{credit.codigo_despesa} · {credit.nome_despesa}</span>
                <span>{money(credit.valor)}</span>
                <span>{credit.descricao || ""}</span>
              </div>
            ))}
          </section>
        )}
        {credits.map((credit, index) => (
          <div className="manifest-credit-row" key={credit.id}>
            <label>Tipo / Despesa
              <select aria-label={`Despesa do crédito ${index + 1}`} required={!!(credit.expenseId || credit.value || credit.description)} value={credit.expenseId}
                onChange={(event) => setCredits((rows) => rows.map((row) => row.id === credit.id ? { ...row, expenseId: event.target.value } : row))}>
                <option value="" disabled>Selecione</option>
                {creditExpenses.map((expense) => <option key={expense.id} value={expense.id}>{expense.codigo} · {expense.nome}</option>)}
              </select>
            </label>
            <label>Valor
              <input aria-label={`Valor do crédito ${index + 1}`} type="number" min="0.01" max="9999999999999.99" step="0.01" required={!!(credit.expenseId || credit.value || credit.description)} value={credit.value}
                onChange={(event) => setCredits((rows) => rows.map((row) => row.id === credit.id ? { ...row, value: event.target.value } : row))} />
            </label>
            <label>Descrição
              <input aria-label={`Descrição do crédito ${index + 1}`} maxLength={255} value={credit.description}
                onChange={(event) => setCredits((rows) => rows.map((row) => row.id === credit.id ? { ...row, description: event.target.value } : row))} />
            </label>
            <button type="button" className="text-button" aria-label={`Remover crédito ${index + 1}`}
              onClick={() => setCredits((rows) => rows.filter((row) => row.id !== credit.id))}>Remover</button>
          </div>
        ))}
        <fieldset className="legacy-group">
          <legend>A receber do cliente</legend>
          <div className="form-grid">
            {moneyFields([
              "diaria",
              "tde",
              "escada",
              "paletizacao",
              "estadia",
              "descarga",
              "outros",
            ])}
          </div>
        </fieldset>
        </div>
        <fieldset className="legacy-group">
          <legend>Cálculos do manifesto <HelpTip label="Cálculos do manifesto">Selecione a placa para calcular o frete. Os cálculos são atualizados durante o preenchimento e conferidos ao salvar.</HelpTip></legend>
          {calculation.pending && <p role="status">Calculando…</p>}
          {calculation.error && <p role="alert" className="alert">Não foi possível calcular: {calculation.error}</p>}
          {calculation.preview && <div className="form-grid">
            {[
              ["Frete 301 calculado", calculation.preview.freightsCalculated.freight777],
              ["Frete COL calculado", calculation.preview.freightsCalculated.freight888],
              ["Frete 100 calculado", calculation.preview.freightsCalculated.freight999],
              ["Não entregue 301 calculado", calculation.preview.freightsCalculated.notDelivery777],
              ["Não entregue COL calculado", calculation.preview.freightsCalculated.notDelivery888],
              ["Não entregue 100 calculado", calculation.preview.freightsCalculated.notDelivery999],
              ["Total dos fretes calculados", calculation.preview.totalFretes],
              ["Total a receber", calculation.preview.totalReceive - calculation.preview.discounts],
              ["Vales a pagar", calculation.preview.despesas_empresa],
              ["Total do frete do veículo", calculation.preview.freightVehicle],
            ].map(([label, value]) => <label key={String(label)}>{label}<input readOnly value={money(value)} /></label>)}
            <label>Percentual inicial<input readOnly value={(calculation.preview.initPercent * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"} /></label>
            <label>Percentual final<input readOnly value={(calculation.preview.finalPercent * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"} /></label>
          </div>}
        </fieldset>
        <label>
          Observações
          <textarea name="observacao" maxLength={255} rows={3} />
        </label>
        {!readOnly && <button className="primary" disabled={!destinations.length || busy}>
          {busy
            ? "Salvando…"
            : initial
              ? "Salvar alterações"
              : "Cadastrar manifesto"}
        </button>}
        {!readOnly && !destinations.length && (
          <p role="status">
            É necessário um destino ativo cadastrado para salvar.
          </p>
        )}
      </fieldset>
    </form>
  );
}

