import SortableTable from "./SortableTable";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, apiUrl, ApiError } from "./api";
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
type ManifestRow = {
  id: number; unit?: number; semana?: string; manifestos: string; frete_veiculo: string;
  hora?: string | null; destino?: string | null;
  ctrb_numero?: string | null; ctrb_total?: string; ctrb_adiantamento?: string;
  vale_pedagio?: string; sest_senat?: string; irrf?: string;
  prev_social?: string; inss?: string; valor_liquido?: string;
};
type EntryRow = {
  id: number;
  numero: number;
  unit?: number;
  manifesto_id?: number | null;
  data_lancamento?: string;
  codigo_despesa?: string;
  nome_despesa: string;
  tipo_despesa: string;
  valor: string;
};
type CouponRow = {
  id: number;
  nota_id: number;
  valor: string;
  data_cobranca?: string;
};
type Preview = {
  semana: string;
  periodo_inicio?: string;
  periodo_fim?: string;
  origem?: string | null;
  placa: string;
  motorista?: string | null;
  closureNumber?: number | null;
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
const recordDate = (value?: string) => {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? day.split("-").reverse().join("/")
    : "—";
};
const manifestWithoutUnit = (value: string) =>
  /^\d{3}/.test(value) ? value.slice(3) : value;
const entryDescription = (entry: EntryRow) =>
  entry.codigo_despesa
    ? `${entry.codigo_despesa} - ${entry.nome_despesa}`
    : entry.nome_despesa;
const creditEntryDescription = (entry: EntryRow, manifests: ManifestRow[]) => {
  const manifest = manifests.find((item) => item.id === entry.manifesto_id);
  return [
    manifest ? manifestWithoutUnit(manifest.manifestos) : null,
    entry.codigo_despesa?.trim(),
    entry.nome_despesa?.trim(),
  ]
    .filter(Boolean)
    .join(" - ");
};
const entryIdentifier = (entry: EntryRow) => String(entry.id);
const recordTime = (value?: string) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};
const recordHour = (value?: string | null) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : value || "—";
};

const debitRows = (data: Pick<Preview, "entries" | "availableDebits">) =>
  data.availableDebits ??
  data.entries.filter((entry) => entry.tipo_despesa === "Debito");
const decimal = (value: string | undefined) => Number(value ?? 0);
const moneyValue = (value: number) => value.toFixed(2);
const initialBatchSelections = (groups: Preview[]) =>
  Object.fromEntries(
    groups.map((group) => [group.placa, []]),
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
  return {
    ...data,
    entries: data.entries.filter(
      (entry) => entry.tipo_despesa !== "Debito" || selected.has(entry.id),
    ),
    totals: {
      ...data.totals,
      debitos: moneyValue(selectedTotal),
      total_liquido: moneyValue(
        originalNet + originalDebits - selectedTotal,
      ),
    },
  };
};

