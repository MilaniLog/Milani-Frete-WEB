import SortableTable from "./SortableTable";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, apiUrl, ApiError } from "./api";
import ClosureForm, {
  emptyClosureFilters,
  type ClosureFilters,
} from "./ClosureForm";
import { expenseName } from "./expense-display";
import { valeIdentifier } from "./vale-identifier";

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
  tipo_veiculo?: string | null; motorista?: string | null;
  hora?: string | null; destino?: string | null;
  cod_777_15?: string; cod_888_25?: string; cod_999_100?: string;
  nao_777_calc?: string; nao_888_calc?: string; nao_999_calc?: string;
  diaria?: string; tde?: string; escada?: string; paletização?: string;
  estadia?: string; descarga?: string; outros?: string;
  carreg_perc?: string; perc_carreg?: string;
  perc_final?: string; final_perc?: string;
  ctrb_numero?: string | null; ctrb_total?: string; ctrb_adiantamento?: string;
  vale_pedagio?: string; sest_senat?: string; irrf?: string;
  prev_social?: string; inss?: string; valor_liquido?: string;
};
type EntryRow = {
  id: number;
  controle_id?: number | null;
  numero: number;
  unit?: number;
  motorista?: string | null;
  tipo_veiculo?: string | null;
  manifesto_id?: number | null;
  manifesto_numero?: string | null;
  data_lancamento?: string;
  codigo_despesa?: string;
  nome_despesa: string;
  tipo_despesa: string;
  valor: string;
  descricao?: string | null;
  responsavel_cod?: number | null;
};
type CouponRow = {
  id: number;
  controle_id?: number | null;
  nota_id: number;
  motorista?: string | null;
  tipo_veiculo?: string | null;
  valor: string;
  data_cobranca?: string;
  descricao?: string | null;
  responsavel_cod?: number | null;
  nota?: { codigo_tipo?: string | null; nome_tipo?: string | null } | null;
};
type Preview = {
  semana: string;
  periodo_inicio?: string;
  periodo_fim?: string;
  origem?: string | null;
  placa: string;
  motorista?: string | null;
  tipoVeiculo?: string | null;
  closureNumber?: number | null;
  isClosed?: boolean;
  manifests: ManifestRow[];
  entries: EntryRow[];
  availableDebits?: EntryRow[];
  availableCoupons?: CouponRow[];
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
    ? ""
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
const recordDate = (value?: string) => {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? day.split("-").reverse().join("/")
    : "";
};
const manifestWithoutUnit = (value: string) =>
  /^\d{3}/.test(value) ? value.slice(3) : value;
const entryDescription = (entry: EntryRow) =>
  entry.codigo_despesa
    ? `${entry.codigo_despesa} - ${expenseName(entry.codigo_despesa, entry.nome_despesa)}`
    : expenseName(entry.codigo_despesa, entry.nome_despesa);
const couponExpense = (_coupon: CouponRow) => "ABASTECIMENTO";
const entryManifestNumber = (entry: EntryRow, manifests: ManifestRow[]) => {
  const manifest = manifests.find((item) => item.id === entry.manifesto_id);
  const number = manifest?.manifestos ?? entry.manifesto_numero;
  return number ? manifestWithoutUnit(number) : "Sem manifesto";
};
const entryIdentifier = (entry: EntryRow) => String(valeIdentifier(entry));
const recordTime = (value?: string) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};
const recordHour = (value?: string | null) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : value || "";
};

const debitRows = (data: Pick<Preview, "entries" | "availableDebits">) =>
  data.availableDebits ??
  data.entries.filter((entry) => entry.tipo_despesa === "Debito");
const couponRows = (data: Pick<Preview, "coupons" | "availableCoupons">) =>
  data.availableCoupons ?? data.coupons;
type RecordSelection = { debits: number[]; coupons: number[] };
type DraftResponse = {
  selections: {
    placa: string;
    debit_entry_ids: number[];
    coupon_ids: number[];
  }[];
  lastUpdate: {
    responsavel_cod: number;
    responsavel_nome: string | null;
    updated_at: string;
  } | null;
};
const decimal = (value: string | undefined) => Number(value ?? 0);
const moneyValue = (value: number) => value.toFixed(2);
const percentage = (value: string | undefined) =>
  value == null
    ? ""
    : (Number(value) * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + "%";
const initialBatchSelections = (groups: Preview[]) =>
  Object.fromEntries(
    groups.map((group) => [group.placa, { debits: [], coupons: [] }]),
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
        const stored = parsed[group.placa];
        const savedDebits = Array.isArray(stored)
          ? stored.filter(
              (id: unknown) => typeof id === "number" && available.has(id),
            )
          : Array.isArray(stored?.debits)
            ? stored.debits.filter((id: unknown) => typeof id === "number" && available.has(id))
            : [];
        const availableCoupons = new Set(couponRows(group).map((coupon) => coupon.id));
        const savedCoupons = Array.isArray(stored?.coupons)
          ? stored.coupons.filter((id: unknown) => typeof id === "number" && availableCoupons.has(id))
          : [];
        return [group.placa, { debits: savedDebits, coupons: savedCoupons }];
      }),
    );
  } catch {
    return fallback;
  }
};

