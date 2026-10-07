import SortableTable from "./SortableTable";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import ReprintClosures from "./ReprintClosures";
import ClosureForm, {
  emptyClosureFilters,
  type ClosureFilters,
} from "./ClosureForm";

type Totals = {
  total_bruto: string;
  total_liquido: string;
  total_ctrb: string;
  fretes?: string;
  creditos?: string;
  debitos?: string;
  cupons?: string;
};
type Payment = {
  criterio: string;
  ctrbs: string[];
  primeira: { empresa: string | null; valor: string };
  segunda: { empresa: string | null; valor: string };
};
type ManifestRow = { id: number; manifestos: string; frete_veiculo: string };
type EntryRow = {
  id: number;
  numero: number;
  nome_despesa: string;
  tipo_despesa: string;
  valor: string;
};
type CouponRow = { id: number; nota_id: number; valor: string };
type Preview = {
  semana: string;
  placa: string;
  motorista?: string | null;
  manifests: ManifestRow[];
  entries: EntryRow[];
  availableDebits?: EntryRow[];
  coupons: CouponRow[];
  totals: Totals;
  payment: Payment | null;
};
type Closure = {
  id: number;
  numero: number;
  semana: string | null;
  placa: string;
  status: string;
  total_bruto: string;
  total_liquido: string;
};
type Report = Pick<
  Preview,
  "manifests" | "entries" | "coupons" | "totals" | "payment"
> & {
  origem: string;
  cabecalho: Closure & { cancelamento?: { motivo: string; em: string } | null };
};
const money = (value: string | undefined) =>
  value == null
    ? "Não registrado"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

const debitRows = (data: Pick<Preview, "entries" | "availableDebits">) =>
  data.availableDebits ??
  data.entries.filter((entry) => entry.tipo_despesa === "Debito");
const decimal = (value: string | undefined) => Number(value ?? 0);
const moneyValue = (value: number) => value.toFixed(2);
const initialBatchSelections = (groups: Preview[]) =>
  Object.fromEntries(
    groups.map((group) => [
      group.placa,
      debitRows(group).map((entry) => entry.id),
    ]),
  );

const batchStorageKey = (week: string) =>
  `frete:conference-adjustments:${week}`;
const loadBatchSelections = (week: string, groups: Preview[]) => {
  const fallback = initialBatchSelections(groups);
  if (!week) return fallback;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(batchStorageKey(week)) || "{}",
    );
    if (!parsed || typeof parsed !== "object") return fallback;
    return Object.fromEntries(
      groups.map((group) => {
        const available = new Set(debitRows(group).map((entry) => entry.id));
        const saved = Array.isArray(parsed[group.placa])
          ? parsed[group.placa].filter(
              (id: unknown) => typeof id === "number" && available.has(id),
            )
          : fallback[group.placa];
        return [group.placa, saved];
      }),
    );
  } catch {
    return fallback;
  }
};

const withSelectedDebits = (data: Preview, selectedIds: number[]): Preview => {
  const selected = new Set(selectedIds);
  const debits = debitRows(data);
  const selectedTotal = debits
    .filter((entry) => selected.has(entry.id))
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const originalDebits = decimal(data.totals.debitos);
  const originalNet = decimal(data.totals.total_liquido);
  const ctrb = decimal(data.totals.total_ctrb);
  return {
    ...data,
    entries: data.entries.filter(
      (entry) => entry.tipo_despesa !== "Debito" || selected.has(entry.id),
    ),
    totals: {
      ...data.totals,
      debitos: moneyValue(selectedTotal),
      total_liquido: moneyValue(
        originalNet + originalDebits - selectedTotal - ctrb,
      ),
    },
  };
};