export default function Closures({
  token,
  isAdmin,
  userUnit,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  userUnit: number;
  expired: () => void;
}) {
  const [rows, setRows] = useState<Closure[]>([]);
  const [consultingClosures, setConsultingClosures] = useState(false);
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
  const conferenceRef = useRef<HTMLDivElement | null>(null);
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
    if (isAdmin && filters.unit.trim()) p.set("local", filters.unit.trim());
    if (week) p.set("semana", week);
    if (plate.trim()) p.set("placa", plate.trim().toUpperCase());
    for (const [k, v] of Object.entries(filters)) {
      if (k !== "unit" && v !== "" && v !== false) p.set(k, String(v));
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
      () => conferenceRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
      0,
    );
  }, [conferenceGroups, batchIndex]);
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
        k === "unit" ? false :
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
    setBusy(true);
    setPreview(null);
    setConfirm(false);
    setError("");
    setSuccess("");
    try {
      const data = await api<Preview>(
        `/freight-closures/preview?${new URLSearchParams({
          ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
          ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
          semana: week,
          placa: plate.trim().toUpperCase(),
        }).toString()}`,
        token,
      );
      setPreview(data);
      setSelectedDebitIds([]);
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
      if (filters.unit || filters.dominio) {
        setBusy(false);
        setError("Para finalizar com filtro de unidade ou domínio, selecione uma placa.");
        return;
      }
      try {
        const q = new URLSearchParams({
          ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
          ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
          semana: week,
        }).toString();
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
        `/freight-closures/preview?${new URLSearchParams({
          ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
          ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
          semana: week,
          placa: plate.trim().toUpperCase(),
        }).toString()}`,
        token,
      );
      setPreview(data);
      setSelectedDebitIds([]);
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
            ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
            ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
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
      const result = await api<{ results: { closure: { id: number } }[] }>(
        "/freight-closures/week",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            semana: batchWeek,
            placas: conferenceGroups?.slice(0, batchIndex + 1).map((group) => group.placa) ?? [],
            selections: selections.filter((selection) =>
              conferenceGroups?.slice(0, batchIndex + 1).some((group) => group.placa === selection.placa),
            ),
          }),
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
  async function finalizeCurrentPlate() {
    if (!batchWeek || busy || !conferenceGroups?.length) return;
    const currentIndex = Math.min(batchIndex, conferenceGroups.length - 1);
    const current = conferenceGroups[currentIndex];
    const reportWindow = window.open("", "_blank");
    if (reportWindow) reportWindow.opener = null;
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
            semana: batchWeek,
            placa: current.placa,
            debit_entry_ids: batchDebitSelections[current.placa] ?? [],
          }),
        },
      );
      const remaining = conferenceGroups.filter(
        (_, index) => index !== currentIndex,
      );
      setConferenceGroups(remaining);
      setBatchIndex(Math.min(currentIndex, Math.max(remaining.length - 1, 0)));
      setBatchDebitSelections((selections) => {
        const next = { ...selections };
        delete next[current.placa];
        return next;
      });
      setReport(null);
      await downloadClosurePdf(
        result.closure.id,
        "drivers",
        `motorista-fechamento-${result.closure.numero}.pdf`,
        reportWindow,
      );
      setSuccess(`Placa ${current.placa} fechada no fechamento ${result.closure.numero}.`);
      await load();
    } catch (e) {
      if (reportWindow?.location.href === "about:blank") reportWindow.close();
      fail(e);
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
        method: "DELETE",
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
        apiUrl("/freight-closures/conference/adjusted-print.pdf"),
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
  async function download(path: string, name: string, openPdf = false) {
    const reportWindow = openPdf ? window.open("", "_blank") : null;
    if (reportWindow) reportWindow.opener = null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl(path), {
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
      if (reportWindow) reportWindow.location.href = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      reportWindow?.close();
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function downloadClosurePdf(
    id: number,
    kind: "freight" | "drivers",
    name: string,
    openIn: Window | null = null,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/freight-closures/week/${kind}.pdf`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          Array.isArray(data?.message)
            ? data.message.join(" • ")
            : data?.message || `Não foi possível gerar o relatório (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (openIn) openIn.location.href = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      openIn?.close();
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
      <div className="page-heading">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            const consulting = !consultingClosures;
            setConsultingClosures(consulting);
            if (consulting) {
              setError("");
              void load();
            }
          }}
        >
          {consultingClosures ? "+ Novo fechamento" : "Consultar fechamentos"}
        </button>
      </div>
      <div hidden={consultingClosures}>
      <section className="panel reference-form">
        <h2>Conferir semana e veículo</h2>
        <ClosureForm
          token={token}
          busy={busy}
          isAdmin={isAdmin}
          userUnit={userUnit}
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
          selectClosure={() => void selectClosure()}
          cancel={() => void excludePayment()}
          expired={expired}
        />
        {conferenceGroups && (
          <section className="conference-results">
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
                    <div className="batch-saved-line">
                      <span className="badge">Seleções salvas nesta conferência</span>
                    </div>
                    <div ref={conferenceRef} className="filters batch-conference-heading">
                      <div>
                        <h3>
                          {batchIndex + 1} de {conferenceGroups.length} ·{" "}
                          {current.placa}
                          {current.motorista ? ` · ${current.motorista}` : ""}
                          {` · Fechamento ${current.closureNumber ?? "—"}`}
                        </h3>
                        <p className="muted">
                          Semana {current.semana} · {recordDate(current.periodo_inicio)} a {recordDate(current.periodo_fim)} · Origem {current.origem || "—"}
                        </p>
                      </div>
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
                        className="secondary batch-compact-action"
                        disabled={busy || !activeConferenceWeek()}
                        onClick={() => void downloadAdjustedConference()}
                      >
                        Baixar conferência
                      </button>
                      <button type="button" className="primary batch-compact-action" disabled={busy || !activeConferenceWeek()} onClick={saveBatchAdjustments}>
                        Salvar alterações
                      </button>
                      <button
                        type="button"
                        className="secondary batch-compact-action"
                        disabled={busy || batchIndex === 0}
                        onClick={() =>
                          setBatchIndex((value) => Math.max(0, value - 1))
                        }
                      >
                        Anterior
                      </button>
                      {batchIndex < conferenceGroups.length - 1 && (
                        <button
                          type="button"
                          className="primary batch-compact-action"
                          disabled={busy}
                          onClick={() =>
                            setBatchIndex((value) =>
                              Math.min(conferenceGroups.length - 1, value + 1),
                            )
                          }
                        >
                          Próximo
                        </button>
                      )}
                      {batchWeek && (
                        <>
                          <button type="button" className="primary batch-compact-action batch-close-plate-action" disabled={busy} onClick={() => void finalizeCurrentPlate()}>
                            Fechar placa
                          </button>
                          <span className="batch-action-break" aria-hidden="true" />
                          <button type="button" className="primary batch-compact-action batch-close-week-action" disabled={busy} onClick={() => void finalizeWeek()}>
                            Fechar semana
                          </button>
                        </>
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
                  `/freight-closures/preview/print.pdf?${new URLSearchParams({
                    ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
                    ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
                    semana: preview.semana,
                    placa: preview.placa,
                  }).toString()}`,
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
      </div>
      <section className="panel" hidden={!consultingClosures}>
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
                            true,
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
                true,
              )
            }
          >
            Imprimir fechamento de frete
          </button>
          <p className="muted">O arquivo baixado já será gerado em PDF.</p>
          {report.cabecalho.status === "FECHADO" &&
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
  const manifestIds = new Set(data.manifests.map((manifest) => manifest.id));
  const ctrbAdvance3333 = data.entries
    .filter(
      (entry) =>
        String(entry.codigo_despesa ?? "").trim() === "3333" &&
        entry.manifesto_id != null &&
        manifestIds.has(entry.manifesto_id),
    )
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const ctrbMlnTotal =
    data.manifests.reduce(
      (total, manifest) => total + decimal(manifest.valor_liquido),
      0,
    ) - ctrbAdvance3333;
  const driverCompany =
    data.payment?.primeira.empresa || "Empresa do motorista";
  const driverCompanyTotal = decimal(data.totals.total_liquido) - ctrbTotal;
  const ctrbs = data.payment?.ctrbs ?? [];
  const creditRecords = [
    ...data.manifests.map((manifest) => ({
      kind: "manifest" as const,
      date: manifest.semana,
      manifest,
    })),
    ...creditRows.map((entry) => ({
      kind: "entry" as const,
      date: entry.data_lancamento,
      entry,
    })),
  ].sort((a, b) => recordTime(a.date) - recordTime(b.date));
  const ctrbRows = ctrbs
    .map((numero) => {
      const manifest = data.manifests.find(
        (item) => item.ctrb_numero === numero,
      );
      return { numero, manifest };
    })
    .sort(
      (a, b) => recordTime(a.manifest?.semana) - recordTime(b.manifest?.semana),
    );
  const debitRecords = [
    ...debitEntries.map((entry) => ({
      kind: "entry" as const,
      date: entry.data_lancamento,
      entry,
    })),
    ...data.coupons.map((coupon) => ({
      kind: "coupon" as const,
      date: coupon.data_cobranca,
      coupon,
    })),
  ].sort((a, b) => recordTime(a.date) - recordTime(b.date));
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
      <section className="closure-records-compact">
        <h3>Registros do fechamento</h3>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Créditos e manifestos</strong>
          </div>
          <table>
            <thead><tr><th>Data</th><th>ID Lanç/Uni</th><th>Descrição / Manifesto</th><th>Horário</th><th>Destino</th><th className="right">Valor</th></tr></thead>
            <tbody>
              {creditRecords.map((record) => record.kind === "manifest" ? (
                <tr key={`m${record.manifest.id}`}><td>{recordDate(record.date)}</td><td>{record.manifest.unit ?? "—"}</td><td>{manifestWithoutUnit(record.manifest.manifestos)}</td><td>{recordHour(record.manifest.hora)}</td><td>{record.manifest.destino || "—"}</td><td className="right">{money(record.manifest.frete_veiculo)}</td></tr>
              ) : (
                <tr key={`e${record.entry.id}`}><td>{recordDate(record.date)}</td><td>{entryIdentifier(record.entry)}</td><td>{creditEntryDescription(record.entry, data.manifests)}</td><td>—</td><td>—</td><td className="right">{money(record.entry.valor)}</td></tr>
              ))}
              {!data.manifests.length && !creditRows.length && <tr><td colSpan={6}>Nenhum crédito ou manifesto.</td></tr>}
            </tbody>
            <tfoot><tr className="closure-record-total"><td colSpan={5}>Total de créditos e manifestos</td><td className="right">{money(moneyValue(creditsAndManifestsTotal))}</td></tr></tfoot>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title"><strong>CTRBs</strong></div>
          <table className="closure-ctrb-table">
            <thead><tr><th>Data</th><th>Manifesto</th><th>CTRB</th><th className="right">Adiantamento</th><th className="right">Vale-pedágio</th><th className="right">SEST/SENAT</th><th className="right">IRRF</th><th className="right">Prev. Social</th><th className="right">INSS</th><th className="right">Valor líquido</th><th className="right">Valor CTRB</th></tr></thead>
            <tbody>
              {ctrbRows.map(({ numero, manifest }) => <tr key={numero}>
                <td>{recordDate(manifest?.semana)}</td>
                <td>{manifest ? manifestWithoutUnit(manifest.manifestos) : "—"}</td>
                <td>{numero}</td>
                <td className="right">{money(manifest?.ctrb_adiantamento)}</td>
                <td className="right">{money(manifest?.vale_pedagio)}</td>
                <td className="right">{money(manifest?.sest_senat)}</td>
                <td className="right">{money(manifest?.irrf)}</td>
                <td className="right">{money(manifest?.prev_social)}</td>
                <td className="right">{money(manifest?.inss)}</td>
                <td className="right">{money(manifest?.valor_liquido)}</td>
                <td className="right">{money(manifest?.ctrb_total)}</td>
              </tr>)}
              {!ctrbRows.length && <tr><td colSpan={11}>Nenhum CTRB registrado.</td></tr>}
            </tbody>
            <tfoot><tr className="closure-record-total"><td colSpan={10}>Total de CTRBs</td><td className="right">{money(moneyValue(ctrbTotal))}</td></tr></tfoot>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Vales</strong>
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
            <thead><tr><th>Data</th><th>ID Vale</th><th>Descrição</th><th className="right">Valor</th></tr></thead>
            <tbody>
              {debitRecords.map((record) => record.kind === "entry" ? (
                <tr
                  key={`d${record.entry.id}`}
                  className={selected.has(record.entry.id) ? "" : "muted-row"}
                >
                  <td>{recordDate(record.date)}</td>
                  <td>
                    {canSelectDebits ? (
                      <><input
                          type="checkbox"
                          checked={selected.has(record.entry.id)}
                          disabled={busy}
                          aria-label={`Descontar vale ${record.entry.id}`}
                          onChange={(event) =>
                            toggleDebit(record.entry.id, event.target.checked)
                          }
                        /> {entryIdentifier(record.entry)}</>
                    ) : (
                      entryIdentifier(record.entry)
                    )}
                  </td>
                  <td>{entryDescription(record.entry)}</td>
                  <td className="right">{money(record.entry.valor)}</td>
                </tr>
              ) : (
                <tr key={`c${record.coupon.id}`}><td>{recordDate(record.date)}</td><td>Cupom</td><td>Nota (ID) {record.coupon.nota_id}</td><td className="right">{money(record.coupon.valor)}</td></tr>
              ))}
              {!debitEntries.length && !data.coupons.length && <tr><td colSpan={4}>Nenhum vale ou cupom.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="closure-record-total"><td colSpan={3}>Total de vales selecionados</td><td className="right">{money(moneyValue(selectedDebitTotal))}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="closure-summary-row">
          <dl className="detail-grid closure-values-summary">
            {[
              ["Bruto", data.totals.total_bruto],
              ["Vales", data.totals.debitos],
              ["CTRB", data.totals.total_ctrb],
              ["Líquido", data.totals.total_liquido],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{money(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="closure-payment-totals">
            <p><span>{driverCompany}</span><strong>{money(moneyValue(driverCompanyTotal))}</strong></p>
            <p><span>CTRB MLN</span><strong>{money(moneyValue(ctrbMlnTotal))}</strong></p>
          </div>
        </div>
      </section>
    </>
  );
}