const selectionsFromDraft = (
  week: string,
  groups: Preview[],
  draft: DraftResponse,
) => {
  if (!draft.selections.length) return loadBatchSelections(week, groups);
  const stored = new Map(draft.selections.map((selection) => [selection.placa, selection]));
  return Object.fromEntries(
    groups.map((group) => {
      const selection = stored.get(group.placa);
      const availableDebits = new Set(debitRows(group).map((entry) => entry.id));
      const availableCoupons = new Set(couponRows(group).map((coupon) => coupon.id));
      return [
        group.placa,
        {
          debits: (selection?.debit_entry_ids ?? []).filter((id) => availableDebits.has(id)),
          coupons: (selection?.coupon_ids ?? []).filter((id) => availableCoupons.has(id)),
        },
      ];
    }),
  );
};

const withSelections = (data: Preview, selection: RecordSelection): Preview => {
  const selected = new Set(selection.debits);
  const selectedCoupons = new Set(selection.coupons);
  const debits = debitRows(data);
  const selectedTotal = debits
    .filter((entry) => selected.has(entry.id))
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const originalDebits = decimal(data.totals.debitos);
  const originalNet = decimal(data.totals.total_liquido);
  const coupons = couponRows(data);
  const selectedCouponRows = coupons.filter((coupon) => selectedCoupons.has(coupon.id));
  const selectedCouponTotal = selectedCouponRows.reduce(
    (total, coupon) => total + decimal(coupon.valor), 0,
  );
  const originalCoupons = decimal(data.totals.cupons);
  return {
    ...data,
    entries: data.entries.filter(
      (entry) =>
        entry.tipo_despesa !== "Debito" ||
        String(entry.codigo_despesa ?? "").trim() === "3333" ||
        selected.has(entry.id),
    ),
    coupons: selectedCouponRows,
    totals: {
      ...data.totals,
      debitos: moneyValue(selectedTotal),
      cupons: moneyValue(selectedCouponTotal),
      total_liquido: moneyValue(
        originalNet + originalDebits + originalCoupons - selectedTotal - selectedCouponTotal,
      ),
    },
  };
};

const negativeNetMessage = (data: Preview) =>
  decimal(data.totals.total_liquido) < 0
    ? `Não é possível fechar a placa ${data.placa}: o valor líquido está negativo (${money(data.totals.total_liquido)}).`
    : null;