export default function Closures({
  token,
  isAdmin,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
}) {
  const [rows, setRows] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [week, setWeek] = useState("");
  const [plate, setPlate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedDebitIds, setSelectedDebitIds] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const conferenceRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [cancel, setCancel] = useState(false);
  const [filters, setFilters] = useState<ClosureFilters>(emptyClosureFilters);
  const [conferenceGroups, setConferenceGroups] = useState<Preview[] | null>(
    null,
  );
  const [conferenceQuery, setConferenceQuery] = useState("");
  const [batchWeek, setBatchWeek] = useState("");
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchDebitSelections, setBatchDebitSelections] = useState<
    Record<string, number[]>
  >({});
  function invalidate() {
    setPreview(null);
    setSelectedDebitIds([]);
    setConfirm(false);
    setConferenceGroups(null);
    setConferenceQuery("");
    setBatchWeek("");
    setBatchIndex(0);
    setBatchDebitSelections({});
  }
  function query() {
    const p = new URLSearchParams();
    if (week) p.set("semana", week);
    if (plate.trim()) p.set("placa", plate.trim().toUpperCase());
    for (const [k, v] of Object.entries(filters)) {
      if (v !== "" && v !== false) p.set(k, String(v));
    }
    return p.toString();
  }
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load() {
    setLoading(true);
    try {
      setRows(await api<Closure[]>("/freight-closures", token));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    if (!conferenceGroups) return;
    window.setTimeout(
      () => conferenceRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
      0,
    );
  }, [conferenceGroups]);
  useEffect(() => {
    if (!preview) return;
    window.setTimeout(
      () => previewRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
      0,
    );
  }, [preview]);
  async function conference(event: FormEvent) {
    event.preventDefault();
    const advanced =
      !week ||
      !plate ||
      Object.entries(filters).some(([k, v]) =>
        k === "categoria" ? v !== "Todos" : v !== "" && v !== false,
      );
    if (advanced) {
      setBusy(true);
      setError("");
      invalidate();
      try {
        const q = query();
        const data = await api<{ groups: Preview[] }>(
          `/freight-closures/conference?${q}`,
          token,
        );
        setConferenceGroups(data.groups);
        setConferenceQuery(q);
        setBatchIndex(0);
        setBatchDebitSelections(loadBatchSelections(week, data.groups));
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setPreview(null);
    setConfirm(false);
    setError("");
    setSuccess("");
    try {
      const data = await api<Preview>(
        `/freight-closures/preview?semana=${encodeURIComponent(week)}&placa=${encodeURIComponent(plate.trim().toUpperCase())}`,
        token,
      );
      setPreview(data);
      setSelectedDebitIds(debitRows(data).map((entry) => entry.id));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function prepareFinalization() {
    if (!week || filters.inicio || filters.fim) {
      setError(
        "Para fechar semana, informe a semana, sem período de pesquisa.",
      );
      return;
    }
    invalidate();
    setBusy(true);
    setError("");
    setSuccess("");
    if (!plate.trim()) {
      try {
        const q = new URLSearchParams({ semana: week }).toString();
        const data = await api<{ groups: Preview[] }>(
          `/freight-closures/conference?${q}`,
          token,
        );
        setConferenceGroups(data.groups);
        setConferenceQuery(q);
        setBatchWeek(week);
        setBatchIndex(0);
        setBatchDebitSelections(loadBatchSelections(week, data.groups));
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const data = await api<Preview>(
        `/freight-closures/preview?semana=${encodeURIComponent(week)}&placa=${encodeURIComponent(plate.trim().toUpperCase())}`,
        token,
      );
      setPreview(data);
      setSelectedDebitIds(debitRows(data).map((entry) => entry.id));
      setConfirm(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function selectClosure() {
    if (!filters.numero) return;
    setBusy(true);
    setError("");
    setReport(null);
    setCancel(false);
    try {
      setReport(
        await api<Report>(
          `/freight-closures/number/${filters.numero}/report`,
          token,
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function excludePayment() {
    if (!isAdmin) return;
    if (!filters.numero) {
      setError("Informe o número do fechamento para excluir o pagamento.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const found = await api<Report>(
        `/freight-closures/number/${filters.numero}/report`,
        token,
      );
      setReport(found);
      if (found.cabecalho.status !== "FECHADO")
        throw new Error("Somente pagamento fechado pode ser excluído.");
      setCancel(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function finalize() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ closure: Closure }>(
        "/freight-closures",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            semana: preview.semana,
            placa: preview.placa,
            debit_entry_ids: selectedDebitIds,
          }),
        },
      );
      setPreview(null);
      setConfirm(false);
      setReport(null);
      setSuccess(
        `Fechamento ${result.closure.numero} finalizado. Líquido: ${money(result.closure.total_liquido)}.`,
      );
      await load();
    } catch (e) {
      fail(e);
      setPreview(null);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function finalizeWeek() {
    if (!batchWeek || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const selections = batchSelectionsPayload();
      if (week)
        localStorage.setItem(
          batchStorageKey(week),
          JSON.stringify(batchDebitSelections),
        );
      const result = await api<{ results: unknown[] }>(
        "/freight-closures/week",
        token,
        {
          method: "POST",
          body: JSON.stringify({ semana: batchWeek, selections }),
        },
      );
      invalidate();
      setReport(null);
      setSuccess(`${result.results.length} fechamentos finalizados.`);
      await load();
    } catch (e) {
      fail(e);
      invalidate();
    } finally {
      setBusy(false);
    }
  }
  async function detail(id: number) {
    setBusy(true);
    setError("");
    setReport(null);
    setCancel(false);
    try {
      setReport(await api<Report>(`/freight-closures/${id}/report`, token));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancelClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report || busy) return;
    const motivo = String(
      new FormData(event.currentTarget).get("motivo") || "",
    ).trim();
    if (!motivo) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const id = report.cabecalho.id;
      await api(`/freight-closures/${id}/cancel`, token, {
        method: "POST",
        body: JSON.stringify({ motivo }),
      });
      setReport(null);
      setCancel(false);
      setPreview(null);
      setConfirm(false);
      setSuccess(
        "Fechamento cancelado. Registros reabertos e histórico preservado.",
      );
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function batchSelectionsPayload() {
    if (conferenceGroups?.length)
      return conferenceGroups.map((group) => ({
        placa: group.placa,
        debit_entry_ids: batchDebitSelections[group.placa] ?? [],
      }));
    if (preview?.placa)
      return [
        {
          placa: preview.placa,
          debit_entry_ids: selectedDebitIds,
        },
      ];
    return [];
  }
  function activeConferenceWeek() {
    return week || batchWeek || conferenceGroups?.[0]?.semana || "";
  }
  function saveBatchAdjustments() {
    const selectedWeek = activeConferenceWeek();
    if (!selectedWeek) return;
    localStorage.setItem(
      batchStorageKey(selectedWeek),
      JSON.stringify(batchDebitSelections),
    );
    setSuccess(`Alterações da semana ${selectedWeek} salvas neste computador.`);
  }
  async function downloadAdjustedConference() {
    const selectedWeek = activeConferenceWeek();
    if (!selectedWeek) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/freight-closures/conference/adjusted-print.pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            semana: selectedWeek,
            selections: batchSelectionsPayload(),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          response.status === 401 && token
            ? "Sua sessão expirou. Entre novamente."
            : Array.isArray(data?.message)
              ? data.message.join(" • ")
              : data?.message ||
                `Não foi possível concluir a solicitação (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "conferencia-ajustada.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string, name: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          response.status === 401 && token
            ? "Sua sessão expirou. Entre novamente."
            : Array.isArray(data?.message)
              ? data.message.join(" • ")
              : data?.message ||
                `Não foi possível concluir a solicitação (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const previewDisplay = preview
    ? withSelectedDebits(preview, selectedDebitIds)
    : null;
  return (
    <div className="content">
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
      <section className="panel reference-form">
        <h2>Conferir semana e veículo</h2>
        <ClosureForm
          token={token}
          busy={busy}
          isAdmin={isAdmin}
          week={week}
          plate={plate}
          filters={filters}
          setWeek={(v) => {
            setWeek(v);
            invalidate();
          }}
          setPlate={(v) => {
            setPlate(v);
            invalidate();
          }}
          setFilters={(v) => {
            setFilters(v);
            invalidate();
            setReport(null);
            setCancel(false);
          }}
          conference={conference}
          finalize={() => void prepareFinalization()}
          selectClosure={() => void selectClosure()}
          cancel={() => void excludePayment()}
          expired={expired}
        />
        {conferenceGroups && (
          <section ref={conferenceRef} className="conference-results">
            <h3>Conferência por placa</h3>
            {!conferenceGroups.length && <p>Nenhum registro encontrado.</p>}
            {conferenceGroups.length > 0 &&
              (() => {
                const current =
                  conferenceGroups[
                    Math.min(batchIndex, conferenceGroups.length - 1)
                  ];
                const selectedIds = batchDebitSelections[current.placa] ?? [];
                const currentDisplay = withSelectedDebits(current, selectedIds);
                return (
                  <section className="panel batch-conference-panel">
                    <div className="filters batch-conference-heading">
                      <h3>
                        {batchIndex + 1} de {conferenceGroups.length} ·{" "}
                        {current.placa}
                        {current.motorista ? ` · ${current.motorista}` : ""}
                      </h3>
                      <span className="badge">
                        Seleções salvas nesta conferência
                      </span>
                    </div>
                    <Values
                      data={currentDisplay}
                      selectableDebits={debitRows(current)}
                      selectedDebitIds={selectedIds}
                      setSelectedDebitIds={(ids) =>
                        setBatchDebitSelections((previous) => ({
                          ...previous,
                          [current.placa]: ids,
                        }))
                      }
                      busy={busy}
                    />
                    <div className="actions batch-conference-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || batchIndex === 0}
                        onClick={() =>
                          setBatchIndex((value) => Math.max(0, value - 1))
                        }
                      >
                        Anterior
                      </button>
                      {batchIndex < conferenceGroups.length - 1 ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            setBatchIndex((value) =>
                              Math.min(conferenceGroups.length - 1, value + 1),
                            )
                          }
                        >
                          Próximo
                        </button>
                      ) : batchWeek ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => void finalizeWeek()}
                        >
                          Confirmar finalização da semana
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="primary"
                        disabled={busy || !activeConferenceWeek()}
                        onClick={saveBatchAdjustments}
                      >
                        Salvar alterações
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || !activeConferenceWeek()}
                        onClick={() => void downloadAdjustedConference()}
                      >
                        Baixar conferência ajustada
                      </button>
                      {batchWeek && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => setBatchWeek("")}
                        >
                          Revisar sem finalizar
                        </button>
                      )}
                    </div>
                  </section>
                );
              })()}
          </section>
        )}
        {preview && previewDisplay && (
          <div ref={previewRef}>
            <h3>
              Prévia · Semana {preview.semana} · {preview.placa}
              {preview.motorista ? ` · ${preview.motorista}` : ""}
            </h3>
            <Values
              data={previewDisplay}
              selectableDebits={debitRows(preview)}
              selectedDebitIds={selectedDebitIds}
              setSelectedDebitIds={setSelectedDebitIds}
              busy={busy}
            />
            <p className="muted">
              O backend recalcula na finalização. Alterações posteriores à
              conferência podem mudar os valores. Finalizar marca os registros
              como pagos; não realiza transferência bancária.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void download(
                  `/freight-closures/preview/print.pdf?semana=${preview.semana}&placa=${preview.placa}`,
                  "conferencia.pdf",
                )
              }
            >
              Baixar conferência
            </button>
            {!previewDisplay.manifests.length &&
            !previewDisplay.entries.length &&
            !previewDisplay.coupons.length ? (
              <p>Nenhum registro aberto para finalizar.</p>
            ) : confirm ? (
              <div className="alert">
                <p>
                  Confirmar o fechamento da semana {preview.semana}, placa{" "}
                  {preview.placa}?
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void finalize()}
                >
                  Confirmar finalização
                </button>{" "}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Voltar à conferência
                </button>
              </div>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Finalizar fechamento
              </button>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="filters">
          <h2>Últimos fechamentos</h2>
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Atualizar fechamentos
          </button>
        </div>
        {loading ? (
          <p className="empty" role="status">
            Carregando fechamentos…
          </p>
        ) : !rows.length ? (
          <p className="empty">Nenhum fechamento disponível na consulta.</p>
        ) : (
          <div className="table-scroll">
            <SortableTable>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Semana / Placa</th>
                  <th>Líquido</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.numero}</td>
                    <td>
                      {row.semana ?? "Não registrada"}
                      <small>{row.placa}</small>
                    </td>
                    <td>{money(row.total_liquido)}</td>
                    <td>{row.status}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void detail(row.id)}
                      >
                        Consultar fechamento {row.numero}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void download(
                            `/freight-closures/${row.id}/print.pdf`,
                            `fechamento-${row.numero}.pdf`,
                          )
                        }
                      >
                        Reimprimir fechamento {row.numero}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
        <p className="table-footer">Até 50 fechamentos da unidade.</p>
      </section>
      <ReprintClosures token={token} expired={expired} />
      {report && (
        <section className="panel reference-form">
          <h2>
            Fechamento {report.cabecalho.numero} · {report.cabecalho.status}
          </h2>
          <p>
            Semana {report.cabecalho.semana} · {report.cabecalho.placa}
          </p>
          {report.origem !== "FINALIZACAO" && (
            <p className="alert">
              Registro legado: dados disponíveis nos vínculos ou no histórico de
              cancelamento. Não há cópia original da finalização.
            </p>
          )}
          {report.cabecalho.cancelamento && (
            <p>
              Motivo do cancelamento: {report.cabecalho.cancelamento.motivo}
            </p>
          )}
          <Values data={report} />
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void download(
                `/freight-closures/${report.cabecalho.id}/print.pdf`,
                `fechamento-${report.cabecalho.numero}.pdf`,
              )
            }
          >
            Baixar relatório para impressão
          </button>
          <p className="muted">O arquivo baixado já será gerado em PDF.</p>
          {isAdmin &&
            report.cabecalho.status === "FECHADO" &&
            (cancel ? (
              <form onSubmit={cancelClosure}>
                <fieldset disabled={busy}>
                  <label>
                    Motivo do cancelamento
                    <textarea name="motivo" required maxLength={500} />
                  </label>
                  <p>
                    Os registros serão reabertos. O fechamento e seu histórico
                    serão preservados.
                  </p>
                  <button className="primary">Confirmar cancelamento</button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCancel(false)}
                  >
                    Manter fechamento
                  </button>
                </fieldset>
              </form>
            ) : (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                Cancelar fechamento
              </button>
            ))}
        </section>
      )}
    </div>
  );
}

function Values({
  data,
  selectableDebits,
  selectedDebitIds,
  setSelectedDebitIds,
  busy = false,
}: {
  data: Pick<
    Preview,
    "totals" | "payment" | "manifests" | "entries" | "coupons"
  >;
  selectableDebits?: EntryRow[];
  selectedDebitIds?: number[];
  setSelectedDebitIds?: (ids: number[]) => void;
  busy?: boolean;
}) {
  const creditRows = data.entries.filter(
    (entry) => entry.tipo_despesa === "Credito",
  );
  const debitEntries = selectableDebits ?? debitRows(data);
  const selected = new Set(
    selectedDebitIds ?? debitEntries.map((entry) => entry.id),
  );
  const canSelectDebits = !!setSelectedDebitIds;
  const selectedDebitTotal = debitEntries
    .filter((entry) => selected.has(entry.id))
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const allDebitTotal = debitEntries.reduce(
    (total, entry) => total + decimal(entry.valor),
    0,
  );
  const manifestTotal = data.manifests.reduce(
    (total, item) => total + decimal(item.frete_veiculo),
    0,
  );
  const creditTotal = creditRows.reduce(
    (total, item) => total + decimal(item.valor),
    0,
  );
  const creditsAndManifestsTotal = manifestTotal + creditTotal;
  const ctrbTotal = decimal(data.totals.total_ctrb);
  const remainingBeforeDebits = creditsAndManifestsTotal - ctrbTotal;
  const remainingAfterDebits = remainingBeforeDebits - selectedDebitTotal;
  const ctrbs = data.payment?.ctrbs ?? [];
  const toggleDebit = (id: number, checked: boolean) => {
    if (!setSelectedDebitIds) return;
    const next = new Set(selectedDebitIds ?? []);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedDebitIds([...next]);
  };
  const setAllDebits = () =>
    setSelectedDebitIds?.(debitEntries.map((entry) => entry.id));

  return (
    <>
      <dl className="detail-grid closure-values-summary">
        {(
          [
            ["Bruto", "total_bruto"],
            ["Débitos", "debitos"],
            ["Cupons", "cupons"],
            ["Créditos", "creditos"],
            ["Líquido", "total_liquido"],
            ["CTRB", "total_ctrb"],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{money(data.totals[key])}</dd>
          </div>
        ))}
      </dl>
      {data.payment ? (
        <p className="closure-payment-line">
          Empresa de pagamento:{" "}
          {data.payment.primeira.empresa ?? "Não cadastrada"} —{" "}
          {money(data.payment.primeira.valor)}
          {Number(data.payment.segunda.valor) !== 0 && (
            <>
              {" | "}Segunda pagadora:{" "}
              {data.payment.segunda.empresa ?? "Não cadastrada"} —{" "}
              {money(data.payment.segunda.valor)}
            </>
          )}
          {" | "}Critério: {data.payment.criterio}
        </p>
      ) : (
        <p className="closure-payment-line">
          Empresa de pagamento não registrada.
        </p>
      )}
      <section className="closure-records-compact">
        <h3>Registros do fechamento</h3>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Créditos e manifestos</strong>
            <span>Total {money(moneyValue(creditsAndManifestsTotal))}</span>
          </div>
          <table>
            <tbody>
              {data.manifests.map((m) => (
                <tr key={`m${m.id}`}>
                  <td>Manifesto</td>
                  <td>{m.manifestos}</td>
                  <td className="right">{money(m.frete_veiculo)}</td>
                </tr>
              ))}
              {creditRows.map((e) => (
                <tr key={`e${e.id}`}>
                  <td>Crédito</td>
                  <td>
                    {e.numero} · {e.nome_despesa}
                  </td>
                  <td className="right">{money(e.valor)}</td>
                </tr>
              ))}
              {!data.manifests.length && !creditRows.length && (
                <tr>
                  <td colSpan={3}>Nenhum crédito ou manifesto.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>CTRBs</strong>
            <span>Total {money(moneyValue(ctrbTotal))}</span>
          </div>
          <table>
            <tbody>
              {ctrbs.map((ctrb) => (
                <tr key={ctrb}>
                  <td>CTRB</td>
                  <td>{ctrb}</td>
                  <td className="right">—</td>
                </tr>
              ))}
              {!ctrbs.length && (
                <tr>
                  <td colSpan={3}>Nenhum CTRB registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Débitos</strong>
            <span>
              Restante {money(moneyValue(remainingAfterDebits))} - Débitos{" "}
              {money(moneyValue(selectedDebitTotal))} de{" "}
              {money(moneyValue(allDebitTotal))}
            </span>
          </div>
          {canSelectDebits && debitEntries.length > 0 && (
            <div className="closure-record-actions">
              <button
                type="button"
                className="text-button"
                disabled={
                  busy || debitEntries.every((entry) => selected.has(entry.id))
                }
                onClick={setAllDebits}
              >
                Selecionar todos
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy || !selected.size}
                onClick={() => setSelectedDebitIds?.([])}
              >
                Limpar seleção
              </button>
            </div>
          )}
          <table>
            <tbody>
              {debitEntries.map((e) => (
                <tr
                  key={`d${e.id}`}
                  className={selected.has(e.id) ? "" : "muted-row"}
                >
                  <td>
                    {canSelectDebits ? (
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        disabled={busy}
                        aria-label={`Descontar lançamento ${e.numero}`}
                        onChange={(event) =>
                          toggleDebit(e.id, event.target.checked)
                        }
                      />
                    ) : (
                      "Débito"
                    )}
                  </td>
                  <td>
                    {e.numero} · {e.nome_despesa}
                  </td>
                  <td className="right">{money(e.valor)}</td>
                </tr>
              ))}
              {data.coupons.map((c) => (
                <tr key={`c${c.id}`}>
                  <td>Cupom</td>
                  <td>Nota (ID) {c.nota_id}</td>
                  <td className="right">{money(c.valor)}</td>
                </tr>
              ))}
              {!debitEntries.length && !data.coupons.length && (
                <tr>
                  <td colSpan={3}>Nenhum débito ou cupom.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