export default function Closures({
  token,
  isAdmin,
  userUnit,
  openReprint,
  initialConsulting = false,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  userUnit: number;
  openReprint?: () => void;
  initialConsulting?: boolean;
  expired: () => void;
}) {
  const [rows, setRows] = useState<Closure[]>([]);
  const [closureSearch, setClosureSearch] = useState("");
  const [consultingClosures, setConsultingClosures] = useState(initialConsulting);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [week, setWeek] = useState("");
  const [plate, setPlate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedDebitIds, setSelectedDebitIds] = useState<number[]>([]);
  const [selectedCouponIds, setSelectedCouponIds] = useState<number[]>([]);
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
    Record<string, RecordSelection>
  >({});
  const [draftLastUpdate, setDraftLastUpdate] = useState<DraftResponse["lastUpdate"]>(null);
  const draftStatus = draftLastUpdate
    ? `Rascunho salvo por ${draftLastUpdate.responsavel_cod}${draftLastUpdate.responsavel_nome ? ` - ${draftLastUpdate.responsavel_nome}` : ""} em ${new Date(draftLastUpdate.updated_at).toLocaleString("pt-BR")}`
    : "Nenhum rascunho compartilhado salvo";
  const visibleClosures = rows.filter((row) => {
    const query = closureSearch.trim().toLowerCase();
    return !query || [row.numero, row.semana, row.placa, row.status]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
  });
  function invalidate() {
    setPreview(null);
    setSelectedDebitIds([]);
    setSelectedCouponIds([]);
    setConfirm(false);
    setConferenceGroups(null);
    setConferenceQuery("");
    setBatchWeek("");
    setBatchIndex(0);
    setBatchDebitSelections({});
    setDraftLastUpdate(null);
  }
  function draftQuery(selectedWeek: string) {
    return new URLSearchParams({
      semana: selectedWeek,
      ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
      ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
    }).toString();
  }
  async function loadDraft(selectedWeek: string, groups: Preview[]) {
    if (!selectedWeek || !groups.length) {
      setDraftLastUpdate(null);
      return initialBatchSelections(groups);
    }
    const draft = await api<DraftResponse>(
      `/freight-closures/drafts?${draftQuery(selectedWeek)}`,
      token,
    );
    setDraftLastUpdate(draft.lastUpdate);
    return selectionsFromDraft(selectedWeek, groups, draft);
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
  async function load(search = closureSearch) {
    setLoading(true);
    try {
      const query = search.trim();
      setRows(await api<Closure[]>(`/freight-closures${/^\d+$/.test(query) ? `?numero=${encodeURIComponent(query)}` : ""}`, token));
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
        setBatchDebitSelections(await loadDraft(week, data.groups));
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
      setSelectedCouponIds([]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function refreshConference() {
    if (!conferenceGroups || !conferenceQuery || busy) return;
    const currentPlate = conferenceGroups[batchIndex]?.placa;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = await api<{ groups: Preview[] }>(
        `/freight-closures/conference?${conferenceQuery}`,
        token,
      );
      setConferenceGroups(data.groups);
      const refreshedIndex = currentPlate
        ? data.groups.findIndex((group) => group.placa === currentPlate)
        : 0;
      setBatchIndex(Math.max(0, refreshedIndex));
      setBatchDebitSelections((previous) => {
        const next: Record<string, RecordSelection> = {};
        for (const group of data.groups) {
          const available = new Set(debitRows(group).map((row) => row.id));
          const prior = previous[group.placa] ?? { debits: [], coupons: [] };
          const availableCoupons = new Set(couponRows(group).map((row) => row.id));
          next[group.placa] = {
            debits: prior.debits.filter((id) => available.has(id)),
            coupons: prior.coupons.filter((id) => availableCoupons.has(id)),
          };
        }
        return next;
      });
      setSuccess("Dados da conferência atualizados.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function refreshPreview() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = await api<Preview>(
        `/freight-closures/preview?${new URLSearchParams({
          ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
          ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
          semana: preview.semana,
          placa: preview.placa,
        }).toString()}`,
        token,
      );
      const available = new Set(debitRows(data).map((row) => row.id));
      setSelectedDebitIds((ids) => ids.filter((id) => available.has(id)));
      const availableCoupons = new Set(couponRows(data).map((row) => row.id));
      setSelectedCouponIds((ids) => ids.filter((id) => availableCoupons.has(id)));
      setPreview(data);
      setSuccess("Dados da placa atualizados.");
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
        setBatchDebitSelections(await loadDraft(week, data.groups));
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
      setSelectedCouponIds([]);
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
    const negativeMessage = previewDisplay
      ? negativeNetMessage(previewDisplay)
      : null;
    if (negativeMessage) {
      setError(negativeMessage);
      setSuccess("");
      setConfirm(false);
      return;
    }
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
            coupon_ids: selectedCouponIds,
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
    const openGroups = conferenceGroups?.filter((group) => !group.isClosed) ?? [];
    const invalid = openGroups
      .map((group) =>
        withSelections(group, batchDebitSelections[group.placa] ?? { debits: [], coupons: [] }),
      )
      .find((group) => negativeNetMessage(group));
    if (invalid) {
      setError(negativeNetMessage(invalid)!);
      setSuccess("");
      return;
    }
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
            ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
            ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
            placas: openGroups.map((group) => group.placa),
            selections: selections.filter((selection) =>
              openGroups.some((group) => group.placa === selection.placa),
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
    const currentDisplay = withSelections(
      current,
      batchDebitSelections[current.placa] ?? { debits: [], coupons: [] },
    );
    const negativeMessage = negativeNetMessage(currentDisplay);
    if (negativeMessage) {
      setError(negativeMessage);
      setSuccess("");
      return;
    }
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
            debit_entry_ids: batchDebitSelections[current.placa]?.debits ?? [],
            coupon_ids: batchDebitSelections[current.placa]?.coupons ?? [],
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
      await downloadClosureHtml(
        result.closure.id,
        "drivers",
        `motorista-fechamento-${result.closure.numero}.html`,
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
        debit_entry_ids: batchDebitSelections[group.placa]?.debits ?? [],
        coupon_ids: batchDebitSelections[group.placa]?.coupons ?? [],
      }));
    if (preview?.placa)
      return [
        {
          placa: preview.placa,
          debit_entry_ids: selectedDebitIds,
          coupon_ids: selectedCouponIds,
        },
      ];
    return [];
  }
  function activeConferenceWeek() {
    return week || batchWeek || conferenceGroups?.[0]?.semana || "";
  }
  async function saveBatchAdjustments() {
    const selectedWeek = activeConferenceWeek();
    if (!selectedWeek || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const draft = await api<DraftResponse>("/freight-closures/drafts", token, {
        method: "PUT",
        body: JSON.stringify({
          semana: selectedWeek,
          ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
          ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
          selections: batchSelectionsPayload(),
        }),
      });
      localStorage.removeItem(batchStorageKey(selectedWeek));
      setDraftLastUpdate(draft.lastUpdate);
      setSuccess(`Alterações da semana ${selectedWeek} salvas para todos os computadores.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function downloadAdjustedConference() {
    const selectedWeek = activeConferenceWeek();
    if (!selectedWeek) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        apiUrl("/freight-closures/conference/adjusted-print"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            semana: selectedWeek,
            ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
            ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
            placas: conferenceGroups?.map((group) => group.placa) ?? [],
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
      anchor.download = "conferencia-ajustada.html";
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
  async function downloadClosureHtml(
    id: number,
    kind: "freight" | "drivers",
    name: string,
    openIn: Window | null = null,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/freight-closures/week/${kind}`), {
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
    ? withSelections(preview, { debits: selectedDebitIds, coupons: selectedCouponIds })
    : null;
  const reportVehicleType = report
    ? report.manifests.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
      report.entries.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
      report.coupons.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
      null
    : null;
  const reportDriver = report
    ? report.manifests.find((row) => row.motorista)?.motorista ??
      report.entries.find((row) => row.motorista)?.motorista ??
      report.coupons.find((row) => row.motorista)?.motorista ??
      null
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
        {openReprint && (
          <button type="button" className="secondary" onClick={openReprint}>
            Reimprimir fechamentos
          </button>
        )}
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
                const selection = batchDebitSelections[current.placa] ?? { debits: [], coupons: [] };
                const currentDisplay = current.isClosed
                  ? current
                  : withSelections(current, selection);
                return (
                  <section className="panel batch-conference-panel">
                    {!filters.finalizados && <div className="batch-saved-line">
                      <span className="badge">{draftStatus}</span>
                    </div>}
                    <div ref={conferenceRef} className="filters batch-conference-heading">
                      <div>
                        <h3>
                          {batchIndex + 1} de {conferenceGroups.length} ·{" "}
                          {current.placa}
                          {current.tipoVeiculo ? ` · ${current.tipoVeiculo}` : ""}
                          {current.motorista ? ` · ${current.motorista}` : ""}
                          {current.closureNumber != null ? ` · Fechamento ${current.closureNumber}` : ""}
                          {current.isClosed ? " · FECHADO" : ""}
                        </h3>
                        <p className="muted">
                          Semana {current.semana} · {recordDate(current.periodo_inicio)} a {recordDate(current.periodo_fim)}{current.origem ? ` · Origem ${current.origem}` : ""}
                        </p>
                      </div>
                    </div>
                    <Values
                      data={currentDisplay}
                      selectableDebits={current.isClosed ? undefined : debitRows(current)}
                      selectedDebitIds={current.isClosed ? undefined : selection.debits}
                      setSelectedDebitIds={current.isClosed ? undefined : (ids) =>
                        setBatchDebitSelections((previous) => ({
                          ...previous,
                          [current.placa]: {
                            ...(previous[current.placa] ?? { debits: [], coupons: [] }),
                            debits: ids,
                          },
                        }))
                      }
                      selectableCoupons={current.isClosed ? undefined : couponRows(current)}
                      selectedCouponIds={current.isClosed ? undefined : selection.coupons}
                      setSelectedCouponIds={current.isClosed ? undefined : (ids) =>
                        setBatchDebitSelections((previous) => ({
                          ...previous,
                          [current.placa]: {
                            ...(previous[current.placa] ?? { debits: [], coupons: [] }),
                            coupons: ids,
                          },
                        }))
                      }
                      busy={busy}
                    />
                    <div className="actions batch-conference-actions">
                      <button
                        type="button"
                        className="secondary batch-compact-action"
                        disabled={busy}
                        onClick={() => void refreshConference()}
                      >
                        Atualizar dados
                      </button>
                      {filters.finalizados ? (
                        <button
                          type="button"
                          className="secondary batch-compact-action"
                          disabled={busy || current.closureNumber == null}
                          onClick={() => current.closureNumber != null && void download(
                            `/freight-reports/closures/reprint?numero=${encodeURIComponent(current.closureNumber)}`,
                            `fechamento-${current.closureNumber}.html`,
                            true,
                          )}
                        >
                          Reimprimir fechamento
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary batch-compact-action"
                          disabled={busy || !activeConferenceWeek()}
                          onClick={() => void downloadAdjustedConference()}
                        >
                          Baixar conferência
                        </button>
                      )}
                      {!current.isClosed && (
                        <button type="button" className="primary batch-compact-action" disabled={busy || !activeConferenceWeek()} onClick={saveBatchAdjustments}>
                          Salvar alterações
                        </button>
                      )}
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
                      {batchWeek && !current.isClosed && (
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
          <section className="conference-results">
          <section className="panel batch-conference-panel">
            <div className="batch-saved-line">
              <span className="badge">Seleções salvas nesta conferência</span>
            </div>
            <div ref={previewRef} className="filters batch-conference-heading">
              <div>
                <h3>
                  1 de 1 · {preview.placa}
                  {preview.tipoVeiculo ? ` · ${preview.tipoVeiculo}` : ""}
                  {preview.motorista ? ` · ${preview.motorista}` : ""}
                  {preview.closureNumber != null ? ` · Fechamento ${preview.closureNumber}` : ""}
                  {preview.isClosed ? " · FECHADO" : ""}
                </h3>
                <p className="muted">
                  Semana {preview.semana} · {recordDate(preview.periodo_inicio)} a {recordDate(preview.periodo_fim)}{preview.origem ? ` · Origem ${preview.origem}` : ""}
                </p>
              </div>
            </div>
            <Values
              data={previewDisplay}
              selectableDebits={debitRows(preview)}
              selectedDebitIds={selectedDebitIds}
              setSelectedDebitIds={setSelectedDebitIds}
              selectableCoupons={couponRows(preview)}
              selectedCouponIds={selectedCouponIds}
              setSelectedCouponIds={setSelectedCouponIds}
              busy={busy}
            />
            <div className="actions batch-conference-actions">
              <button
                type="button"
                className="secondary batch-compact-action"
                disabled={busy}
                onClick={() => void refreshPreview()}
              >
                Atualizar dados
              </button>
              <button
                className="secondary batch-compact-action"
                disabled={busy}
                onClick={() =>
                  void download(
                    `/freight-closures/preview/print?${new URLSearchParams({
                      ...(isAdmin && filters.unit.trim() ? { local: filters.unit.trim() } : {}),
                      ...(isAdmin && filters.dominio ? { dominio: filters.dominio } : {}),
                      semana: preview.semana,
                      placa: preview.placa,
                    }).toString()}`,
                    "conferencia.html",
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
                className="primary batch-compact-action"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Finalizar fechamento
              </button>
            )}
            </div>
          </section>
          </section>
        )}
      </section>
      </div>
      <section className="panel" hidden={!consultingClosures}>
        <div className="filters">
          <h2>Últimos fechamentos</h2>
          <form onSubmit={(event) => { event.preventDefault(); void load(closureSearch); }}>
          <label>
            Pesquisar fechamento
            <input
              type="search"
              inputMode="numeric"
              placeholder="Número, semana ou placa"
              value={closureSearch}
              onChange={(event) => setClosureSearch(event.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy || loading}>Pesquisar</button>
          </form>
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
        ) : !visibleClosures.length ? (
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
                {visibleClosures.map((row) => (
                  <tr key={row.id}>
                    <td>{row.numero}</td>
                    <td>
                      {row.semana ?? ""}
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
                      {row.status === "FECHADO" && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void download(
                              `/freight-closures/${row.id}/print`,
                              `fechamento-${row.numero}.html`,
                              true,
                            )
                          }
                        >
                          Reimprimir fechamento {row.numero}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
        <p className="table-footer">{visibleClosures.length} fechamentos exibidos · até 50 carregados.</p>
      </section>
      {report && (
        <section className="panel reference-form">
          <h2>
            1 de 1 · {report.cabecalho.placa}
            {reportVehicleType ? ` · ${reportVehicleType}` : ""}
            {reportDriver ? ` · ${reportDriver}` : ""}
            {` · Fechamento ${report.cabecalho.numero} · ${report.cabecalho.status}`}
          </h2>
          <p>
            Semana {report.cabecalho.semana}
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
          {report.cabecalho.status === "FECHADO" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void download(
                    `/freight-closures/${report.cabecalho.id}/print`,
                    `fechamento-${report.cabecalho.numero}.html`,
                    true,
                  )
                }
              >
                Imprimir fechamento de frete
              </button>
              <p className="muted">O relatório será aberto e baixado em HTML.</p>
            </>
          )}
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
  selectableCoupons,
  selectedCouponIds,
  setSelectedCouponIds,
  busy = false,
}: {
  data: Pick<
    Preview,
    "totals" | "payment" | "manifests" | "entries" | "coupons"
  >;
  selectableDebits?: EntryRow[];
  selectedDebitIds?: number[];
  setSelectedDebitIds?: (ids: number[]) => void;
  selectableCoupons?: CouponRow[];
  selectedCouponIds?: number[];
  setSelectedCouponIds?: (ids: number[]) => void;
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
  const couponEntries = selectableCoupons ?? data.coupons;
  const selectedCoupons = new Set(
    selectedCouponIds ?? couponEntries.map((coupon) => coupon.id),
  );
  const canSelectCoupons = !!setSelectedCouponIds;
  const selectedDebitTotal = debitEntries
    .filter((entry) => selected.has(entry.id))
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const selectedCouponTotal = couponEntries
    .filter((coupon) => selectedCoupons.has(coupon.id))
    .reduce((total, coupon) => total + decimal(coupon.valor), 0);
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
  const ctrbAdvanceEntries = [
    ...data.entries,
    ...(selectableDebits ?? []),
  ]
    .filter(
      (entry, index, entries) =>
        String(entry.codigo_despesa ?? "").trim() === "3333" &&
        entry.manifesto_id != null &&
        manifestIds.has(entry.manifesto_id) &&
        entries.findIndex((candidate) => candidate.id === entry.id) === index,
    );
  const ctrbAdvance3333 = ctrbAdvanceEntries.reduce(
    (total, entry) => total + decimal(entry.valor),
    0,
  );
  const ctrbAdvanceIds = new Set(ctrbAdvanceEntries.map((entry) => entry.id));
  const pendingDebitTotal = debitEntries
    .filter((entry) => !selected.has(entry.id) && !ctrbAdvanceIds.has(entry.id))
    .reduce((total, entry) => total + decimal(entry.valor), 0);
  const pendingCouponTotal = couponEntries
    .filter((coupon) => !selectedCoupons.has(coupon.id))
    .reduce((total, coupon) => total + decimal(coupon.valor), 0);
  const pendingValeTotal = pendingDebitTotal + pendingCouponTotal;
  const ctrbMlnTotal =
    data.manifests.reduce(
      (total, manifest) => total + decimal(manifest.valor_liquido),
      0,
    ) - ctrbAdvance3333;
  const driverCompany =
    data.payment?.primeira.empresa || "Empresa do motorista";
  const driverCompanyTotal = decimal(data.totals.total_liquido) - ctrbTotal;
  const creditRecords = [
    ...data.manifests.map((manifest) => ({
      kind: "manifest" as const,
      date: manifest.semana,
      manifestNumber: manifestWithoutUnit(manifest.manifestos),
      manifest,
    })),
    ...creditRows.map((entry) => {
      const manifest = data.manifests.find(
        (candidate) => candidate.id === entry.manifesto_id,
      );
      return {
        kind: "entry" as const,
        // O manifesto define em qual semana o crédito será fechado, mas a
        // coluna Data deve sempre preservar a data original do lançamento.
        date: entry.data_lancamento,
        manifestNumber: manifestWithoutUnit(
          manifest?.manifestos ?? entry.manifesto_numero ?? "",
        ),
        entry,
      };
    }),
  ].sort(
    (a, b) =>
      recordTime(a.date) - recordTime(b.date) ||
      a.manifestNumber.localeCompare(b.manifestNumber, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }) ||
      (a.kind === b.kind ? 0 : a.kind === "manifest" ? -1 : 1) ||
      (a.kind === "entry" && b.kind === "entry"
        ? recordTime(a.entry.data_lancamento) - recordTime(b.entry.data_lancamento) ||
          a.entry.id - b.entry.id
        : 0),
  );
  const ctrbRows = data.manifests
    .filter((manifest) => String(manifest.ctrb_numero ?? "").trim())
    .map((manifest) => ({ numero: manifest.ctrb_numero!, manifest }))
    .sort(
      (a, b) => recordTime(a.manifest?.semana) - recordTime(b.manifest?.semana),
    );
  const debitRecords = [
    ...[
      ...debitEntries,
      ...ctrbAdvanceEntries.filter(
        (advance) => !debitEntries.some((entry) => entry.id === advance.id),
      ),
    ].map((entry) => ({
      kind: "entry" as const,
      date: entry.data_lancamento,
      entry,
    })),
    ...couponEntries.map((coupon) => ({
      kind: "coupon" as const,
      date: coupon.data_cobranca,
      coupon,
    })),
  ].sort((a, b) => {
    const aCtrb = a.kind === "entry" &&
      String(a.entry.codigo_despesa ?? "").trim() === "3333";
    const bCtrb = b.kind === "entry" &&
      String(b.entry.codigo_despesa ?? "").trim() === "3333";
    return Number(aCtrb) - Number(bCtrb) ||
      recordTime(a.date) - recordTime(b.date) ||
      (a.kind === "entry" ? a.entry.id : a.coupon.id) -
        (b.kind === "entry" ? b.entry.id : b.coupon.id);
  });
  const manifestValue = (manifest: ManifestRow, fields: (keyof ManifestRow)[]) =>
    fields.reduce((total, field) => total + Number(manifest[field] ?? 0), 0);
  const manifestDetails = [...data.manifests].sort(
    (left, right) =>
      recordTime(left.semana) - recordTime(right.semana) ||
      manifestWithoutUnit(left.manifestos).localeCompare(
        manifestWithoutUnit(right.manifestos),
        "pt-BR",
        { numeric: true, sensitivity: "base" },
      ),
  );
  const toggleDebit = (id: number, checked: boolean) => {
    if (!setSelectedDebitIds) return;
    const next = new Set(selectedDebitIds ?? []);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedDebitIds([...next]);
  };
  const setAllDebits = () =>
    setSelectedDebitIds?.(debitEntries.map((entry) => entry.id));
  const toggleCoupon = (id: number, checked: boolean) => {
    if (!setSelectedCouponIds) return;
    const next = new Set(selectedCouponIds ?? []);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedCouponIds([...next]);
  };

  return (
    <>
      <section className="closure-records-compact">
        <h3>Registros do fechamento</h3>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Créditos e manifestos</strong>
          </div>
          <table>
            <thead><tr><th>Data</th><th>ID Lanç/Uni</th><th>Manifesto / Descrição</th><th>Horário</th><th>Destino</th><th>Usuário</th><th className="right">Valor</th></tr></thead>
            <tbody>
              {creditRecords.map((record) => record.kind === "manifest" ? (
                <tr key={`m${record.manifest.id}`}><td>{recordDate(record.date)}</td><td>{record.manifest.unit ?? ""}</td><td>{manifestWithoutUnit(record.manifest.manifestos)}</td><td>{recordHour(record.manifest.hora)}</td><td>{record.manifest.destino || ""}</td><td></td><td className="right">{money(record.manifest.frete_veiculo)}</td></tr>
              ) : (
                <tr key={`e${record.entry.id}`} className="closure-credit-entry">
                  <td>{recordDate(record.date)}</td>
                  <td>{entryIdentifier(record.entry)}</td>
                  <td colSpan={3} className="closure-entry-description">
                    <span>{entryManifestNumber(record.entry, data.manifests)}</span>
                    <small>{entryDescription(record.entry)}</small>
                  </td>
                  <td>{record.entry.responsavel_cod ?? ""}</td>
                  <td className="right">{money(record.entry.valor)}</td>
                </tr>
              ))}
              {!data.manifests.length && !creditRows.length && <tr><td colSpan={7}>Nenhum crédito ou manifesto.</td></tr>}
            </tbody>
            <tfoot><tr className="closure-record-total"><td colSpan={6}>Total de créditos e manifestos</td><td className="right">{money(moneyValue(creditsAndManifestsTotal))}</td></tr></tfoot>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title">
            <strong>Informações dos manifestos</strong>
          </div>
          <table className="closure-manifest-details-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Manifesto</th>
                <th className="right">Valor do frete</th>
                <th className="right">Fretes não feitos</th>
                <th className="right">Adicionais</th>
                <th className="right">Total</th>
                <th className="right">Perc. inicial</th>
                <th className="right">Perc. final</th>
              </tr>
            </thead>
            <tbody>
              {manifestDetails.map((manifest) => {
                const freight = manifestValue(manifest, [
                  "cod_777_15",
                  "cod_888_25",
                  "cod_999_100",
                ]);
                const notFreight = manifestValue(manifest, [
                  "nao_777_calc",
                  "nao_888_calc",
                  "nao_999_calc",
                ]);
                const additions = manifestValue(manifest, [
                  "diaria",
                  "tde",
                  "escada",
                  "paletização",
                  "estadia",
                  "descarga",
                  "outros",
                ]);
                const total = freight - notFreight + additions;
                return (
                  <tr key={`manifest-detail-${manifest.id}`}>
                    <td>{recordDate(manifest.semana)}</td>
                    <td>{manifest.unit ?? ""} - {manifestWithoutUnit(manifest.manifestos)}</td>
                    <td className="right">{money(moneyValue(freight))}</td>
                    <td className="right">{money(moneyValue(notFreight))}</td>
                    <td className="right">{money(moneyValue(additions))}</td>
                    <td className="right">{money(moneyValue(total))}</td>
                    <td className="right">{percentage(manifest.carreg_perc ?? manifest.perc_carreg)}</td>
                    <td className="right">{percentage(manifest.perc_final ?? manifest.final_perc)}</td>
                  </tr>
                );
              })}
              {!manifestDetails.length && (
                <tr><td colSpan={8}>Nenhum manifesto registrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="closure-record-list">
          <div className="closure-record-title"><strong>CTRBs</strong></div>
          <table className="closure-ctrb-table">
            <thead><tr><th>Data</th><th>Manifesto</th><th>CTRB</th><th className="right">Adiantamento</th><th className="right">Vale-pedágio</th><th className="right">SEST/SENAT</th><th className="right">IRRF</th><th className="right">Prev. Social</th><th className="right">INSS</th><th className="right">Valor líquido</th><th className="right">Valor CTRB</th></tr></thead>
            <tbody>
              {ctrbRows.map(({ numero, manifest }) => <tr key={manifest.id}>
                <td>{recordDate(manifest?.semana)}</td>
                <td>{manifest ? manifestWithoutUnit(manifest.manifestos) : ""}</td>
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
          {(canSelectDebits || canSelectCoupons) && (debitEntries.length > 0 || couponEntries.length > 0) && (
            <div className="closure-record-actions">
              <button
                type="button"
                className="text-button"
                disabled={
                  busy || (debitEntries.every((entry) => selected.has(entry.id)) &&
                    couponEntries.every((coupon) => selectedCoupons.has(coupon.id)))
                }
                onClick={() => {
                  setAllDebits();
                  setSelectedCouponIds?.(couponEntries.map((coupon) => coupon.id));
                }}
              >
                Selecionar todos
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy || (!selected.size && !selectedCoupons.size)}
                onClick={() => {
                  setSelectedDebitIds?.([]);
                  setSelectedCouponIds?.([]);
                }}
              >
                Limpar seleção
              </button>
            </div>
          )}
          <table>
            <thead><tr><th>Data</th><th>ID</th><th>Manifesto</th><th>Tipo</th><th>Despesa</th><th>Descrição</th><th>Usuário</th><th className="right">Valor</th></tr></thead>
            <tbody>
              {debitRecords.map((record) => record.kind === "entry" ? (
                <tr
                  key={`d${record.entry.id}`}
                  className={
                    ctrbAdvanceEntries.some((entry) => entry.id === record.entry.id) ||
                    selected.has(record.entry.id)
                      ? ""
                      : "muted-row"
                  }
                >
                  <td>{recordDate(record.date)}</td>
                  <td>
                    {ctrbAdvanceEntries.some((entry) => entry.id === record.entry.id) ? (
                      entryIdentifier(record.entry)
                    ) : canSelectDebits ? (
                      <><input
                          type="checkbox"
                          checked={selected.has(record.entry.id)}
                          disabled={busy}
                          aria-label={`Descontar vale ${valeIdentifier(record.entry)}`}
                          onChange={(event) =>
                            toggleDebit(record.entry.id, event.target.checked)
                          }
                        /> {entryIdentifier(record.entry)}</>
                    ) : (
                      entryIdentifier(record.entry)
                    )}
                  </td>
                  <td>{entryManifestNumber(record.entry, data.manifests)}</td>
                  <td>{ctrbAdvanceEntries.some((entry) => entry.id === record.entry.id) ? "CTRB" : "Vale"}</td>
                  <td>{entryDescription(record.entry)}</td>
                  <td>{record.entry.descricao || ""}{ctrbAdvanceEntries.some((entry) => entry.id === record.entry.id) ? " · subtrai do CTRB" : ""}</td>
                  <td>{record.entry.responsavel_cod ?? ""}</td>
                  <td className="right">{money(record.entry.valor)}</td>
                </tr>
              ) : (
                <tr key={`c${record.coupon.id}`} className={selectedCoupons.has(record.coupon.id) ? "" : "muted-row"}>
                  <td>{recordDate(record.date)}</td>
                  <td>
                    {canSelectCoupons && <input type="checkbox" checked={selectedCoupons.has(record.coupon.id)} disabled={busy} aria-label={`Descontar cupom ${valeIdentifier(record.coupon)}`} onChange={(event) => toggleCoupon(record.coupon.id, event.target.checked)} />}{" "}
                    {valeIdentifier(record.coupon)}
                  </td>
                  <td></td>
                  <td>Cupom</td>
                  <td>{couponExpense(record.coupon)}</td>
                  <td>{record.coupon.descricao || ""}</td>
                  <td>{record.coupon.responsavel_cod ?? ""}</td>
                  <td className="right">{money(record.coupon.valor)}</td>
                </tr>
              ))}
              {!debitEntries.length && !couponEntries.length && <tr><td colSpan={8}>Nenhum vale ou cupom.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="closure-record-pending"><td colSpan={7}>Vales pendentes</td><td className="right">{money(moneyValue(pendingValeTotal))}</td></tr>
              <tr className="closure-record-total"><td colSpan={7}>Total de vales e cupons selecionados</td><td className="right">{money(moneyValue(selectedDebitTotal + selectedCouponTotal))}</td></tr>
              {ctrbAdvanceEntries.length > 0 && (
                <tr className="closure-record-total"><td colSpan={7}>Total 3333 descontado do CTRB</td><td className="right">{money(moneyValue(ctrbAdvance3333))}</td></tr>
              )}
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
                <dd className={decimal(value) < 0 ? "negative-value" : undefined}>
                  {money(value)}
                </dd>
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
